# FTP Download Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add FTP/FTPS download support via a protocol adapter trait, enabling clean multi-protocol architecture.

**Architecture:** Introduce a `ProtocolHandler` trait that abstracts analyze/download operations. The existing HTTP code moves behind `HttpHandler`; new `FtpHandler` uses `suppaftp` for FTP/FTPS. The queue and engine dispatch by URL scheme.

**Tech Stack:** `suppaftp` (async-rustls), `async-trait`, `tokio_util::compat` (for AsyncRead bridging)

---

### Task 1: Add Dependencies

**Files:**
- Modify: `crates/crane-core/Cargo.toml`

**Step 1: Add suppaftp and async-trait to Cargo.toml**

Add these two lines to `[dependencies]` in `crates/crane-core/Cargo.toml`:

```toml
suppaftp = { version = "6", features = ["async-rustls"] }
async-trait = "0.1"
```

**Step 2: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles successfully (no code uses them yet)

**Step 3: Commit**

```
feat(core): add suppaftp and async-trait dependencies
```

---

### Task 2: Define ProtocolHandler Trait + Dispatcher

**Files:**
- Create: `crates/crane-core/src/protocol/mod.rs`
- Modify: `crates/crane-core/src/lib.rs` (add `pub mod protocol;`)

**Step 1: Create protocol module with trait definition**

Create `crates/crane-core/src/protocol/mod.rs`:

```rust
pub mod ftp;
pub mod http;

use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};

/// Protocol-specific handler for analyzing and downloading URLs.
/// Each supported protocol (HTTP, FTP, etc.) implements this trait.
#[async_trait]
pub trait ProtocolHandler: Send + Sync {
    /// Analyze a URL to extract metadata: filename, size, resumability, MIME type.
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError>;

    /// Download the resource at `url` to `save_path`.
    /// If `resume_from > 0`, resume from that byte offset.
    async fn download(
        &self,
        url: &str,
        save_path: &Path,
        options: &DownloadOptions,
        resume_from: u64,
        cancel_token: CancellationToken,
        on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError>;

    /// Whether this protocol supports multi-connection parallel downloads.
    fn supports_multi_connection(&self) -> bool;
}

/// Return the appropriate protocol handler for a URL based on its scheme.
pub fn handler_for_url(url: &str) -> Result<Box<dyn ProtocolHandler>, CraneError> {
    let parsed = url::Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => Ok(Box::new(http::HttpHandler)),
        "ftp" | "ftps" => Ok(Box::new(ftp::FtpHandler)),
        scheme => Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
}
```

**Step 2: Register protocol module in lib.rs**

Add `pub mod protocol;` to `crates/crane-core/src/lib.rs` (after the existing modules).

**Step 3: Create stub files so it compiles**

Create `crates/crane-core/src/protocol/http.rs`:

```rust
use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};
use super::ProtocolHandler;

/// HTTP/HTTPS protocol handler. Wraps the existing reqwest-based engine.
pub struct HttpHandler;

#[async_trait]
impl ProtocolHandler for HttpHandler {
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError> {
        crate::metadata::analyzer::analyze_url(url).await
    }

    async fn download(
        &self,
        _url: &str,
        _save_path: &Path,
        _options: &DownloadOptions,
        _resume_from: u64,
        _cancel_token: CancellationToken,
        _on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError> {
        // HTTP downloads are handled by the existing multi-connection engine,
        // not through this trait method. This exists only for protocol parity.
        unimplemented!("HTTP downloads use the multi-connection engine directly")
    }

    fn supports_multi_connection(&self) -> bool {
        true
    }
}
```

Create `crates/crane-core/src/protocol/ftp.rs`:

```rust
use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};
use super::ProtocolHandler;

/// FTP/FTPS protocol handler using suppaftp.
pub struct FtpHandler;

#[async_trait]
impl ProtocolHandler for FtpHandler {
    async fn analyze(&self, _url: &str) -> Result<UrlAnalysis, CraneError> {
        todo!("FTP analysis not yet implemented")
    }

    async fn download(
        &self,
        _url: &str,
        _save_path: &Path,
        _options: &DownloadOptions,
        _resume_from: u64,
        _cancel_token: CancellationToken,
        _on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError> {
        todo!("FTP download not yet implemented")
    }

    fn supports_multi_connection(&self) -> bool {
        false
    }
}
```

