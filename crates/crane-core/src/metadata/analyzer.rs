use crate::types::{CraneError, FileCategory, UrlAnalysis};

pub async fn analyze_url(_url: &str) -> Result<UrlAnalysis, CraneError> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_basic_analysis() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/file.zip"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Length", "1048576")
                    .insert_header("Content-Type", "application/zip")
                    .insert_header("Accept-Ranges", "bytes")
                    .insert_header("Server", "nginx/1.24"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/file.zip", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.filename, "file.zip");
        assert_eq!(result.total_size, Some(1048576));
        assert_eq!(result.mime_type, Some("application/zip".to_string()));
        assert!(result.resumable);
        assert_eq!(result.category, FileCategory::Archives);
        assert_eq!(result.server, Some("nginx/1.24".to_string()));
    }

    #[tokio::test]
    async fn test_content_disposition_filename() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/download"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header(
                        "Content-Disposition",
                        "attachment; filename=\"report-2026.pdf\"",
                    )
                    .insert_header("Content-Type", "application/pdf")
                    .insert_header("Content-Length", "5000"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/download", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.filename, "report-2026.pdf");
        assert_eq!(result.category, FileCategory::Documents);
    }

    #[tokio::test]
    async fn test_content_disposition_utf8() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/download"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header(
                        "Content-Disposition",
                        "attachment; filename*=UTF-8''report%20v2.pdf",
                    )
                    .insert_header("Content-Type", "application/pdf"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/download", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.filename, "report v2.pdf");
    }

    #[tokio::test]
    async fn test_no_content_length() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/stream"))
            .respond_with(
                ResponseTemplate::new(200).insert_header("Content-Type", "video/mp4"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/stream", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.total_size, None);
    }

    #[tokio::test]
    async fn test_no_accept_ranges() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/file.txt"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Type", "text/plain")
                    .insert_header("Content-Length", "100"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/file.txt", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert!(!result.resumable);
    }

    #[tokio::test]
    async fn test_filename_fallback_from_url() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/files/my-document.pdf"))
            .respond_with(
                ResponseTemplate::new(200).insert_header("Content-Type", "application/pdf"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/files/my-document.pdf", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.filename, "my-document.pdf");
    }

    #[tokio::test]
    async fn test_filename_url_decoded() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/files/my%20file.pdf"))
            .respond_with(
                ResponseTemplate::new(200).insert_header("Content-Type", "application/pdf"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/files/my%2520file.pdf", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.filename, "my%20file.pdf");
    }

    #[tokio::test]
    async fn test_mime_fallback_to_extension() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/file.mp4"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/file.mp4", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert_eq!(result.category, FileCategory::Video);
    }

    #[tokio::test]
    async fn test_http_404_error() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/missing"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let url = format!("{}/missing", server.uri());
        let result = analyze_url(&url).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            CraneError::Http { status, .. } => assert_eq!(status, 404),
            other => panic!("Expected Http error, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_invalid_url() {
        let result = analyze_url("not a url").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_unsupported_scheme() {
        let result = analyze_url("ftp://example.com/file.txt").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            CraneError::UnsupportedScheme(scheme) => assert_eq!(scheme, "ftp"),
            other => panic!("Expected UnsupportedScheme, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_stores_final_url() {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/file.zip"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Type", "application/zip"),
            )
            .mount(&server)
            .await;

        let url = format!("{}/file.zip", server.uri());
        let result = analyze_url(&url).await.unwrap();

        assert!(result.url.contains("/file.zip"));
    }
}
