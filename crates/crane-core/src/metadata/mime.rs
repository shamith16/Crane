use crate::types::FileCategory;

pub fn categorize_mime(_mime: &str) -> FileCategory {
    todo!()
}

pub fn categorize_extension(_filename: &str) -> FileCategory {
    todo!()
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