**Step 4: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles (stubs use `todo!()` / `unimplemented!()`)

**Step 5: Commit**

```
feat(core): add ProtocolHandler trait and protocol dispatcher
```

---

### Task 3: Add FtpError Variant to CraneError

**Files:**
- Modify: `crates/crane-core/src/types.rs`

**Step 1: Add FTP error variant**

In `crates/crane-core/src/types.rs`, add this variant to the `CraneError` enum (after `PrivateNetwork`):

```rust
    #[error("FTP error: {0}")]
    Ftp(String),
```

**Step 2: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles

**Step 3: Commit**

```
feat(core): add Ftp error variant to CraneError
```

---

### Task 4: Implement FTP Analyzer

This is the `FtpHandler::analyze()` method — connects to FTP, gets file size, extracts filename.

**Files:**
- Modify: `crates/crane-core/src/protocol/ftp.rs`

**Step 1: Write tests for FTP analysis**

We can't easily run a mock FTP server in tests like we do with `wiremock` for HTTP. Instead, write unit tests for the URL parsing helper and integration-style tests that test the full `analyze` against a known public FTP server (or skip in CI).

Add to bottom of `crates/crane-core/src/protocol/ftp.rs`:

```rust
/// Parse FTP URL into components: host, port, username, password, path.
fn parse_ftp_url(url: &str) -> Result<FtpUrlParts, CraneError> {
    let parsed = url::Url::parse(url)?;
    let scheme = parsed.scheme();
    if scheme != "ftp" && scheme != "ftps" {
        return Err(CraneError::UnsupportedScheme(scheme.to_string()));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| CraneError::Ftp("Missing host in FTP URL".to_string()))?
        .to_string();

    let port = parsed.port().unwrap_or(21);
    let use_tls = scheme == "ftps";

    let username = if parsed.username().is_empty() {
        "anonymous".to_string()
    } else {
        urlencoding::decode(parsed.username())
            .map_err(|e| CraneError::Ftp(format!("Invalid username encoding: {e}")))?
            .into_owned()
    };

    let password = parsed
        .password()
        .map(|p| {
            urlencoding::decode(p)
                .map(|d| d.into_owned())
                .unwrap_or_else(|_| p.to_string())
        })
        .unwrap_or_default();

    let path = parsed.path().to_string();

    let filename = path
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .map(|s| {
            urlencoding::decode(s)
                .map(|d| d.into_owned())
                .unwrap_or_else(|_| s.to_string())
        })
        .unwrap_or_else(|| "download".to_string());

    Ok(FtpUrlParts {
        host,
        port,
        use_tls,
        username,
        password,
        path,
        filename,
    })
}

struct FtpUrlParts {
    host: String,
    port: u16,
    use_tls: bool,
    username: String,
    password: String,
    path: String,
    filename: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ftp_url_basic() {
        let parts = parse_ftp_url("ftp://example.com/pub/file.zip").unwrap();
        assert_eq!(parts.host, "example.com");
        assert_eq!(parts.port, 21);
        assert!(!parts.use_tls);
        assert_eq!(parts.username, "anonymous");
        assert_eq!(parts.password, "");
        assert_eq!(parts.path, "/pub/file.zip");
        assert_eq!(parts.filename, "file.zip");
    }

    #[test]
    fn test_parse_ftp_url_with_auth() {
        let parts = parse_ftp_url("ftp://user:pass123@ftp.example.com:2121/data/report.csv").unwrap();
        assert_eq!(parts.host, "ftp.example.com");
        assert_eq!(parts.port, 2121);
        assert_eq!(parts.username, "user");
        assert_eq!(parts.password, "pass123");
        assert_eq!(parts.path, "/data/report.csv");
        assert_eq!(parts.filename, "report.csv");
    }

    #[test]
    fn test_parse_ftps_url() {
        let parts = parse_ftp_url("ftps://secure.example.com/file.bin").unwrap();
        assert!(parts.use_tls);
        assert_eq!(parts.host, "secure.example.com");
    }

    #[test]
    fn test_parse_ftp_url_encoded_credentials() {
        let parts = parse_ftp_url("ftp://user%40domain:p%40ss@ftp.example.com/file.txt").unwrap();
        assert_eq!(parts.username, "user@domain");
        assert_eq!(parts.password, "p@ss");
    }

    #[test]
    fn test_parse_ftp_url_no_filename() {
        let parts = parse_ftp_url("ftp://example.com/").unwrap();
        assert_eq!(parts.filename, "download");
    }

    #[test]
    fn test_parse_ftp_url_rejects_http() {
        let result = parse_ftp_url("http://example.com/file.txt");
        assert!(result.is_err());
    }
}
```

