# FTP Download Support — Design

## Goal

Add FTP and FTPS download support to Crane, using a protocol adapter trait that cleanly separates protocol-specific logic and sets the foundation for future protocols (yt-dlp, HLS/DASH, BitTorrent).

## Requirements

- **FTP + FTPS** (TLS) support
- **Authenticated + anonymous** access (credentials parsed from URL: `ftp://user:pass@host/path`)
- **Single connection** per download with pause/resume via FTP `REST` command
- **No multi-connection** — FTP servers typically limit connections per user

## Architecture: Protocol Adapter Trait

### Core Trait

```rust
// crates/crane-core/src/protocol/mod.rs

#[async_trait]
pub trait ProtocolHandler: Send + Sync {
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError>;

    async fn download(
        &self,
        url: &str,
        save_path: &Path,
        options: &DownloadOptions,
        resume_from: u64,
        cancel_token: CancellationToken,
        on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError>;

    fn supports_multi_connection(&self) -> bool;
}
```

### Dispatcher

```rust
pub fn handler_for_url(url: &str) -> Result<Box<dyn ProtocolHandler>, CraneError> {
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => Ok(Box::new(HttpHandler::new())),
        "ftp" | "ftps" => Ok(Box::new(FtpHandler::new())),
        scheme => Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
}
```

### HttpHandler

Wraps the existing reqwest-based logic from `engine/multi.rs` and `metadata/analyzer.rs`. No behavioral changes — just moves behind the trait.

### FtpHandler

Uses `suppaftp` crate (async mode with rustls TLS).

**Analyze flow:**
1. Connect to host:port (default 21)
2. Login (user:pass from URL, or anonymous)
3. If FTPS → upgrade to TLS via `into_secure()`
4. `SIZE <path>` → file size
5. `REST 0` → test resumability
6. Filename extracted from URL path
7. MIME type inferred from file extension (no Content-Type in FTP)

**Download flow:**
1. Connect + login + optional TLS upgrade
2. Binary transfer mode (`TYPE I`)
3. If `resume_from > 0` → `REST <offset>`
4. `RETR <path>` → stream bytes to `.cranedownload` temp file
5. Track bytes via atomic counter for progress
6. On completion → rename to final path
7. Respects cancel token for pause/cancel

**Resume:** Uses FTP `REST` command to set byte offset before `RETR`. Same `.cranedownload` temp file pattern as HTTP single-connection.

**Retry:** Connection drops retried with 1s/2s/4s exponential backoff (same as HTTP).

## Engine Refactoring

`start_download()` in `engine/multi.rs`:
- Calls `handler_for_url()` to get protocol handler
- Calls `handler.analyze()` instead of `analyze_url()` directly
- Checks `handler.supports_multi_connection()` — if true (HTTP), uses existing multi-connection path; if false (FTP), delegates to `handler.download()`
- `DownloadHandle` / `DownloadController` wrapper unchanged

`analyze_url()` in `metadata/analyzer.rs`:
- Becomes thin wrapper: `handler_for_url(url)?.analyze(url)`

Scheme validation consolidated into `handler_for_url()`. The 4 hardcoded check points (`network.rs`, `analyzer.rs`, `multi.rs`, `download.rs`) simplified.

`validate_url_safe()` in `network.rs`: Allow `ftp`/`ftps` schemes. Private-host check still applies.

## Files

**New:**
- `crates/crane-core/src/protocol/mod.rs` — trait + dispatcher
- `crates/crane-core/src/protocol/http.rs` — HttpHandler
- `crates/crane-core/src/protocol/ftp.rs` — FtpHandler

**Modified:**
- `crates/crane-core/Cargo.toml` — add `suppaftp`, `async-trait`
- `crates/crane-core/src/lib.rs` — add `pub mod protocol;`
- `crates/crane-core/src/engine/multi.rs` — use protocol dispatch
- `crates/crane-core/src/metadata/analyzer.rs` — delegate to handler
- `crates/crane-core/src/network.rs` — allow ftp/ftps schemes
- `crates/crane-core/src/engine/download.rs` — remove scheme check
- `src-tauri/src/commands/downloads.rs` — allow ftp/ftps
- `extensions/chrome/service-worker.js` — allow ftp:// URLs
- `crates/crane-native-host/src/main.rs` — allow ftp/ftps scheme

**Unchanged:** Database schema, `Download` struct, `DownloadOptions`, queue manager, frontend, IPC commands. FTP downloads look identical to HTTP from the UI.

## Dependencies

```toml
suppaftp = { version = "6", features = ["async-rustls"] }
async-trait = "0.1"
```

## Testing

- Anonymous FTP connect + download
- Authenticated FTP connect + download
- FTPS TLS upgrade
- Resume via REST command
- Cancel mid-transfer
- Connection refused / invalid credentials error handling
- Filename extraction from URL path
- File size detection via SIZE command
