use crane_core::db::Database;
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

    // Parse URL to extract domain and derive filename
    let parsed_url = match url::Url::parse(url_str) {
        Ok(u) => u,
        Err(e) => {
            return serde_json::json!({
                "type": "error",
                "message": format!("Invalid URL: {e}")
            });
        }
    };

    let source_domain = parsed_url.host_str().map(|h| h.to_string());

    // Use provided filename or derive from URL path
    let filename = msg
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
        .map(|s| s.to_string());

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
        assert_eq!(dl.save_path, "/downloads/report.pdf");
        assert_eq!(dl.total_size, Some(123456));
        assert_eq!(dl.status, DownloadStatus::Pending);
        assert_eq!(dl.category, FileCategory::Documents);
        assert_eq!(dl.referrer.as_deref(), Some("https://example.com/page"));
        assert_eq!(dl.mime_type.as_deref(), Some("application/pdf"));
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
}