**Step 2: Run tests to verify they pass**

Run: `cargo test -p crane-core parse_ftp_url`
Expected: all 6 tests pass

**Step 3: Implement FtpHandler::analyze()**

Replace the `todo!()` in `analyze()` with the real implementation. Add necessary imports at the top of `ftp.rs`:

```rust
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use suppaftp::AsyncFtpStream;
use suppaftp::types::FileType;
use tokio_util::sync::CancellationToken;

use crate::metadata::mime::categorize_extension;
use crate::metadata::sanitize_filename;
use crate::network::is_public_host;
use crate::types::{
    CraneError, DownloadOptions, DownloadProgress, DownloadResult, FileCategory, UrlAnalysis,
};
use super::ProtocolHandler;
```

The `analyze` implementation:

```rust
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError> {
        let parts = parse_ftp_url(url)?;

        // SSRF protection: block private/internal hosts
        if !is_public_host(&parts.host) {
            return Err(CraneError::PrivateNetwork(parts.host.clone()));
        }

        let addr = format!("{}:{}", parts.host, parts.port);
        let mut ftp = AsyncFtpStream::connect(&addr)
            .await
            .map_err(|e| CraneError::Ftp(format!("Connect failed: {e}")))?;

        // Upgrade to TLS if ftps://
        if parts.use_tls {
            ftp = ftp
                .into_secure(
                    suppaftp::AsyncRustlsConnector::default(),
                    &parts.host,
                )
                .await
                .map_err(|e| CraneError::Ftp(format!("TLS upgrade failed: {e}")))?;
        }

        ftp.login(&parts.username, &parts.password)
            .await
            .map_err(|e| CraneError::Ftp(format!("Login failed: {e}")))?;

        ftp.transfer_type(FileType::Binary)
            .await
            .map_err(|e| CraneError::Ftp(format!("Set binary mode failed: {e}")))?;

        // Get file size via SIZE command
        let total_size = ftp
            .size(&parts.path)
            .await
            .ok()
            .map(|s| s as u64);

        // Check resumability by attempting REST 0
        let resumable = ftp.rest(0).await.is_ok();

        let _ = ftp.quit().await;

        let filename = sanitize_filename(&parts.filename);
        let category = categorize_extension(&filename);

        Ok(UrlAnalysis {
            url: url.to_string(),
            filename,
            total_size,
            mime_type: None, // FTP has no MIME type
            resumable,
            category,
            server: None,
        })
    }
```

**Step 4: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles

**Step 5: Commit**

```
feat(core): implement FTP URL parser and analyzer
```

---

### Task 5: Implement FTP Download

**Files:**
- Modify: `crates/crane-core/src/protocol/ftp.rs`

**Step 1: Implement FtpHandler::download()**

Replace the `todo!()` in `download()`:

