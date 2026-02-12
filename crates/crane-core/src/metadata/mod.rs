pub mod analyzer;
pub mod mime;

use std::path::Path;

/// Sanitize a filename to prevent path traversal attacks.
///
/// Strips directory components, rejects traversal sequences (`..`),
/// removes leading dots (hidden files), and replaces path separators.
/// Returns `"download"` if the result would be empty.
/// Check if the server's Content-Type is suspiciously different from what we expect.
/// Returns Err if the response looks like a captive portal or error page.
pub fn validate_content_type(
    response_content_type: Option<&str>,
    expected_filename: &str,
) -> Result<(), crate::types::CraneError> {
    let response_ct = match response_content_type {
        Some(ct) => ct.to_ascii_lowercase(),
        None => return Ok(()), // No Content-Type header = can't validate
    };

    // Extract the base MIME type (before ;charset=... etc)
    let response_mime = response_ct.split(';').next().unwrap_or("").trim();

    // If the server returned text/html but the expected file is NOT .html/.htm,
    // this is almost certainly a captive portal or error page.
    if response_mime == "text/html" {
        let ext = std::path::Path::new(expected_filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        match ext.as_str() {
            "html" | "htm" | "xhtml" | "mhtml" => Ok(()),
            _ => Err(crate::types::CraneError::ContentTypeMismatch {
                expected: format!("binary or matching type for .{ext}"),
                actual: response_mime.to_string(),
            }),
        }
    } else {
        Ok(())
    }
}

pub fn sanitize_filename(name: &str) -> String {
    // First, try to extract just the file_name component.
    // Path::file_name() returns None for "..", ".", or empty strings,
    // and strips all leading directory components (including absolute paths).
    let base = Path::new(name)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("");

    // Replace any remaining path separators (e.g. from URL-decoded %2F)
    let cleaned = base.replace(['/', '\\'], "_");

    // Strip leading dots to prevent hidden files
    let cleaned = cleaned.trim_start_matches('.');

    // Strip control characters and null bytes
    let cleaned: String = cleaned.chars().filter(|c| !c.is_control()).collect();

    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_content_type_html_for_zip() {
        let result = validate_content_type(Some("text/html"), "archive.zip");
        assert!(result.is_err());
        match result.unwrap_err() {
            crate::types::CraneError::ContentTypeMismatch { expected, actual } => {
                assert!(expected.contains(".zip"));
                assert_eq!(actual, "text/html");
            }
            other => panic!("expected ContentTypeMismatch, got: {other:?}"),
        }
    }

    #[test]
    fn test_validate_content_type_html_for_html() {
        assert!(validate_content_type(Some("text/html"), "page.html").is_ok());
    }

    #[test]
    fn test_validate_content_type_binary_for_zip() {
        assert!(validate_content_type(Some("application/octet-stream"), "archive.zip").is_ok());
    }

    #[test]
    fn test_validate_content_type_none() {
        assert!(validate_content_type(None, "archive.zip").is_ok());
    }

    #[test]
    fn test_validate_content_type_html_with_charset() {
        assert!(validate_content_type(Some("text/html; charset=utf-8"), "installer.exe").is_err());
    }

    #[test]
    fn test_validate_content_type_htm_extension() {
        assert!(validate_content_type(Some("text/html"), "page.htm").is_ok());
    }

    #[test]
    fn test_validate_content_type_xhtml_extension() {
        assert!(validate_content_type(Some("text/html"), "page.xhtml").is_ok());
    }

    #[test]
    fn test_validate_content_type_no_extension() {
        assert!(validate_content_type(Some("text/html"), "somefile").is_err());
    }

    #[test]
    fn test_sanitize_normal_filename() {
        assert_eq!(sanitize_filename("report.pdf"), "report.pdf");
    }

    #[test]
    fn test_sanitize_path_traversal() {
        assert_eq!(sanitize_filename("../../.ssh/authorized_keys"), "authorized_keys");
    }

    #[test]
    fn test_sanitize_absolute_path() {
        assert_eq!(sanitize_filename("/etc/passwd"), "passwd");
    }

    #[test]
    fn test_sanitize_windows_absolute_path() {
        // On Unix, this is a regular filename with backslash; file_name() extracts after last separator
        let result = sanitize_filename("C:\\Windows\\System32\\cmd.exe");
        assert!(!result.contains('\\'));
        assert!(!result.is_empty());
    }

    #[test]
    fn test_sanitize_dotdot_only() {
        assert_eq!(sanitize_filename(".."), "download");
    }

    #[test]
    fn test_sanitize_dot_only() {
        assert_eq!(sanitize_filename("."), "download");
    }

    #[test]
    fn test_sanitize_empty() {
        assert_eq!(sanitize_filename(""), "download");
    }

    #[test]
    fn test_sanitize_hidden_file() {
        assert_eq!(sanitize_filename(".bashrc"), "bashrc");
    }

    #[test]
    fn test_sanitize_embedded_slash() {
        assert_eq!(sanitize_filename("foo/bar/baz.txt"), "baz.txt");
    }

    #[test]
    fn test_sanitize_url_decoded_traversal() {
        // Simulates what happens after URL decoding of %2F
        assert_eq!(sanitize_filename("../../../etc/cron.d/backdoor"), "backdoor");
    }

    #[test]
    fn test_sanitize_preserves_spaces_and_unicode() {
        assert_eq!(sanitize_filename("my report (2026).pdf"), "my report (2026).pdf");
        assert_eq!(sanitize_filename("日本語ファイル.txt"), "日本語ファイル.txt");
    }

    #[test]
    fn test_sanitize_null_bytes() {
        assert_eq!(sanitize_filename("file\0.txt"), "file.txt");
    }
}
