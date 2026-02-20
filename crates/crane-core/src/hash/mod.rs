use crate::types::CraneError;
use md5::Md5;
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::io::AsyncReadExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HashAlgorithm {
    Sha256,
    Md5,
}

/// Compute hash of a file using the specified algorithm.
/// Reads in 64KB chunks to avoid loading the entire file into memory.
pub async fn compute_hash(path: &Path, algorithm: HashAlgorithm) -> Result<String, CraneError> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut buf = vec![0u8; 64 * 1024];

    match algorithm {
        HashAlgorithm::Sha256 => {
            let mut hasher = Sha256::new();
            loop {
                let n = file.read(&mut buf).await?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        HashAlgorithm::Md5 => {
            let mut hasher = Md5::new();
            loop {
                let n = file.read(&mut buf).await?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_sha256_known_value() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"hello world").unwrap();
        f.flush().unwrap();

        let hash = compute_hash(f.path(), HashAlgorithm::Sha256).await.unwrap();
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[tokio::test]
    async fn test_md5_known_value() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"hello world").unwrap();
        f.flush().unwrap();

        let hash = compute_hash(f.path(), HashAlgorithm::Md5).await.unwrap();
        assert_eq!(hash, "5eb63bbbe01eeed093cb22bb8f5acdc3");
    }

    #[tokio::test]
    async fn test_hash_nonexistent_file() {
        let result = compute_hash(
            Path::new("/tmp/nonexistent_crane_test_file"),
            HashAlgorithm::Sha256,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_hash_empty_file() {
        let f = NamedTempFile::new().unwrap();

        let hash = compute_hash(f.path(), HashAlgorithm::Sha256).await.unwrap();
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