```rust
    async fn download(
        &self,
        url: &str,
        save_path: &Path,
        options: &DownloadOptions,
        resume_from: u64,
        cancel_token: CancellationToken,
        on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError> {
        use std::sync::atomic::{AtomicU64, Ordering};
        use std::time::Instant;
        use tokio::io::AsyncWriteExt;

        let parts = parse_ftp_url(url)?;
        let start_time = Instant::now();

        // SSRF protection
        if !is_public_host(&parts.host) {
            return Err(CraneError::PrivateNetwork(parts.host.clone()));
        }

        let addr = format!("{}:{}", parts.host, parts.port);

        // Retry loop with exponential backoff (1s, 2s, 4s)
        const MAX_RETRIES: u32 = 3;
        let backoff = [1, 2, 4];
        let mut last_error: Option<CraneError> = None;

        for attempt in 0..=MAX_RETRIES {
            if cancel_token.is_cancelled() {
                return Err(CraneError::Ftp("Download cancelled".to_string()));
            }

            if attempt > 0 {
                if let Some(delay) = backoff.get((attempt - 1) as usize) {
                    tokio::time::sleep(Duration::from_secs(*delay)).await;
                }
            }

            match self
                .download_attempt(
                    &addr,
                    &parts,
                    save_path,
                    resume_from,
                    &cancel_token,
                    &on_progress,
                )
                .await
            {
                Ok(result) => return Ok(result),
                Err(e) => {
                    eprintln!(
                        "FTP download attempt {}/{} failed: {e}",
                        attempt + 1,
                        MAX_RETRIES + 1
                    );
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| CraneError::Ftp("Download failed".to_string())))
    }
```

Then add a private helper method on `FtpHandler` (outside the trait impl):

```rust
impl FtpHandler {
    async fn download_attempt(
        &self,
        addr: &str,
        parts: &FtpUrlParts,
        save_path: &Path,
        resume_from: u64,
        cancel_token: &CancellationToken,
        on_progress: &Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError> {
        use std::sync::atomic::{AtomicU64, Ordering};
        use std::time::Instant;
        use tokio::io::AsyncWriteExt;

        let start_time = Instant::now();

        let mut ftp = AsyncFtpStream::connect(addr)
            .await
            .map_err(|e| CraneError::Ftp(format!("Connect failed: {e}")))?;

        if parts.use_tls {
            ftp = ftp
                .into_secure(
                    suppaftp::AsyncRustlsConnector::default(),
                    &parts.host,
                )
                .await
                .map_err(|e| CraneError::Ftp(format!("TLS upgrade failed: {e}")))?;
        }

        ftp.login(&parts.username, &parts.password)
            .await
            .map_err(|e| CraneError::Ftp(format!("Login failed: {e}")))?;

        ftp.transfer_type(FileType::Binary)
            .await
            .map_err(|e| CraneError::Ftp(format!("Set binary mode failed: {e}")))?;

        // Get total size for progress reporting
        let total_size = ftp.size(&parts.path).await.ok().map(|s| s as u64);

        // Resume from offset if requested
        let mut downloaded: u64 = resume_from;
        if resume_from > 0 {
            ftp.rest(resume_from as usize)
                .await
                .map_err(|e| CraneError::Ftp(format!("REST failed: {e}")))?;
        }

        // Open temp file (.cranedownload)
        let tmp_path = save_path.with_extension(
            save_path
                .extension()
                .map(|e| format!("{}.cranedownload", e.to_string_lossy()))
                .unwrap_or_else(|| "cranedownload".to_string()),
        );

        if let Some(parent) = tmp_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut file = if resume_from > 0 {
            tokio::fs::OpenOptions::new()
                .write(true)
                .append(true)
                .open(&tmp_path)
                .await?
        } else {
            tokio::fs::File::create(&tmp_path).await?
        };

        // RETR and stream bytes
        let mut reader = ftp
            .retr_as_stream(&parts.path)
            .await
            .map_err(|e| CraneError::Ftp(format!("RETR failed: {e}")))?;

        use suppaftp::types::FtpError;
        use tokio::io::AsyncReadExt;

        let mut buf = vec![0u8; 65536]; // 64KB buffer
        loop {
            if cancel_token.is_cancelled() {
                let _ = ftp.quit().await;
                return Err(CraneError::Ftp("Download cancelled".to_string()));
            }

            let n = reader
                .read(&mut buf)
                .await
                .map_err(|e| CraneError::Ftp(format!("Read error: {e}")))?;

            if n == 0 {
                break;
            }

            file.write_all(&buf[..n]).await?;
            downloaded += n as u64;

            // Report progress
            let speed = if start_time.elapsed().as_secs_f64() > 0.0 {
                (downloaded - resume_from) as f64 / start_time.elapsed().as_secs_f64()
            } else {
                0.0
            };

            let eta = if speed > 0.0 {
                total_size.map(|total| {
                    let remaining = total.saturating_sub(downloaded);
                    (remaining as f64 / speed) as u64
                })
            } else {
                None
            };

            on_progress(&DownloadProgress {
                download_id: String::new(), // Filled by caller
                downloaded_size: downloaded,
                total_size,
                speed,
                eta_seconds: eta,
                connections: vec![],
            });
        }

        file.flush().await?;
        drop(reader);

        // Finalize RETR
        ftp.finalize_retr_stream()
            .await
            .map_err(|e| CraneError::Ftp(format!("Finalize RETR failed: {e}")))?;

        let _ = ftp.quit().await;

        // Rename temp file to final path
        tokio::fs::rename(&tmp_path, save_path).await?;

        Ok(DownloadResult {
            downloaded_bytes: downloaded,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            final_path: save_path.to_path_buf(),
            hash_verified: None,
        })
    }
}
```

