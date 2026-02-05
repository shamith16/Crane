// Multi-connection HTTP/HTTPS downloader with byte-range splitting

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use futures_util::StreamExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;
use url::Url;

use super::download::{MAX_RETRIES, PROGRESS_INTERVAL_MS, RETRY_BACKOFF_MS, USER_AGENT};
use crate::metadata::analyzer::analyze_url;
use crate::types::{
    ConnectionProgress, CraneError, DownloadOptions, DownloadProgress, DownloadResult,
};

// ─── DownloadController & DownloadHandle ────────────────────

/// Internal controller managing state for a pausable/resumable download.
struct DownloadController {
    url: String,
    save_path: PathBuf,
    options: DownloadOptions,
    total_size: u64,
    #[allow(dead_code)]
    resumable: bool,
    chunks: Vec<ChunkPlan>,
    counters: Vec<Arc<AtomicU64>>,
    cancel_token: tokio::sync::Mutex<CancellationToken>,
    paused: AtomicBool,
    cancelled: AtomicBool,
    on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    is_multi: AtomicBool,
}

/// Handle returned by [`start_download`] that allows pausing, resuming, and
/// cancelling a running download.
pub struct DownloadHandle {
    join_handle:
        tokio::sync::Mutex<Option<tokio::task::JoinHandle<Result<DownloadResult, CraneError>>>>,
    inner: Arc<DownloadController>,
}

impl DownloadHandle {
    /// Pause the running download. Sets the paused flag and cancels the
    /// current token so that in-flight chunk tasks stop promptly.
    pub async fn pause(&self) {
        self.inner.paused.store(true, Ordering::SeqCst);
        let token = self.inner.cancel_token.lock().await;
        token.cancel();
    }

    /// Resume a previously paused download. Re-analyzes the URL (HEAD),
    /// inspects existing chunk files to determine already-downloaded bytes,
    /// creates a fresh cancellation token, and spawns new download tasks.
    pub async fn resume(&self) -> Result<(), CraneError> {
        if !self.inner.paused.load(Ordering::SeqCst) {
            return Ok(());
        }

        // Wait for the old task to finish (it should be done since we cancelled it)
        {
            let mut guard = self.join_handle.lock().await;
            if let Some(old_handle) = guard.take() {
                let _ = old_handle.await;
            }
        }

        // Create a new cancellation token
        let new_token = CancellationToken::new();
        {
            let mut token_guard = self.inner.cancel_token.lock().await;
            *token_guard = new_token;
        }

        self.inner.paused.store(false, Ordering::SeqCst);

        if self.inner.is_multi.load(Ordering::SeqCst) {
            // Re-analyze URL to verify it's still valid and file size hasn't changed
            let analysis = analyze_url(&self.inner.url).await?;
            if analysis.total_size != Some(self.inner.total_size) {
                return Err(CraneError::Config(
                    "server file size changed since download started; cannot resume".to_string(),
                ));
            }

            let inner = self.inner.clone();
            let new_handle = tokio::spawn(async move { run_multi_download(&inner).await });
            let mut guard = self.join_handle.lock().await;
            *guard = Some(new_handle);
        } else {
            // Single-connection resume: restart the download from scratch
            let inner = self.inner.clone();
            let new_handle = tokio::spawn(async move { run_single_download(&inner).await });
            let mut guard = self.join_handle.lock().await;
            *guard = Some(new_handle);
        }

        Ok(())
    }

    /// Cancel the download. Sets the cancelled flag, cancels the token,
    /// waits briefly for tasks to stop, and removes temp files.
    pub async fn cancel(&self) {
        self.inner.cancelled.store(true, Ordering::SeqCst);
        {
            let token = self.inner.cancel_token.lock().await;
            token.cancel();
        }

        // Wait for the task to finish
        {
            let mut guard = self.join_handle.lock().await;
            if let Some(handle) = guard.take() {
                let _ = handle.await;
            }
        }

        // Clean up temp files
        let temp_dir = temp_dir_path(&self.inner.save_path);
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        let _ = tokio::fs::remove_file(&self.inner.save_path).await;
    }

    /// Returns `true` if the download is currently paused.
    pub fn is_paused(&self) -> bool {
        self.inner.paused.load(Ordering::SeqCst)
    }

    /// Consume the handle and wait for the download to complete.
    pub async fn wait(self) -> Result<DownloadResult, CraneError> {
        let mut guard = self.join_handle.lock().await;
        let handle = guard
            .take()
            .ok_or_else(|| CraneError::Config("no active download task".to_string()))?;
        handle
            .await
            .map_err(|e| CraneError::Config(format!("task join error: {e}")))?
    }
}

