use crate::types::FileCategory;

pub fn categorize_mime(mime: &str) -> FileCategory {
    let mime_lower = mime.to_lowercase();

    match mime_lower.as_str() {
        m if m.starts_with("application/pdf") => FileCategory::Documents,
        m if m.starts_with("application/msword") => FileCategory::Documents,
        m if m.contains("spreadsheet") || m.contains("excel") => FileCategory::Documents,
        m if m.contains("presentation") || m.contains("powerpoint") => FileCategory::Documents,
        m if m.contains("document") => FileCategory::Documents,
        m if m.starts_with("text/") && !m.contains("html") => FileCategory::Documents,
        "application/epub+zip" => FileCategory::Documents,
        "application/rtf" => FileCategory::Documents,

        m if m.starts_with("video/") => FileCategory::Video,
        "application/x-matroska" => FileCategory::Video,

        m if m.starts_with("audio/") => FileCategory::Audio,

        m if m.starts_with("image/") => FileCategory::Images,

        "application/zip" => FileCategory::Archives,
        "application/x-rar-compressed" => FileCategory::Archives,
        "application/x-7z-compressed" => FileCategory::Archives,
        "application/gzip" | "application/x-gzip" => FileCategory::Archives,
        "application/x-tar" => FileCategory::Archives,
        "application/x-bzip2" => FileCategory::Archives,
        "application/x-xz" => FileCategory::Archives,
        "application/x-lzma" => FileCategory::Archives,
        "application/zstd" => FileCategory::Archives,

        "application/x-executable" => FileCategory::Software,
        "application/x-msdos-program" => FileCategory::Software,
        "application/x-msdownload" => FileCategory::Software,
        "application/vnd.microsoft.portable-executable" => FileCategory::Software,
        "application/x-apple-diskimage" => FileCategory::Software,
        "application/vnd.debian.binary-package" => FileCategory::Software,
        "application/x-rpm" => FileCategory::Software,
        "application/x-msi" => FileCategory::Software,
        "application/x-iso9660-image" => FileCategory::Software,

        _ => FileCategory::Other,
    }
}

pub fn categorize_extension(filename: &str) -> FileCategory {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();

    match ext.as_str() {
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp"
        | "rtf" | "txt" | "csv" | "epub" | "mobi" => FileCategory::Documents,

        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg"
        | "3gp" | "ts" => FileCategory::Video,

        "mp3" | "flac" | "wav" | "aac" | "ogg" | "wma" | "m4a" | "opus" | "aiff" => {
            FileCategory::Audio
        }

        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "tiff" | "ico" | "heic"
        | "heif" | "avif" | "raw" => FileCategory::Images,

        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" | "lz" | "lzma" | "cab"
        | "tgz" => FileCategory::Archives,

        "exe" | "msi" | "dmg" | "pkg" | "deb" | "rpm" | "appimage" | "snap" | "flatpak"
        | "iso" | "img" => FileCategory::Software,

        _ => FileCategory::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mime_pdf() {
        assert_eq!(categorize_mime("application/pdf"), FileCategory::Documents);
    }

    #[test]
    fn test_mime_msword() {
        assert_eq!(categorize_mime("application/msword"), FileCategory::Documents);
    }

    #[test]
    fn test_mime_spreadsheet() {
        assert_eq!(
            categorize_mime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            FileCategory::Documents
        );
    }

    #[test]
    fn test_mime_plain_text() {
        assert_eq!(categorize_mime("text/plain"), FileCategory::Documents);
    }

    #[test]
    fn test_mime_html_not_document() {
        assert_eq!(categorize_mime("text/html"), FileCategory::Other);
    }

    #[test]
    fn test_mime_video_mp4() {
        assert_eq!(categorize_mime("video/mp4"), FileCategory::Video);
    }

    #[test]
    fn test_mime_audio_mpeg() {
        assert_eq!(categorize_mime("audio/mpeg"), FileCategory::Audio);
    }

    #[test]
    fn test_mime_image_png() {
        assert_eq!(categorize_mime("image/png"), FileCategory::Images);
    }

    #[test]
    fn test_mime_zip() {
        assert_eq!(categorize_mime("application/zip"), FileCategory::Archives);
    }

    #[test]
    fn test_mime_7z() {
        assert_eq!(
            categorize_mime("application/x-7z-compressed"),
            FileCategory::Archives
        );
    }

    #[test]
    fn test_mime_executable() {
        assert_eq!(
            categorize_mime("application/x-msdownload"),
            FileCategory::Software
        );
    }

    #[test]
    fn test_mime_dmg() {
        assert_eq!(
            categorize_mime("application/x-apple-diskimage"),
            FileCategory::Software
        );
    }

    #[test]
    fn test_mime_unknown() {
        assert_eq!(
            categorize_mime("application/octet-stream"),
            FileCategory::Other
        );
    }

    #[test]
    fn test_mime_case_insensitive() {
        assert_eq!(categorize_mime("Application/PDF"), FileCategory::Documents);
    }

    #[test]
    fn test_ext_pdf() {
        assert_eq!(categorize_extension("report.pdf"), FileCategory::Documents);
    }

    #[test]
    fn test_ext_mp4() {
        assert_eq!(categorize_extension("movie.mp4"), FileCategory::Video);
    }

    #[test]
    fn test_ext_mp3() {
        assert_eq!(categorize_extension("song.mp3"), FileCategory::Audio);
    }

    #[test]
    fn test_ext_png() {
        assert_eq!(categorize_extension("photo.png"), FileCategory::Images);
    }

    #[test]
    fn test_ext_zip() {
        assert_eq!(categorize_extension("archive.zip"), FileCategory::Archives);
    }

    #[test]
    fn test_ext_exe() {
        assert_eq!(categorize_extension("setup.exe"), FileCategory::Software);
    }

    #[test]
    fn test_ext_unknown() {
        assert_eq!(categorize_extension("file.xyz"), FileCategory::Other);
    }

    #[test]
    fn test_ext_no_extension() {
        assert_eq!(categorize_extension("README"), FileCategory::Other);
    }

    #[test]
    fn test_ext_case_insensitive() {
        assert_eq!(categorize_extension("report.PDF"), FileCategory::Documents);
    }

    #[test]
    fn test_ext_multiple_dots() {
        assert_eq!(
            categorize_extension("archive.tar.gz"),
            FileCategory::Archives,
        );
    }
}