**Step 2: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles

**Step 3: Commit**

```
feat(core): implement FTP download with resume and retry
```

---

### Task 6: Wire Protocol Dispatch into start_download()

This is the key integration point — modify `engine/multi.rs::start_download()` to use `handler_for_url()` for analysis and to dispatch FTP downloads through the trait.

**Files:**
- Modify: `crates/crane-core/src/engine/multi.rs`

**Step 1: Update start_download() to use protocol dispatch**

In `crates/crane-core/src/engine/multi.rs`, update the `start_download()` function:

1. Replace the scheme validation and `analyze_url()` call (lines 259-267) with:

```rust
    // Dispatch to protocol-specific handler
    let handler = crate::protocol::handler_for_url(url)?;

    // Analyze URL to determine resumability and size
    let analysis = handler.analyze(url).await?;
```

2. After the `DownloadController` is built (around line 306), update the spawn logic to handle non-multi-connection protocols:

```rust
    // Spawn initial download task
    let inner = controller.clone();
    let join_handle = if multi_eligible {
        tokio::spawn(async move { run_multi_download(&inner).await })
    } else if handler.supports_multi_connection() {
        // HTTP single-connection (server doesn't support ranges or size unknown)
        tokio::spawn(async move { run_single_download(&inner).await })
    } else {
        // Non-HTTP protocol (FTP, etc.) — use protocol handler directly
        let url_owned = url.to_string();
        let save_path_owned = save_path.to_path_buf();
        let options_owned = options.clone();
        let cancel_token = { inner.cancel_token.lock().await.clone() };
        let on_progress = inner.on_progress.clone();
        let inner2 = inner.clone();
        tokio::spawn(async move {
            let result = handler
                .download(
                    &url_owned,
                    &save_path_owned,
                    &options_owned,
                    0,
                    cancel_token,
                    on_progress,
                )
                .await;
            if let Err(ref e) = result {
                *inner2.error_message.lock().unwrap() = Some(e.to_string());
            }
            inner2.finished.store(true, std::sync::atomic::Ordering::SeqCst);
            result
        })
    };
```

Note: `handler` needs to be moved into the spawn. Since `Box<dyn ProtocolHandler>` is `Send + Sync`, wrap it in an `Arc`:

Change `handler_for_url` return type or wrap at call site:
```rust
    let handler: Arc<dyn crate::protocol::ProtocolHandler> =
        Arc::from(crate::protocol::handler_for_url(url)?);
```

And clone for the spawn:
```rust
    let handler_clone = handler.clone();
    // ... use handler_clone inside tokio::spawn
```

**Step 2: Remove the old scheme validation**

Delete the hardcoded scheme check (lines 260-264 approximately):
```rust
    // DELETE THESE LINES:
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
```

And delete the direct `analyze_url` import if no longer used directly.

**Step 3: Verify it compiles**

Run: `cargo check -p crane-core`
Expected: compiles

**Step 4: Run existing tests to verify no regressions**

Run: `cargo test -p crane-core`
Expected: all existing tests pass (HTTP downloads unchanged)

**Step 5: Commit**

```
feat(core): wire protocol dispatch into start_download
```

---

### Task 7: Update analyze_url() to Use Protocol Dispatch

**Files:**
- Modify: `crates/crane-core/src/metadata/analyzer.rs`