/// Start a download with pause/resume/cancel support.
///
/// Validates the URL, performs a HEAD request to analyze the resource,
/// decides between multi-connection and single-connection mode, and
/// spawns the initial download task. Returns a [`DownloadHandle`] for
/// controlling the download.
pub async fn start_download<F>(
    url: &str,
    save_path: &Path,
    options: &DownloadOptions,
    on_progress: F,
) -> Result<DownloadHandle, CraneError>
where
    F: Fn(&DownloadProgress) + Send + Sync + 'static,
{
    // Validate URL
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    // Analyze URL to determine resumability and size
    let analysis = analyze_url(url).await?;

    let requested_connections = options.connections.unwrap_or(DEFAULT_CONNECTIONS);
    let cancel_token = CancellationToken::new();

    let multi_eligible =
        analysis.resumable && analysis.total_size.is_some() && requested_connections > 1;

    let total_size = analysis.total_size.unwrap_or(0);
    let chunks = if multi_eligible {
        plan_chunks(total_size, requested_connections)
    } else {
        vec![]
    };

    let counters: Vec<Arc<AtomicU64>> = (0..chunks.len().max(1))
        .map(|_| Arc::new(AtomicU64::new(0)))
        .collect();

    let controller = Arc::new(DownloadController {
        url: url.to_string(),
        save_path: save_path.to_path_buf(),
        options: options.clone(),
        total_size,
        resumable: analysis.resumable,
        chunks,
        counters,
        cancel_token: tokio::sync::Mutex::new(cancel_token),
        paused: AtomicBool::new(false),
        cancelled: AtomicBool::new(false),
        on_progress: Arc::new(on_progress),
        is_multi: AtomicBool::new(multi_eligible),
    });

    // Spawn initial download task
    let inner = controller.clone();
    let join_handle = if multi_eligible {
        tokio::spawn(async move { run_multi_download(&inner).await })
    } else {
        tokio::spawn(async move { run_single_download(&inner).await })
    };

    Ok(DownloadHandle {
        join_handle: tokio::sync::Mutex::new(Some(join_handle)),
        inner: controller,
    })
}

/// Run a multi-connection download, checking existing chunk files for resume offsets.
async fn run_multi_download(ctrl: &DownloadController) -> Result<DownloadResult, CraneError> {
    let start_time = Instant::now();
    let temp_dir = temp_dir_path(&ctrl.save_path);
    tokio::fs::create_dir_all(&temp_dir).await?;

    let ua = ctrl
        .options
        .user_agent
        .as_deref()
        .unwrap_or(USER_AGENT)
        .to_string();
    let client = reqwest::Client::builder()
        .user_agent(ua)
        .build()
        .map_err(CraneError::Network)?;

    // Check existing chunk files for resume offsets
    let mut already_downloaded_per_chunk: Vec<u64> = Vec::with_capacity(ctrl.chunks.len());
    for (i, chunk) in ctrl.chunks.iter().enumerate() {
        let chunk_path = temp_dir.join(format!("chunk_{}", chunk.connection_num));
        let existing_bytes = match tokio::fs::metadata(&chunk_path).await {
            Ok(meta) => meta.len(),
            Err(_) => 0,
        };
        let chunk_total = chunk.range_end - chunk.range_start + 1;
        let clamped = existing_bytes.min(chunk_total);
        already_downloaded_per_chunk.push(clamped);
        ctrl.counters[i].store(clamped, Ordering::Relaxed);
    }

    // Get cancellation token
    let cancel_token = {
        let guard = ctrl.cancel_token.lock().await;
        guard.clone()
    };

    // Spawn progress reporter
    let progress_counters: Vec<Arc<AtomicU64>> = ctrl.counters.iter().map(Arc::clone).collect();
    let progress_chunks: Vec<ChunkPlan> = ctrl.chunks.clone();
    let progress_on_progress = ctrl.on_progress.clone();
    let total_size = ctrl.total_size;
    let progress_token = cancel_token.clone();

    let progress_handle = tokio::spawn(async move {
        let mut last_total: u64 = 0;
        let mut last_speed_time = Instant::now();

        loop {
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_millis(PROGRESS_INTERVAL_MS)) => {}
                _ = progress_token.cancelled() => { break; }
            }

            let mut connections = Vec::with_capacity(progress_chunks.len());
            let mut total_downloaded: u64 = 0;

            for (i, chunk) in progress_chunks.iter().enumerate() {
                let downloaded = progress_counters[i].load(Ordering::Relaxed);
                total_downloaded += downloaded;
                connections.push(ConnectionProgress {
                    connection_num: chunk.connection_num,
                    downloaded,
                    range_start: chunk.range_start,
                    range_end: chunk.range_end,
                });
            }

            total_downloaded = total_downloaded.max(last_total);

            let elapsed = last_speed_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                (total_downloaded.saturating_sub(last_total)) as f64 / elapsed
            } else {
                0.0
            };

            let eta = if speed > 0.0 {
                let remaining = total_size.saturating_sub(total_downloaded);
                Some((remaining as f64 / speed) as u64)
            } else {
                None
            };

            progress_on_progress(&DownloadProgress {
                download_id: String::new(),
                downloaded_size: total_downloaded,
                total_size: Some(total_size),
                speed,
                eta_seconds: eta,
                connections,
            });

            last_total = total_downloaded;
            last_speed_time = Instant::now();
        }
    });

    // Spawn chunk download tasks
    let mut join_set = JoinSet::new();

    for (i, chunk) in ctrl.chunks.iter().enumerate() {
        let chunk_total = chunk.range_end - chunk.range_start + 1;
        let already = already_downloaded_per_chunk[i];

        // Skip fully completed chunks
        if already >= chunk_total {
            continue;
        }

        let client = client.clone();
        let url = ctrl.url.clone();
        let chunk = chunk.clone();
        let temp_dir = temp_dir.clone();
        let options = ctrl.options.clone();
        let counter = Arc::clone(&ctrl.counters[i]);
        let token = cancel_token.child_token();

        join_set.spawn(async move {
            download_chunk_resume(
                &client,
                &url,
                &chunk,
                &temp_dir,
                &options,
                counter,
                token,
                chunk.connection_num,
                already,
            )
            .await
        });
    }

    // Collect results
    let mut first_error: Option<CraneError> = None;

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(_bytes)) => {}
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                    join_set.abort_all();
                }
            }
            Err(e) => {
                // Check if this is a cancellation (pause/cancel)
                if e.is_cancelled() && ctrl.paused.load(Ordering::SeqCst) {
                    continue;
                }
                if first_error.is_none() {
                    first_error = Some(CraneError::Config(format!("task join error: {e}")));
                    join_set.abort_all();
                }
            }
        }
    }

    // Cancel the progress reporter token (even on success)
    cancel_token.cancel();
    let _ = progress_handle.await;

    // Check if we were paused
    if ctrl.paused.load(Ordering::SeqCst) {
        // Return a sentinel result; the download is not complete
        return Ok(DownloadResult {
            downloaded_bytes: 0,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            final_path: ctrl.save_path.clone(),
        });
    }

    // Check if we were cancelled
    if ctrl.cancelled.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        let _ = tokio::fs::remove_file(&ctrl.save_path).await;
        return Err(CraneError::Config("download cancelled".to_string()));
    }

    // If any task failed, clean up and return error
    if let Some(err) = first_error {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(err);
    }

    // Merge chunk files into final file
    if let Some(parent) = ctrl.save_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut final_file = tokio::fs::File::create(&ctrl.save_path).await?;
    let mut merged_bytes: u64 = 0;
    let num_chunks = ctrl.chunks.len();

    let mut buf = vec![0u8; 65_536];
    for i in 0..num_chunks {
        let chunk_path = temp_dir.join(format!("chunk_{}", ctrl.chunks[i].connection_num));
        let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
        loop {
            let n = chunk_file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            final_file.write_all(&buf[..n]).await?;
            merged_bytes += n as u64;
        }
    }

    final_file.shutdown().await?;

    // Verify total bytes
    if merged_bytes != ctrl.total_size {
        let _ = tokio::fs::remove_file(&ctrl.save_path).await;
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(CraneError::Config(format!(
            "merge size mismatch: expected {}, got {merged_bytes}",
            ctrl.total_size
        )));
    }

    // Cleanup temp directory
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    // Final progress callback
    let elapsed = start_time.elapsed();
    let speed = if elapsed.as_secs_f64() > 0.0 {
        merged_bytes as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    (ctrl.on_progress)(&DownloadProgress {
        download_id: String::new(),
        downloaded_size: merged_bytes,
        total_size: Some(ctrl.total_size),
        speed,
        eta_seconds: Some(0),
        connections: ctrl
            .chunks
            .iter()
            .map(|c| ConnectionProgress {
                connection_num: c.connection_num,
                downloaded: c.range_end - c.range_start + 1,
                range_start: c.range_start,
                range_end: c.range_end,
            })
            .collect(),
    });

    Ok(DownloadResult {
        downloaded_bytes: merged_bytes,
        elapsed_ms: elapsed.as_millis() as u64,
        final_path: ctrl.save_path.clone(),
    })
}

