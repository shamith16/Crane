use crate::metadata::mime::{categorize_extension, categorize_mime};
use crate::types::{CraneError, FileCategory, UrlAnalysis};

const USER_AGENT: &str = "Crane/0.1.0";

pub async fn analyze_url(input_url: &str) -> Result<UrlAnalysis, CraneError> {
    let parsed = url::Url::parse(input_url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(CraneError::Network)?;

    let response = client.head(input_url).send().await?;
    let final_url = response.url().to_string();
    let status = response.status();

    if !status.is_success() {
        return Err(CraneError::Http {
            status: status.as_u16(),
            message: status.canonical_reason().unwrap_or("Unknown").to_string(),
        });
    }

    let headers = response.headers();

    let total_size = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());

    let mime_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or(v).trim().to_string());

    let resumable = headers
        .get("accept-ranges")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("bytes"))
        .unwrap_or(false);

    let server = headers
        .get("server")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());

    let filename = extract_filename_from_headers(headers)
        .unwrap_or_else(|| extract_filename_from_url(&parsed));

    let category = match &mime_type {
        Some(mime) => {
            let cat = categorize_mime(mime);
            if cat == FileCategory::Other {
                categorize_extension(&filename)
            } else {
                cat
            }
        }
        None => categorize_extension(&filename),
    };

    Ok(UrlAnalysis {
        url: final_url,
        filename,
        total_size,
        mime_type,
        resumable,
        category,
        server,
    })
}

fn extract_filename_from_headers(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let disposition = headers.get("content-disposition")?.to_str().ok()?;

    // Try filename*=UTF-8''encoded_name first (RFC 5987)
    if let Some(encoded) = disposition
        .split(';')
        .map(|p| p.trim())
        .find(|p| p.starts_with("filename*="))
    {
        let value = encoded.trim_start_matches("filename*=");
        if let Some(name) = value.split("''").nth(1) {
            if let Ok(decoded) = urlencoding::decode(name) {
                return Some(decoded.into_owned());
            }
        }
    }

    // Try filename="name" or filename=name
    if let Some(param) = disposition
        .split(';')
        .map(|p| p.trim())
        .find(|p| p.starts_with("filename=") && !p.starts_with("filename*="))
    {
        let value = param.trim_start_matches("filename=");
        let name = value.trim_matches('"');
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }

    None
}

fn extract_filename_from_url(parsed: &url::Url) -> String {
    let path = parsed.path();
    let segment = path.rsplit('/').next().unwrap_or("");

    match urlencoding::decode(segment) {
        Ok(decoded) => {
            let name = decoded.into_owned();
            if name.is_empty() { "download".to_string() } else { name }
        }
        Err(_) => {
            if segment.is_empty() { "download".to_string() } else { segment.to_string() }
        }
    }
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
            .and(path("/files/my%2520file.pdf"))
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