**Step 1: Make analyze_url() a thin wrapper**

Replace the scheme validation at the top of `analyze_url()` (lines 11-15) so it delegates to the protocol handler for non-HTTP URLs, while keeping the existing HTTP implementation for backwards compatibility:

```rust
pub async fn analyze_url(input_url: &str) -> Result<UrlAnalysis, CraneError> {
    let parsed = url::Url::parse(input_url)?;
    match parsed.scheme() {
        "http" | "https" => analyze_http(input_url, &parsed).await,
        _ => {
            // Delegate to protocol handler for non-HTTP schemes
            let handler = crate::protocol::handler_for_url(input_url)?;
            handler.analyze(input_url).await
        }
    }
}
```

Then rename the existing function body to `analyze_http`:

```rust
async fn analyze_http(input_url: &str, parsed: &url::Url) -> Result<UrlAnalysis, CraneError> {
    // ... existing HTTP analysis code (everything after line 15) ...
}
```

**Step 2: Update the existing test for unsupported scheme**

The test `test_unsupported_scheme` in analyzer tests currently expects `ftp://` to fail. Update it to use a truly unsupported scheme:

```rust
    #[tokio::test]
    async fn test_unsupported_scheme() {
        let result = analyze_url("gopher://example.com/file.txt").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            CraneError::UnsupportedScheme(scheme) => assert_eq!(scheme, "gopher"),
            other => panic!("Expected UnsupportedScheme, got: {other:?}"),
        }
    }
```

**Step 3: Verify tests pass**

Run: `cargo test -p crane-core`
Expected: all tests pass

**Step 4: Commit**

```
refactor(core): delegate non-HTTP analysis to protocol handlers
```

---

### Task 8: Update Scheme Validation in network.rs

**Files:**
- Modify: `crates/crane-core/src/network.rs`

**Step 1: Allow ftp/ftps in validate_url_safe()**

Update `validate_url_safe()` (line 112-114):

```rust
pub fn validate_url_safe(url: &url::Url) -> Result<(), CraneError> {
    match url.scheme() {
        "http" | "https" | "ftp" | "ftps" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
    // ... rest unchanged
}
```

**Step 2: Update test**

The test `test_validate_url_safe` asserts FTP is rejected. Update:

```rust
        let ftp = url::Url::parse("ftp://example.com/file.txt").unwrap();
        assert!(validate_url_safe(&ftp).is_ok()); // FTP is now allowed

        let gopher = url::Url::parse("gopher://example.com/file.txt").unwrap();
        assert!(validate_url_safe(&gopher).is_err()); // Still rejected
```

**Step 3: Verify tests pass**

Run: `cargo test -p crane-core`
Expected: all tests pass

**Step 4: Commit**

```
feat(core): allow ftp/ftps schemes in URL validation
```

---

### Task 9: Remove Hardcoded Scheme Checks in download.rs

**Files:**
- Modify: `crates/crane-core/src/engine/download.rs`

**Step 1: Remove the scheme validation**

In `download_file_with_token()` (around lines 197-202), remove the scheme check:

```rust
    // DELETE THESE LINES:
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
```

This function is only called by `run_single_download()` in `multi.rs`, which is only used for HTTP. The scheme validation is now handled by `handler_for_url()` in the dispatcher.

**Step 2: Verify tests pass**

Run: `cargo test -p crane-core`
Expected: all tests pass

**Step 3: Commit**

```
refactor(core): remove redundant scheme check from download.rs
```

---

### Task 10: Update Chrome Extension to Allow FTP URLs

**Files:**
- Modify: `extensions/chrome/service-worker.js`

**Step 1: Update URL filter in download interception**

In the `chrome.downloads.onCreated` listener (around line 64), update the skip condition to also allow ftp:// URLs:

```javascript
  // Skip non-downloadable URLs (data:, blob:, etc.)
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return;
  }
```

This already works — it only skips `data:` and `blob:`, letting `ftp://` through. No change needed here.

In the context menu handler, no change needed — it sends whatever URL the user right-clicked.

**Step 2: Commit (skip if no changes needed)**

---

### Task 11: Update Native Host to Allow FTP URLs