/// Download a single chunk with resume support (append mode).
#[allow(clippy::too_many_arguments)]
async fn download_chunk_resume(
    client: &reqwest::Client,
    url: &str,
    chunk: &ChunkPlan,
    temp_dir: &Path,
    options: &DownloadOptions,
    counter: Arc<AtomicU64>,
    cancel_token: CancellationToken,
    original_conn_num: u32,
    already_downloaded: u64,
) -> Result<u64, CraneError> {
    let chunk_path = temp_dir.join(format!("chunk_{original_conn_num}"));
    let mut last_error: Option<CraneError> = None;

    let resume_start = chunk.range_start + already_downloaded;

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            let backoff = RETRY_BACKOFF_MS[(attempt - 1) as usize];
            tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
            // Reset counter and truncate file to pre-attempt state
            counter.store(already_downloaded, Ordering::Relaxed);
            if let Ok(file) = tokio::fs::OpenOptions::new()
                .write(true)
                .open(&chunk_path)
                .await
            {
                let _ = file.set_len(already_downloaded).await;
            }
        }

        let request = client.get(url).header(
            "Range",
            format!("bytes={}-{}", resume_start, chunk.range_end),
        );

        let request = super::download::apply_options_headers(request, options);

        let response = match request.send().await {
            Ok(r) => r,
            Err(e) => {
                let err = CraneError::Network(e);
                if attempt == MAX_RETRIES {
                    return Err(err);
                }
                last_error = Some(err);
                continue;
            }
        };

        let status = response.status();
        if status.is_server_error() {
            let err = CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            };
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }
        if !status.is_success() {
            return Err(CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            });
        }

        // Open file in append mode
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&chunk_path)
            .await?;

        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = already_downloaded;

        let mut stream_err = None;
        loop {
            tokio::select! {
                chunk_result = stream.next() => {
                    match chunk_result {
                        Some(Ok(bytes)) => {
                            file.write_all(&bytes).await?;
                            downloaded += bytes.len() as u64;
                            counter.store(downloaded, Ordering::Relaxed);
                        }
                        Some(Err(e)) => {
                            stream_err = Some(CraneError::Network(e));
                            break;
                        }
                        None => break,
                    }
                }
                _ = cancel_token.cancelled() => {
                    file.shutdown().await?;
                    return Ok(downloaded);
                }
            }
        }

        file.shutdown().await?;

        if let Some(err) = stream_err {
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }

        return Ok(downloaded);
    }

    Err(last_error.unwrap_or_else(|| CraneError::Http {
        status: 0,
        message: "unknown error".to_string(),
    }))
}

