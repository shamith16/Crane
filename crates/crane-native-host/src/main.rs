use crane_core::db::Database;
use crane_core::metadata::sanitize_filename;
use crane_core::types::{Download, DownloadStatus, FileCategory};
use std::io::{self, Read, Write};
use std::path::PathBuf;

const MAX_MESSAGE_SIZE: u32 = 1_048_576; // 1 MB

/// Read a native messaging message from the given reader.
///
/// Chrome native messaging protocol: 4-byte native-endian length prefix,
/// followed by that many bytes of UTF-8 JSON.
/// Returns `Ok(None)` on EOF, `Err` on invalid data.
fn read_message<R: Read>(reader: &mut R) -> io::Result<Option<serde_json::Value>> {
    let mut len_bytes = [0u8; 4];
    match reader.read_exact(&mut len_bytes) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    let len = u32::from_ne_bytes(len_bytes);
    if len == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message length is 0",
        ));
    }
    if len > MAX_MESSAGE_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("message too large: {len} bytes (max {MAX_MESSAGE_SIZE})"),
        ));
    }

    let mut buf = vec![0u8; len as usize];
    reader.read_exact(&mut buf)?;

    let value: serde_json::Value = serde_json::from_slice(&buf)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("invalid JSON: {e}")))?;

    Ok(Some(value))
}

/// Write a native messaging message to the given writer.
///
/// Serializes JSON, writes 4-byte native-endian length prefix + JSON bytes, flushes.
fn write_message<W: Write>(writer: &mut W, msg: &serde_json::Value) -> io::Result<()> {
    let payload = serde_json::to_vec(msg).map_err(|e| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("JSON serialize error: {e}"),
        )
    })?;
    let len = payload.len() as u32;
    writer.write_all(&len.to_ne_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()
}

/// Categorize a MIME type into a FileCategory.
fn categorize_mime(mime: Option<&str>) -> FileCategory {
    match mime {
        Some(m) if m.starts_with("video/") => FileCategory::Video,
        Some(m) if m.starts_with("audio/") => FileCategory::Audio,
        Some(m) if m.starts_with("image/") => FileCategory::Images,
        Some("application/pdf")
        | Some("application/msword")
        | Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        | Some("application/vnd.ms-excel")
        | Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        | Some("text/plain")
        | Some("text/csv") => FileCategory::Documents,
        Some("application/zip")
        | Some("application/x-rar-compressed")
        | Some("application/gzip")
        | Some("application/x-7z-compressed")
        | Some("application/x-tar")
        | Some("application/x-bzip2") => FileCategory::Archives,
        Some("application/x-msdownload")
        | Some("application/x-apple-diskimage")
        | Some("application/x-deb")
        | Some("application/x-rpm") => FileCategory::Software,
        _ => FileCategory::Other,
    }
}

/// Cookie names that are considered sensitive and should not be persisted to the database.
const SENSITIVE_COOKIE_NAMES: &[&str] = &[
    "session", "sessionid", "session_id", "sid",
    "token", "access_token", "refresh_token", "auth_token",
    "jwt", "authorization", "auth",
    "csrf", "csrftoken", "xsrf-token", "_csrf",
    "connect.sid", "phpsessid", "jsessionid", "asp.net_sessionid",
];