**Files:**
- Modify: `crates/crane-native-host/src/main.rs`

**Step 1: Allow ftp/ftps schemes**

In `handle_download()` (around line 163), update the scheme check:

```rust
    match parsed_url.scheme() {
        "http" | "https" | "ftp" | "ftps" => {}
        scheme => {
            return serde_json::json!({
                "type": "error",
                "message": format!("Unsupported URL scheme: '{scheme}'. Only http, https, ftp, and ftps are allowed.")
            });
        }
    }
```

**Step 2: Update the test that checks FTP rejection**

In the test `test_handle_download_rejects_ftp`, rename it and update the expectation:

```rust
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
```

**Step 3: Verify tests pass**

Run: `cargo test -p crane-native-host`
Expected: all tests pass

**Step 4: Commit**

```
feat(native-host): allow ftp/ftps URLs in download handler
```

---

### Task 12: Update Tauri IPC Command to Allow FTP URLs

**Files:**
- Modify: `src-tauri/src/commands/downloads.rs`

**Step 1: Update analyze_url command**

The `analyze_url` IPC command calls `validate_url_safe()` which we already updated in Task 8. However, the `add_download` command also calls it. Both should now work with ftp:// URLs since `validate_url_safe` was updated.

Verify by reading the file — if it calls `validate_url_safe`, no further changes needed.

**Step 2: Verify it compiles**

Run: `cargo check --workspace`
Expected: compiles

**Step 3: Commit (if any changes were made)**

---

### Task 13: Integration Test — FTP End-to-End

**Files:**
- Modify: `crates/crane-core/src/protocol/ftp.rs` (add tests)

**Step 1: Add integration test for FTP parse + analyze flow**

Since we can't easily mock an FTP server, add a test that verifies the full parse-analyze-error flow (connecting to a non-existent server should fail with a descriptive error):

```rust
    #[tokio::test]
    async fn test_analyze_connection_refused() {
        let handler = FtpHandler;
        // Connect to a port that's definitely not running FTP
        let result = handler.analyze("ftp://127.0.0.1:19999/file.txt").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            CraneError::PrivateNetwork(_) | CraneError::Ftp(_) => {} // Either is acceptable
            other => panic!("Expected Ftp or PrivateNetwork error, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_analyze_rejects_private_host() {
        let handler = FtpHandler;
        let result = handler.analyze("ftp://192.168.1.1/file.txt").await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CraneError::PrivateNetwork(_)));
    }

    #[tokio::test]
    async fn test_download_rejects_private_host() {
        let handler = FtpHandler;
        let result = handler
            .download(
                "ftp://10.0.0.1/file.txt",
                Path::new("/tmp/test.txt"),
                &DownloadOptions::default(),
                0,
                CancellationToken::new(),
                Arc::new(|_| {}),
            )
            .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CraneError::PrivateNetwork(_)));
    }
```

**Step 2: Run all tests**

Run: `cargo test --workspace`
Expected: all tests pass

**Step 3: Commit**

```
test(core): add FTP integration and error handling tests
```

---

## Summary

| Task | What | Files |
|------|-------|-------|
| 1 | Add dependencies | `Cargo.toml` |
| 2 | ProtocolHandler trait + dispatcher + stubs | `protocol/mod.rs`, `protocol/http.rs`, `protocol/ftp.rs`, `lib.rs` |
| 3 | FTP error variant | `types.rs` |
| 4 | FTP URL parser + analyzer | `protocol/ftp.rs` |
| 5 | FTP download with resume + retry | `protocol/ftp.rs` |
| 6 | Wire dispatch into start_download() | `engine/multi.rs` |
| 7 | Delegate analyze_url() to handlers | `metadata/analyzer.rs` |
| 8 | Allow ftp/ftps in validate_url_safe() | `network.rs` |
| 9 | Remove redundant scheme check | `engine/download.rs` |
| 10 | Chrome extension (verify, likely no change) | `service-worker.js` |
| 11 | Native host allow ftp/ftps | `crane-native-host/main.rs` |
| 12 | Tauri IPC (verify, likely no change) | `commands/downloads.rs` |
| 13 | Integration tests | `protocol/ftp.rs` |