/// Run a single-connection download using the controller's callback.
async fn run_single_download(ctrl: &DownloadController) -> Result<DownloadResult, CraneError> {
    let cancel_token = {
        let guard = ctrl.cancel_token.lock().await;
        guard.clone()
    };

    let on_progress = ctrl.on_progress.clone();
    let result = super::download::download_file_with_token(
        &ctrl.url,
        &ctrl.save_path,
        &ctrl.options,
        move |p| on_progress(p),
        cancel_token,
    )
    .await;

    // Check if paused/cancelled after download completes
    if ctrl.paused.load(Ordering::SeqCst) || ctrl.cancelled.load(Ordering::SeqCst) {
        return Ok(DownloadResult {
            downloaded_bytes: 0,
            elapsed_ms: 0,
            final_path: ctrl.save_path.clone(),
        });
    }

    result
}

const MIN_CHUNK_SIZE: u64 = 262_144; // 256KB
const DEFAULT_CONNECTIONS: u32 = 8;

/// Plan for a single byte-range chunk.
#[derive(Debug, Clone)]
struct ChunkPlan {
    connection_num: u32,
    range_start: u64,
    range_end: u64,
}

/// Build the temp directory path for chunk storage.
fn temp_dir_path(save_path: &Path) -> PathBuf {
    let mut dir_name = save_path.as_os_str().to_os_string();
    dir_name.push(".crane_tmp");
    PathBuf::from(dir_name)
}

/// Compute chunk boundaries for multi-connection download.
fn plan_chunks(total_size: u64, requested_connections: u32) -> Vec<ChunkPlan> {
    if total_size == 0 {
        return vec![];
    }

    let n = std::cmp::min(requested_connections as u64, total_size / MIN_CHUNK_SIZE).max(1) as u32;

    let chunk_size = total_size / n as u64;
    (0..n)
        .map(|i| {
            let range_start = i as u64 * chunk_size;
            let range_end = if i == n - 1 {
                total_size - 1
            } else {
                (i as u64 + 1) * chunk_size - 1
            };
            ChunkPlan {
                connection_num: i,
                range_start,
                range_end,
            }
        })
        .collect()
}

/// Download a single chunk with retry logic.
async fn download_chunk(
    client: &reqwest::Client,
    url: &str,
    chunk: &ChunkPlan,
    temp_dir: &Path,
    options: &DownloadOptions,
    counter: Arc<AtomicU64>,
    cancel_token: CancellationToken,
) -> Result<u64, CraneError> {
    let chunk_path = temp_dir.join(format!("chunk_{}", chunk.connection_num));
    let mut last_error: Option<CraneError> = None;

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            let _ = tokio::fs::remove_file(&chunk_path).await;
            let backoff = RETRY_BACKOFF_MS[(attempt - 1) as usize];
            tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
        }

        // Reset counter for this chunk on retry
        counter.store(0, Ordering::Relaxed);

        let request = client.get(url).header(
            "Range",
            format!("bytes={}-{}", chunk.range_start, chunk.range_end),
        );

        let request = super::download::apply_options_headers(request, options);

        let response = match request.send().await {
            Ok(r) => r,
            Err(e) => {
                let err = CraneError::Network(e);
                if attempt == MAX_RETRIES {
                    return Err(err);
                }
                last_error = Some(err);
                continue;
            }
        };

        let status = response.status();
        if status.is_server_error() {
            let err = CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            };
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }
        if !status.is_success() {
            return Err(CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            });
        }

        let mut file = tokio::fs::File::create(&chunk_path).await?;
        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;

        let mut stream_err = None;
        loop {
            tokio::select! {
                chunk_result = stream.next() => {
                    match chunk_result {
                        Some(Ok(bytes)) => {
                            file.write_all(&bytes).await?;
                            downloaded += bytes.len() as u64;
                            counter.store(downloaded, Ordering::Relaxed);
                        }
                        Some(Err(e)) => {
                            stream_err = Some(CraneError::Network(e));
                            break;
                        }
                        None => break,
                    }
                }
                _ = cancel_token.cancelled() => {
                    file.shutdown().await?;
                    return Ok(downloaded);
                }
            }
        }

        file.shutdown().await?;

        if let Some(err) = stream_err {
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }

        return Ok(downloaded);
    }

    Err(last_error.unwrap_or_else(|| CraneError::Http {
        status: 0,
        message: "unknown error".to_string(),
    }))
}

