use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use chrono::Timelike;
use tokio::sync::Mutex;
use tokio::sync::RwLock;

use crate::config::types::SpeedScheduleEntry;

const MAX_BURST_BYTES: u64 = 131_072; // 128KB = 2x chunk size

pub struct BandwidthLimiter {
    /// Global limit in bytes/sec. 0 means unlimited.
    limit: AtomicU64,
    /// Available token balance (bytes).
    available: Mutex<f64>,
    /// Timestamp of last refill.
    last_refill: Mutex<Instant>,
    /// Maximum burst allowance in bytes.
    max_burst: u64,
    /// Schedule entries for time-of-day limits.
    schedule: RwLock<Vec<SpeedScheduleEntry>>,
    /// Base limit from config (used when no schedule entry matches).
    base_limit: AtomicU64,
}

impl BandwidthLimiter {
    /// Create a new limiter. `limit` is bytes/sec, `None` means unlimited.
    pub fn new(limit: Option<u64>, schedule: Vec<SpeedScheduleEntry>) -> Self {
        let limit_val = limit.unwrap_or(0);
        Self {
            limit: AtomicU64::new(limit_val),
            available: Mutex::new(MAX_BURST_BYTES as f64),
            last_refill: Mutex::new(Instant::now()),
            max_burst: MAX_BURST_BYTES,
            schedule: RwLock::new(schedule),
            base_limit: AtomicU64::new(limit_val),
        }
    }

    /// Wait until `bytes` worth of tokens are available.
    /// Returns immediately if limit is 0 (unlimited).
    pub async fn acquire(&self, bytes: u64) {
        let effective_limit = self.current_limit().await;
        if effective_limit == 0 {
            return;
        }

        // Update the active limit (schedule may have changed it)
        self.limit.store(effective_limit, Ordering::Relaxed);

        // Refill tokens and check availability
        let sleep_duration = {
            let mut available = self.available.lock().await;
            let mut last_refill = self.last_refill.lock().await;

            let elapsed = last_refill.elapsed().as_secs_f64();
            *available += elapsed * effective_limit as f64;
            if *available > self.max_burst as f64 {
                *available = self.max_burst as f64;
            }
            *last_refill = Instant::now();

            if *available >= bytes as f64 {
                *available -= bytes as f64;
                return;
            }

            // Not enough tokens — deduct fully (go negative) so concurrent
            // acquirers see the debt and queue behind us.
            let deficit = bytes as f64 - *available;
            *available -= bytes as f64;
            deficit / effective_limit as f64
        };

        tokio::time::sleep(std::time::Duration::from_secs_f64(sleep_duration)).await;
    }

    /// Dynamically update the bandwidth limit (bytes/sec). 0 or None = unlimited.
    pub fn set_limit(&self, limit: Option<u64>) {
        let val = limit.unwrap_or(0);
        self.base_limit.store(val, Ordering::Relaxed);
        self.limit.store(val, Ordering::Relaxed);
    }

    /// Update the speed schedule entries.
    pub async fn set_schedule(&self, schedule: Vec<SpeedScheduleEntry>) {
        let mut guard = self.schedule.write().await;
        *guard = schedule;
    }

    /// Resolve the effective limit: check schedule first, fall back to base limit.
    async fn current_limit(&self) -> u64 {
        let schedule = self.schedule.read().await;
        if schedule.is_empty() {
            return self.base_limit.load(Ordering::Relaxed);
        }

        let current_hour = chrono::Local::now().hour() as u8;
        for entry in schedule.iter() {
            let matches = if entry.start_hour <= entry.end_hour {
                current_hour >= entry.start_hour && current_hour < entry.end_hour
            } else {
                // Wraps midnight: e.g. start=22, end=6
                current_hour >= entry.start_hour || current_hour < entry.end_hour
            };
            if matches {
                return entry.limit.unwrap_or(0);
            }
        }

        self.base_limit.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn unlimited_returns_immediately() {
        let limiter = BandwidthLimiter::new(None, vec![]);
        let start = Instant::now();
        limiter.acquire(1_000_000).await;
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn rate_limiting_slows_transfer() {
        // 500 KB/s limit, request 500KB after draining burst
        let limiter = BandwidthLimiter::new(Some(500_000), vec![]);
        limiter.acquire(MAX_BURST_BYTES).await; // drain burst

        let start = Instant::now();
        limiter.acquire(500_000).await;
        let elapsed = start.elapsed();

        assert!(elapsed >= Duration::from_millis(800), "took only {elapsed:?}");
        assert!(
            elapsed <= Duration::from_millis(1500),
            "took too long: {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn burst_allows_immediate_small_request() {
        let limiter = BandwidthLimiter::new(Some(100_000), vec![]);
        let start = Instant::now();
        limiter.acquire(65_536).await; // 64KB, within 128KB burst
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn dynamic_limit_update() {
        let limiter = BandwidthLimiter::new(Some(100_000), vec![]);
        limiter.acquire(MAX_BURST_BYTES).await; // drain burst

        limiter.set_limit(None); // set to unlimited
        let start = Instant::now();
        limiter.acquire(1_000_000).await;
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn concurrent_acquirers_share_budget() {
        use std::sync::Arc;
        let limiter = Arc::new(BandwidthLimiter::new(Some(300_000), vec![]));
        limiter.acquire(MAX_BURST_BYTES).await; // drain burst

        let start = Instant::now();
        let mut handles = vec![];
        for _ in 0..3 {
            let lim = limiter.clone();
            handles.push(tokio::spawn(async move {
                lim.acquire(100_000).await;
            }));
        }
        for h in handles {
            h.await.unwrap();
        }
        let elapsed = start.elapsed();
        assert!(elapsed >= Duration::from_millis(800), "too fast: {elapsed:?}");
        assert!(
            elapsed <= Duration::from_millis(1500),
            "too slow: {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn schedule_overrides_base_limit() {
        use chrono::Local;
        use chrono::Timelike;
        let current_hour = Local::now().hour() as u8;
        let entry = SpeedScheduleEntry {
            start_hour: current_hour,
            end_hour: current_hour.wrapping_add(1),
            limit: None, // unlimited for this hour
        };
        let limiter = BandwidthLimiter::new(Some(1_000), vec![entry]); // base very slow
        limiter.acquire(MAX_BURST_BYTES).await; // drain burst

        let start = Instant::now();
        limiter.acquire(1_000_000).await;
        assert!(start.elapsed() < Duration::from_millis(50));
    }
}
