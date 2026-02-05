// Multi-connection HTTP/HTTPS downloader with byte-range splitting

use std::path::{Path, PathBuf};

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult};

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
    let n = std::cmp::min(
        requested_connections as u64,
        total_size / MIN_CHUNK_SIZE,
    )
    .max(1) as u32;

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
    todo!("will be implemented in Task 3")
}