/// Download a file using multiple connections with byte-range splitting.
///
/// If the server supports range requests and the file size is known,
/// splits the download into parallel chunks. Otherwise falls back to
/// single-connection download.
pub async fn download<F>(
    url: &str,
    save_path: &Path,
    options: &DownloadOptions,
    on_progress: F,
) -> Result<DownloadResult, CraneError>
where
    F: Fn(&DownloadProgress) + Send + Sync + 'static,
{
    // Validate URL
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    // Analyze URL to determine resumability and size
    let analysis = analyze_url(url).await?;

    let requested_connections = options.connections.unwrap_or(DEFAULT_CONNECTIONS);

    // Create cancellation token before eligibility check so it's available for
    // both the multi-connection path and the single-connection fallback.
    let cancel_token = CancellationToken::new();

    // Check if multi-connection is eligible
    let multi_eligible =
        analysis.resumable && analysis.total_size.is_some() && requested_connections > 1;

    if !multi_eligible {
        return super::download::download_file_with_token(
            url,
            save_path,
            options,
            on_progress,
            cancel_token,
        )
        .await;
    }

    let total_size = analysis.total_size.unwrap();
    let start_time = Instant::now();

    // Plan chunks
    let chunks = plan_chunks(total_size, requested_connections);
    let num_chunks = chunks.len();

    // Build HTTP client
    let ua = options
        .user_agent
        .as_deref()
        .unwrap_or(USER_AGENT)
        .to_string();
    let client = reqwest::Client::builder()
        .user_agent(ua)
        .build()
        .map_err(CraneError::Network)?;

    // Create temp directory
    let temp_dir = temp_dir_path(save_path);
    tokio::fs::create_dir_all(&temp_dir).await?;

    // Create shared progress counters (one per chunk)
    let counters: Vec<Arc<AtomicU64>> = (0..num_chunks)
        .map(|_| Arc::new(AtomicU64::new(0)))
        .collect();

    // Wrap on_progress in Arc for sharing
    let on_progress = Arc::new(on_progress);
    let progress_on_progress = on_progress.clone();

    // Spawn progress reporter task
    let progress_counters: Vec<Arc<AtomicU64>> = counters.iter().map(Arc::clone).collect();
    let progress_chunks: Vec<ChunkPlan> = chunks.clone();
    let progress_stop = Arc::new(AtomicBool::new(false));
    let progress_stop_clone = progress_stop.clone();

    let progress_handle = tokio::spawn(async move {
        let mut last_total: u64 = 0;
        let mut last_speed_time = Instant::now();

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(PROGRESS_INTERVAL_MS)).await;

            if progress_stop_clone.load(Ordering::Relaxed) {
                break;
            }

            let mut connections = Vec::with_capacity(progress_chunks.len());
            let mut total_downloaded: u64 = 0;

            for (i, chunk) in progress_chunks.iter().enumerate() {
                let downloaded = progress_counters[i].load(Ordering::Relaxed);
                total_downloaded += downloaded;
                connections.push(ConnectionProgress {
                    connection_num: chunk.connection_num,
                    downloaded,
                    range_start: chunk.range_start,
                    range_end: chunk.range_end,
                });
            }

            total_downloaded = total_downloaded.max(last_total);

            let elapsed = last_speed_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                (total_downloaded.saturating_sub(last_total)) as f64 / elapsed
            } else {
                0.0
            };

            let eta = if speed > 0.0 {
                let remaining = total_size.saturating_sub(total_downloaded);
                Some((remaining as f64 / speed) as u64)
            } else {
                None
            };

            progress_on_progress(&DownloadProgress {
                download_id: String::new(),
                downloaded_size: total_downloaded,
                total_size: Some(total_size),
                speed,
                eta_seconds: eta,
                connections,
            });

            last_total = total_downloaded;
            last_speed_time = Instant::now();
        }
    });

    // Spawn chunk download tasks
    let mut join_set = JoinSet::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let client = client.clone();
        let url = url.to_string();
        let chunk = chunk.clone();
        let temp_dir = temp_dir.clone();
        let options = options.clone();
        let counter = Arc::clone(&counters[i]);
        let token = cancel_token.child_token();

        join_set.spawn(async move {
            download_chunk(&client, &url, &chunk, &temp_dir, &options, counter, token).await
        });
    }

    // Collect results — abort all on first permanent failure
    let mut first_error: Option<CraneError> = None;

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(_bytes)) => {}
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                    join_set.abort_all(); // abort remaining tasks
                }
            }
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some(CraneError::Config(format!("task join error: {e}")));
                    join_set.abort_all();
                }
            }
        }
    }

    // Stop progress reporter
    progress_stop.store(true, Ordering::Relaxed);
    let _ = progress_handle.await;

    // If any task failed, clean up and return error
    if let Some(err) = first_error {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(err);
    }

    // Merge chunk files into final file
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut final_file = tokio::fs::File::create(save_path).await?;
    let mut merged_bytes: u64 = 0;

    let mut buf = vec![0u8; 65_536];
    for i in 0..num_chunks {
        let chunk_path = temp_dir.join(format!("chunk_{i}"));
        let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
        loop {
            let n = chunk_file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            final_file.write_all(&buf[..n]).await?;
            merged_bytes += n as u64;
        }
    }

    final_file.shutdown().await?;

    // Verify total bytes
    if merged_bytes != total_size {
        let _ = tokio::fs::remove_file(save_path).await;
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(CraneError::Config(format!(
            "merge size mismatch: expected {total_size}, got {merged_bytes}"
        )));
    }

    // Cleanup temp directory
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    // Final progress callback
    let elapsed = start_time.elapsed();
    let speed = if elapsed.as_secs_f64() > 0.0 {
        merged_bytes as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    on_progress(&DownloadProgress {
        download_id: String::new(),
        downloaded_size: merged_bytes,
        total_size: Some(total_size),
        speed,
        eta_seconds: Some(0),
        connections: chunks
            .iter()
            .map(|c| ConnectionProgress {
                connection_num: c.connection_num,
                downloaded: c.range_end - c.range_start + 1,
                range_start: c.range_start,
                range_end: c.range_end,
            })
            .collect(),
    });

    Ok(DownloadResult {
        downloaded_bytes: merged_bytes,
        elapsed_ms: elapsed.as_millis() as u64,
        final_path: save_path.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn noop_progress(_: &DownloadProgress) {}

    /// Helper: responds to Range requests with the correct byte slice.
    struct RangeResponder {
        body: Vec<u8>,
    }

    impl wiremock::Respond for RangeResponder {
        fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
            if let Some(range_header) = request.headers.get(&reqwest::header::RANGE) {
                let range_str = range_header.to_str().unwrap();
                let range = range_str.trim_start_matches("bytes=");
                let parts: Vec<&str> = range.split('-').collect();
                let start: usize = parts[0].parse().unwrap();
                let end: usize = parts[1].parse().unwrap();
                let slice = &self.body[start..=end];
                wiremock::ResponseTemplate::new(206)
                    .set_body_bytes(slice.to_vec())
                    .insert_header("Content-Length", slice.len().to_string().as_str())
                    .insert_header(
                        "Content-Range",
                        format!("bytes {start}-{end}/{}", self.body.len()).as_str(),
                    )
            } else {
                wiremock::ResponseTemplate::new(200)
                    .set_body_bytes(self.body.clone())
                    .insert_header("Content-Length", self.body.len().to_string().as_str())
            }
        }
    }

    /// Mount HEAD mock that advertises Accept-Ranges: bytes and Content-Length.
    async fn mount_head_with_ranges(server: &MockServer, url_path: &str, size: u64) {
        Mock::given(method("HEAD"))
            .and(path(url_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Accept-Ranges", "bytes")
                    .insert_header("Content-Length", size.to_string().as_str())
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .mount(server)
            .await;
    }

    /// Mount HEAD mock without Accept-Ranges.
    async fn mount_head_no_ranges(server: &MockServer, url_path: &str, size: u64) {
        Mock::given(method("HEAD"))
            .and(path(url_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Length", size.to_string().as_str())
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .mount(server)
            .await;
    }

    /// Mount GET mock using RangeResponder.
    async fn mount_get_range(server: &MockServer, url_path: &str, body: &[u8]) {
        Mock::given(method("GET"))
            .and(path(url_path))
            .respond_with(RangeResponder {
                body: body.to_vec(),
            })
            .mount(server)
            .await;
    }

    // ── Test 1: Basic multi-connection download ──

    #[tokio::test]
    async fn test_multi_connection_basic() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/multi.bin", body.len() as u64).await;
        mount_get_range(&server, "/multi.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("multi.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/multi.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(result.final_path, save);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 2: Chunk splitting exact boundaries ──

    #[test]
    fn test_chunk_splitting_exact() {
        let chunks = plan_chunks(1_048_576, 4);
        assert_eq!(chunks.len(), 4);

        // Each chunk is 262144 bytes
        assert_eq!(chunks[0].range_start, 0);
        assert_eq!(chunks[0].range_end, 262_143);
        assert_eq!(chunks[1].range_start, 262_144);
        assert_eq!(chunks[1].range_end, 524_287);
        assert_eq!(chunks[2].range_start, 524_288);
        assert_eq!(chunks[2].range_end, 786_431);
        assert_eq!(chunks[3].range_start, 786_432);
        assert_eq!(chunks[3].range_end, 1_048_575);
    }

    // ── Test 3: Chunk splitting covers all bytes ──

    #[test]
    fn test_chunk_splitting_covers_all_bytes() {
        let chunks = plan_chunks(1_000_000, 7);

        // First starts at 0
        assert_eq!(chunks[0].range_start, 0);

        // Last ends at total_size - 1
        assert_eq!(chunks.last().unwrap().range_end, 999_999);

        // No gaps between chunks
        for window in chunks.windows(2) {
            assert_eq!(
                window[1].range_start,
                window[0].range_end + 1,
                "gap between chunk {} and {}",
                window[0].connection_num,
                window[1].connection_num
            );
        }
    }

    // ── Test 4: Fallback to single connection ──

    #[tokio::test]
    async fn test_fallback_to_single_connection() {
        let server = MockServer::start().await;
        let body = vec![0xABu8; 512 * 1024]; // 512KB

        // HEAD without Accept-Ranges → not resumable
        mount_head_no_ranges(&server, "/single.bin", body.len() as u64).await;

        // GET returns full body (single-connection fallback)
        Mock::given(method("GET"))
            .and(path("/single.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("single.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/single.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 5: Small file caps connections ──

    #[tokio::test]
    async fn test_small_file_caps_connections() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        mount_head_with_ranges(&server, "/small.bin", body.len() as u64).await;
        mount_get_range(&server, "/small.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("small.bin");

        let opts = DownloadOptions {
            connections: Some(8), // Request 8 but 512KB / 256KB = 2 max
            ..Default::default()
        };

        let result = download(
            &format!("{}/small.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);

        // Verify: plan_chunks would give at most 2 connections for 512KB
        let chunks = plan_chunks(body.len() as u64, 8);
        assert!(
            chunks.len() <= 2,
            "expected at most 2 chunks, got {}",
            chunks.len()
        );
    }

    // ── Test 6: Connection failure aborts download ──

    #[tokio::test]
    async fn test_connection_failure_aborts_download() {
        let server = MockServer::start().await;
        let size: u64 = 1_048_576;

        mount_head_with_ranges(&server, "/fail.bin", size).await;

        // GET always returns 500
        Mock::given(method("GET"))
            .and(path("/fail.bin"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("fail.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/fail.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await;

        assert!(
            result.is_err(),
            "download should fail when all connections return 500"
        );
        assert!(!save.exists(), "final file should not exist after failure");
    }

    // ── Test 7: Progress includes connections ──

    #[tokio::test]
    async fn test_progress_includes_connections() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/progress.bin", body.len() as u64).await;
        mount_get_range(&server, "/progress.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("progress.bin");

        let progress_log: Arc<Mutex<Vec<DownloadProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let log_clone = progress_log.clone();

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let _result = download(
            &format!("{}/progress.bin", server.uri()),
            &save,
            &opts,
            move |p: &DownloadProgress| {
                log_clone.lock().unwrap().push(p.clone());
            },
        )
        .await
        .unwrap();

        let log = progress_log.lock().unwrap();
        // At least one progress report should have connection info
        let has_connections = log.iter().any(|p| !p.connections.is_empty());
        assert!(
            has_connections,
            "at least one progress callback should include ConnectionProgress entries"
        );
    }

    // ── Test 8: Merge integrity with prime-modulus pattern ──

    #[tokio::test]
    async fn test_merge_integrity() {
        let server = MockServer::start().await;
        // Generate body with prime-modulus pattern to catch off-by-one errors
        let body: Vec<u8> = (0..1_048_576u64).map(|i| (i % 251) as u8).collect();

        mount_head_with_ranges(&server, "/integrity.bin", body.len() as u64).await;
        mount_get_range(&server, "/integrity.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("integrity.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/integrity.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        let saved = std::fs::read(&save).unwrap();
        assert_eq!(saved.len(), body.len(), "file size mismatch");
        assert_eq!(saved, body, "merged file is not byte-identical to source");
        assert_eq!(result.downloaded_bytes, body.len() as u64);
    }

    // ── Test 9: Temp dir cleaned on success ──

    #[tokio::test]
    async fn test_temp_dir_cleaned_on_success() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        mount_head_with_ranges(&server, "/cleanup.bin", body.len() as u64).await;
        mount_get_range(&server, "/cleanup.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cleanup.bin");

        let opts = DownloadOptions {
            connections: Some(2),
            ..Default::default()
        };

        let _result = download(
            &format!("{}/cleanup.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        let temp_dir = temp_dir_path(&save);
        assert!(
            !temp_dir.exists(),
            "temp dir {:?} should not exist after successful download",
            temp_dir
        );
        assert!(save.exists(), "final file should exist");
    }

    // ── Test 10: Custom headers in multi-connection download ──

    #[tokio::test]
    async fn test_custom_headers_in_multi() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/headers.bin", body.len() as u64).await;

        // Custom RangeResponder that also validates X-Custom header presence.
        // We use wiremock matchers to require the header on GET.
        struct CustomRangeResponder {
            body: Vec<u8>,
        }

        impl wiremock::Respond for CustomRangeResponder {
            fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
                if let Some(range_header) = request.headers.get(&reqwest::header::RANGE) {
                    let range_str = range_header.to_str().unwrap();
                    let range = range_str.trim_start_matches("bytes=");
                    let parts: Vec<&str> = range.split('-').collect();
                    let start: usize = parts[0].parse().unwrap();
                    let end: usize = parts[1].parse().unwrap();
                    let slice = &self.body[start..=end];
                    wiremock::ResponseTemplate::new(206)
                        .set_body_bytes(slice.to_vec())
                        .insert_header("Content-Length", slice.len().to_string().as_str())
                        .insert_header(
                            "Content-Range",
                            format!("bytes {start}-{end}/{}", self.body.len()).as_str(),
                        )
                } else {
                    wiremock::ResponseTemplate::new(200)
                        .set_body_bytes(self.body.clone())
                        .insert_header("Content-Length", self.body.len().to_string().as_str())
                }
            }
        }

        // GET requires X-Custom header
        Mock::given(method("GET"))
            .and(path("/headers.bin"))
            .and(header("X-Custom", "test-value"))
            .respond_with(CustomRangeResponder { body: body.clone() })
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("headers.bin");

        let mut custom_headers = HashMap::new();
        custom_headers.insert("X-Custom".to_string(), "test-value".to_string());

        let opts = DownloadOptions {
            connections: Some(4),
            headers: Some(custom_headers),
            ..Default::default()
        };

        let result = download(
            &format!("{}/headers.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 11: Fallback with explicit one connection ──

    #[tokio::test]
    async fn test_fallback_with_explicit_one_connection() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        // HEAD advertises Accept-Ranges (resumable), but connections=1 should
        // force single-connection path.
        mount_head_with_ranges(&server, "/one_conn.bin", body.len() as u64).await;

        // Mount a plain GET responder (single-connection path does not send Range header)
        Mock::given(method("GET"))
            .and(path("/one_conn.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("one_conn.bin");

        let opts = DownloadOptions {
            connections: Some(1),
            ..Default::default()
        };

        let result = download(
            &format!("{}/one_conn.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 12: Temp dir cleaned on failure ──

    #[tokio::test]
    async fn test_temp_dir_cleaned_on_failure() {
        let server = MockServer::start().await;
        let size: u64 = 1_048_576;

        mount_head_with_ranges(&server, "/fail_clean.bin", size).await;

        // GET always returns 500
        Mock::given(method("GET"))
            .and(path("/fail_clean.bin"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("fail_clean.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/fail_clean.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await;

        assert!(
            result.is_err(),
            "download should fail when all connections return 500"
        );

        let temp_dir = temp_dir_path(&save);
        assert!(
            !temp_dir.exists(),
            "temp dir {:?} should not exist after failed download",
            temp_dir
        );
        assert!(!save.exists(), "final file should not exist after failure");
    }

    // ── Test 13: Chunk retry success ──

    #[tokio::test]
    async fn test_chunk_retry_success() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 251) as u8).collect(); // 512KB

        mount_head_with_ranges(&server, "/retry_ok.bin", body.len() as u64).await;

        // First request to any chunk returns 500 (up_to_n_times(1)),
        // then the RangeResponder takes over for subsequent attempts.
        Mock::given(method("GET"))
            .and(path("/retry_ok.bin"))
            .respond_with(ResponseTemplate::new(500))
            .up_to_n_times(1)
            .expect(1)
            .mount(&server)
            .await;

        // Mount the successful range responder with lower priority (registered after the 500)
        mount_get_range(&server, "/retry_ok.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("retry_ok.bin");

        let opts = DownloadOptions {
            connections: Some(2),
            ..Default::default()
        };

        let result = download(
            &format!("{}/retry_ok.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 14: Pause and resume basic ──

    #[tokio::test]
    async fn test_pause_and_resume_basic() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/pause_resume.bin", body.len() as u64).await;
        mount_get_range(&server, "/pause_resume.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("pause_resume.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/pause_resume.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        // Let download progress for a bit
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        handle.pause().await;
        assert!(handle.is_paused(), "should be paused after pause()");

        // Resume the download
        handle.resume().await.unwrap();
        assert!(!handle.is_paused(), "should not be paused after resume()");

        // Wait for download to complete
        let result = handle.wait().await.unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 15: Cancel cleans up ──

    #[tokio::test]
    async fn test_cancel_cleans_up() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/cancel.bin", body.len() as u64).await;
        mount_get_range(&server, "/cancel.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cancel.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/cancel.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        handle.cancel().await;

        let temp_dir = temp_dir_path(&save);
        assert!(!temp_dir.exists(), "temp dir should not exist after cancel");
        assert!(!save.exists(), "final file should not exist after cancel");
    }

    /// Helper: responds to Range requests with a configurable delay to ensure
    /// the download is still in-progress when we pause.
    struct SlowRangeResponder {
        body: Vec<u8>,
        delay: std::time::Duration,
    }

    impl wiremock::Respond for SlowRangeResponder {
        fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
            let template = if let Some(range_header) = request.headers.get(&reqwest::header::RANGE)
            {
                let range_str = range_header.to_str().unwrap();
                let range = range_str.trim_start_matches("bytes=");
                let parts: Vec<&str> = range.split('-').collect();
                let start: usize = parts[0].parse().unwrap();
                let end: usize = parts[1].parse().unwrap();
                let slice = &self.body[start..=end];
                wiremock::ResponseTemplate::new(206)
                    .set_body_bytes(slice.to_vec())
                    .insert_header("Content-Length", slice.len().to_string().as_str())
                    .insert_header(
                        "Content-Range",
                        format!("bytes {start}-{end}/{}", self.body.len()).as_str(),
                    )
            } else {
                wiremock::ResponseTemplate::new(200)
                    .set_body_bytes(self.body.clone())
                    .insert_header("Content-Length", self.body.len().to_string().as_str())
            };
            template.set_delay(self.delay)
        }
    }

    /// Mount GET mock using SlowRangeResponder with a delay.
    async fn mount_get_range_slow(
        server: &MockServer,
        url_path: &str,
        body: &[u8],
        delay: std::time::Duration,
    ) {
        Mock::given(method("GET"))
            .and(path(url_path))
            .respond_with(SlowRangeResponder {
                body: body.to_vec(),
                delay,
            })
            .mount(server)
            .await;
    }

    // ── Test 16: Pause preserves chunk files ──

    #[tokio::test]
    async fn test_pause_preserves_chunk_files() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/preserve.bin", body.len() as u64).await;
        mount_get_range_slow(
            &server,
            "/preserve.bin",
            &body,
            std::time::Duration::from_secs(5),
        )
        .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("preserve.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/preserve.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        handle.pause().await;

        // Wait for the spawned task to settle
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let temp_dir = temp_dir_path(&save);
        assert!(temp_dir.exists(), "temp dir should still exist after pause");
    }

    // ── Test 17: Resume sends HEAD request ──

    #[tokio::test]
    async fn test_resume_sends_head_request() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        // Use mount_as_scoped so we can verify the expected count
        let head_guard = Mock::given(method("HEAD"))
            .and(path("/head_check.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Accept-Ranges", "bytes")
                    .insert_header("Content-Length", body.len().to_string().as_str())
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .expect(2) // Once for start_download, once for resume
            .mount_as_scoped(&server)
            .await;

        mount_get_range(&server, "/head_check.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("head_check.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/head_check.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        handle.pause().await;
        handle.resume().await.unwrap();

        let result = handle.wait().await.unwrap();
        assert_eq!(result.downloaded_bytes, body.len() as u64);

        // Drop the scoped guard to trigger verification of expect(2)
        drop(head_guard);
    }

    // ── Test 18: Multiple pause/resume cycles ──

    #[tokio::test]
    async fn test_multiple_pause_resume_cycles() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/cycles.bin", body.len() as u64).await;
        mount_get_range(&server, "/cycles.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cycles.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/cycles.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        // Cycle 1
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        handle.pause().await;
        handle.resume().await.unwrap();

        // Cycle 2
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        handle.pause().await;
        handle.resume().await.unwrap();

        let result = handle.wait().await.unwrap();
        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 19: Cancel during pause ──

    #[tokio::test]
    async fn test_cancel_during_pause() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/cancel_pause.bin", body.len() as u64).await;
        mount_get_range(&server, "/cancel_pause.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cancel_pause.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/cancel_pause.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        handle.pause().await;
        assert!(handle.is_paused());

        // Cancel while paused
        handle.cancel().await;

        let temp_dir = temp_dir_path(&save);
        assert!(
            !temp_dir.exists(),
            "temp dir should not exist after cancel during pause"
        );
        assert!(
            !save.exists(),
            "final file should not exist after cancel during pause"
        );
    }

    // ── Test 20: Single connection pause/resume ──

    #[tokio::test]
    async fn test_single_connection_pause_resume() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        // HEAD without Accept-Ranges => single-connection fallback
        mount_head_no_ranges(&server, "/single_pr.bin", body.len() as u64).await;

        Mock::given(method("GET"))
            .and(path("/single_pr.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("single_pr.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let handle = start_download(
            &format!("{}/single_pr.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        handle.pause().await;
        handle.resume().await.unwrap();

        let result = handle.wait().await.unwrap();
        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }
}
