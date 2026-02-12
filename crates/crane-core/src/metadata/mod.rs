pub mod analyzer;
pub mod mime;

use std::path::Path;

/// Sanitize a filename to prevent path traversal attacks.
///
/// Strips directory components, rejects traversal sequences (`..`),
/// removes leading dots (hidden files), and replaces path separators.
/// Returns `"download"` if the result would be empty.
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