/// Filter out sensitive cookies (session tokens, auth tokens) before database storage.
/// Keeps only non-sensitive cookies like preferences (theme, language, etc.).
fn filter_sensitive_cookies(cookies: &str) -> String {
    cookies
        .split(';')
        .filter_map(|cookie| {
            let trimmed = cookie.trim();
            if trimmed.is_empty() {
                return None;
            }
            let name = trimmed.split('=').next()?.trim().to_ascii_lowercase();
            if SENSITIVE_COOKIE_NAMES.iter().any(|&s| name == s) {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// Handle a single incoming native message and produce a response.
fn handle_message(msg: &serde_json::Value, db: &Database, save_dir: &str) -> serde_json::Value {
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match msg_type {
        "ping" => {
            serde_json::json!({
                "type": "pong",
                "version": "0.1.0"
            })
        }
        "download" => handle_download(msg, db, save_dir),
        other => {
            serde_json::json!({
                "type": "error",
                "message": format!("Unknown message type: '{other}'")
            })
        }
    }
}

/// Handle a "download" message: validate, insert into DB, return response.
fn handle_download(msg: &serde_json::Value, db: &Database, save_dir: &str) -> serde_json::Value {
    let url_str = match msg.get("url").and_then(|v| v.as_str()) {
        Some(u) => u,
        None => {
            return serde_json::json!({
                "type": "error",
                "message": "Missing required field: 'url'"
            });
        }
    };

    // Parse and validate URL (scheme + host safety)
    let parsed_url = match url::Url::parse(url_str) {
        Ok(u) => u,
        Err(e) => {
            return serde_json::json!({
                "type": "error",
                "message": format!("Invalid URL: {e}")
            });
        }
    };

    // Only allow http/https/ftp/ftps URLs
    match parsed_url.scheme() {
        "http" | "https" | "ftp" | "ftps" => {}
        scheme => {
            return serde_json::json!({
                "type": "error",
                "message": format!("Unsupported URL scheme: '{scheme}'. Only http, https, ftp, and ftps are allowed.")
            });
        }
    }

    let source_domain = parsed_url.host_str().map(|h| h.to_string());

    // Use provided filename or derive from URL path, then sanitize
    // to prevent path traversal attacks (e.g., "../../.ssh/authorized_keys").
    let raw_filename = msg
        .get("filename")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            parsed_url
                .path_segments()
                .and_then(|mut segs| segs.next_back())
                .filter(|s| !s.is_empty())
                .unwrap_or("download")
                .to_string()
        });
    let filename = sanitize_filename(&raw_filename);

    let file_size = msg.get("fileSize").and_then(|v| v.as_u64());

    let mime_type = msg
        .get("mimeType")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let referrer = msg
        .get("referrer")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let cookies = msg
        .get("cookies")
        .and_then(|v| v.as_str())
        .map(filter_sensitive_cookies);

    let category = categorize_mime(mime_type.as_deref());

    let save_path = PathBuf::from(save_dir).join(&filename);

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let download = Download {
        id: id.clone(),
        url: url_str.to_string(),
        filename,
        save_path: save_path.to_string_lossy().to_string(),
        total_size: file_size,
        downloaded_size: 0,
        status: DownloadStatus::Pending,
        error_message: None,
        error_code: None,
        mime_type,
        category,
        resumable: false,
        connections: 1,
        speed: 0.0,
        source_domain,
        referrer,
        cookies,
        user_agent: None,
        queue_position: None,
        retry_count: 0,
        created_at: now.clone(),
        started_at: None,
        completed_at: None,
        updated_at: now,
    };

    match db.insert_download(&download) {
        Ok(()) => {
            serde_json::json!({
                "type": "accepted",
                "downloadId": id
            })
        }
        Err(e) => {
            serde_json::json!({
                "type": "error",
                "message": format!("Failed to insert download: {e}")
            })
        }
    }
}

fn main() {
    // Open database at standard location
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("crane");
    let db_path = data_dir.join("crane.db");

    let db = Database::open(&db_path).unwrap_or_else(|e| {
        eprintln!("Failed to open database at {}: {e}", db_path.display());
        std::process::exit(1);
    });

    // Determine save directory
    let save_dir = dirs::download_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("Downloads"))
                .unwrap_or_else(|| PathBuf::from("."))
        })
        .to_string_lossy()
        .to_string();

    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout().lock();

    loop {
        match read_message(&mut stdin) {
            Ok(Some(msg)) => {
                let response = handle_message(&msg, &db, &save_dir);
                if let Err(e) = write_message(&mut stdout, &response) {
                    eprintln!("Failed to write response: {e}");
                    break;
                }
            }
            Ok(None) => break, // EOF
            Err(e) => {
                eprintln!("Failed to read message: {e}");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_read_write_message_roundtrip() {
        let original = serde_json::json!({"type": "ping", "data": 42});

        let mut buf = Vec::new();
        write_message(&mut buf, &original).unwrap();

        let mut cursor = Cursor::new(buf);
        let result = read_message(&mut cursor).unwrap();

        assert_eq!(result, Some(original));
    }

    #[test]
    fn test_read_message_eof_returns_none() {
        let mut cursor = Cursor::new(Vec::<u8>::new());
        let result = read_message(&mut cursor).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_read_message_invalid_json() {
        let garbage = b"not json at all!";
        let len = garbage.len() as u32;

        let mut buf = Vec::new();
        buf.extend_from_slice(&len.to_ne_bytes());
        buf.extend_from_slice(garbage);

        let mut cursor = Cursor::new(buf);
        let result = read_message(&mut cursor);

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_handle_ping() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({"type": "ping"});
        let response = handle_message(&msg, &db, "/tmp");

        assert_eq!(response["type"], "pong");
        assert_eq!(response["version"], "0.1.0");
    }

    #[test]
    fn test_handle_download_inserts_row() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "https://example.com/report.pdf",
            "filename": "report.pdf",
            "fileSize": 123456,
            "mimeType": "application/pdf",
            "referrer": "https://example.com/page"
        });

        let response = handle_message(&msg, &db, "/downloads");

        assert_eq!(response["type"], "accepted");
        let download_id = response["downloadId"].as_str().unwrap();

        // Verify the row was inserted
        let dl = db.get_download(download_id).unwrap();
        assert_eq!(dl.url, "https://example.com/report.pdf");
        assert_eq!(dl.filename, "report.pdf");
        let expected_path = std::path::PathBuf::from("/downloads").join("report.pdf");
        assert_eq!(dl.save_path, expected_path.to_string_lossy());
        assert_eq!(dl.total_size, Some(123456));
        assert_eq!(dl.status, DownloadStatus::Pending);
        assert_eq!(dl.category, FileCategory::Documents);
        assert_eq!(dl.referrer.as_deref(), Some("https://example.com/page"));
        assert_eq!(dl.mime_type.as_deref(), Some("application/pdf"));
    }

    #[test]
    fn test_handle_download_path_traversal_filename() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "https://evil.com/payload",
            "filename": "../../.ssh/authorized_keys"
        });

        let response = handle_message(&msg, &db, "/downloads");

        assert_eq!(response["type"], "accepted");
        let download_id = response["downloadId"].as_str().unwrap();
        let dl = db.get_download(download_id).unwrap();

        // Filename should be sanitized to just "authorized_keys"
        assert_eq!(dl.filename, "authorized_keys");
        assert!(
            dl.save_path.starts_with("/downloads"),
            "save_path should stay within /downloads, got: {}",
            dl.save_path
        );
        assert!(!dl.save_path.contains(".."));
    }

    #[test]
    fn test_handle_download_absolute_path_filename() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "https://evil.com/payload",
            "filename": "/etc/cron.d/backdoor"
        });

        let response = handle_message(&msg, &db, "/downloads");

        assert_eq!(response["type"], "accepted");
        let download_id = response["downloadId"].as_str().unwrap();
        let dl = db.get_download(download_id).unwrap();

        // Filename should be sanitized to just "backdoor"
        assert_eq!(dl.filename, "backdoor");
        assert!(dl.save_path.starts_with("/downloads"));
    }

    #[test]
    fn test_handle_download_dotdot_filename() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "https://evil.com/payload",
            "filename": ".."
        });

        let response = handle_message(&msg, &db, "/downloads");

        assert_eq!(response["type"], "accepted");
        let download_id = response["downloadId"].as_str().unwrap();
        let dl = db.get_download(download_id).unwrap();

        // ".." should be sanitized to "download"
        assert_eq!(dl.filename, "download");
    }

    #[test]
    fn test_handle_download_missing_url() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "filename": "file.bin"
        });

        let response = handle_message(&msg, &db, "/tmp");

        assert_eq!(response["type"], "error");
        assert!(response["message"].as_str().unwrap().contains("url"));
    }

    #[test]
    fn test_handle_unknown_type() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({"type": "foobar"});

        let response = handle_message(&msg, &db, "/tmp");

        assert_eq!(response["type"], "error");
        let err_msg = response["message"].as_str().unwrap();
        assert!(err_msg.contains("Unknown message type"));
        assert!(err_msg.contains("foobar"));
    }

    #[test]
    fn test_categorize_mime() {
        assert_eq!(categorize_mime(Some("video/mp4")), FileCategory::Video);
        assert_eq!(categorize_mime(Some("audio/mpeg")), FileCategory::Audio);
        assert_eq!(categorize_mime(Some("image/png")), FileCategory::Images);
        assert_eq!(
            categorize_mime(Some("application/pdf")),
            FileCategory::Documents
        );
        assert_eq!(
            categorize_mime(Some("application/zip")),
            FileCategory::Archives
        );
        assert_eq!(categorize_mime(None), FileCategory::Other);
    }

    #[test]
    fn test_handle_download_accepts_ftp() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "ftp://example.com/file.txt"
        });

        let response = handle_message(&msg, &db, "/downloads");
        assert_eq!(response["type"], "accepted");
    }

    #[test]
    fn test_handle_download_rejects_gopher() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "gopher://example.com/file.txt"
        });

        let response = handle_message(&msg, &db, "/downloads");
        assert_eq!(response["type"], "error");
        assert!(response["message"]
            .as_str()
            .unwrap()
            .contains("Unsupported URL scheme"));
    }

    #[test]
    fn test_handle_download_rejects_javascript() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "javascript:alert(1)"
        });

        let response = handle_message(&msg, &db, "/downloads");
        assert_eq!(response["type"], "error");
    }

    #[test]
    fn test_handle_download_rejects_file_scheme() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "file:///etc/passwd"
        });

        let response = handle_message(&msg, &db, "/downloads");
        assert_eq!(response["type"], "error");
        assert!(response["message"]
            .as_str()
            .unwrap()
            .contains("Unsupported URL scheme"));
    }

    #[test]
    fn test_filter_sensitive_cookies() {
        // Keeps non-sensitive cookies
        assert_eq!(
            filter_sensitive_cookies("theme=dark; language=en"),
            "theme=dark; language=en"
        );

        // Strips session cookies
        assert_eq!(
            filter_sensitive_cookies("theme=dark; session=abc123; language=en"),
            "theme=dark; language=en"
        );

        // Strips auth tokens (case-insensitive)
        assert_eq!(
            filter_sensitive_cookies("token=xyz; theme=dark"),
            "theme=dark"
        );

        // Strips JWT
        assert_eq!(
            filter_sensitive_cookies("jwt=eyJ...; preference=compact"),
            "preference=compact"
        );

        // Strips multiple sensitive cookies
        let result = filter_sensitive_cookies("sessionid=abc; csrf=def; theme=dark");
        assert_eq!(result, "theme=dark");

        // Empty input
        assert_eq!(filter_sensitive_cookies(""), "");

        // All cookies are sensitive
        assert_eq!(filter_sensitive_cookies("session=abc; token=def"), "");
    }

    #[test]
    fn test_handle_download_filters_cookies_in_db() {
        let db = Database::open_in_memory().unwrap();
        let msg = serde_json::json!({
            "type": "download",
            "url": "https://example.com/file.zip",
            "cookies": "session=secret123; theme=dark; token=abc"
        });

        let response = handle_message(&msg, &db, "/downloads");
        assert_eq!(response["type"], "accepted");

        let download_id = response["downloadId"].as_str().unwrap();
        let dl = db.get_download(download_id).unwrap();

        // Only non-sensitive cookies should be stored
        let stored_cookies = dl.cookies.as_deref().unwrap();
        assert!(!stored_cookies.contains("session"));
        assert!(!stored_cookies.contains("token"));
        assert!(stored_cookies.contains("theme=dark"));
    }
}
