// Adversarial / chaos wiremock responders for testing hostile network behaviors.
//
// These are reusable `wiremock::Respond` implementations that simulate
// real-world server misbehavior: truncated responses, range-ignoring servers,
// slow trickle connections, content morphing between requests, intermittent
// failures, and garbage payloads (e.g. captive portals).

#![cfg(test)]

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

/// Sends `Content-Length: body.len()` but only delivers `truncate_after` bytes.
///
/// Simulates a server that drops the connection mid-transfer.
pub struct TruncatingResponder {
    pub body: Vec<u8>,
    /// Number of bytes to actually send before "dropping" the connection.
    pub truncate_after: usize,
}

impl wiremock::Respond for TruncatingResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        let advertised_len = self.body.len();
        let actual = &self.body[..self.truncate_after.min(self.body.len())];
        wiremock::ResponseTemplate::new(200)
            .set_body_bytes(actual.to_vec())
            .insert_header("Content-Length", advertised_len.to_string().as_str())
    }
}

/// Advertises `Accept-Ranges: bytes` in HEAD but ignores the `Range` header
/// on GET, always returning the full body with a 200 (not 206).
///
/// Simulates servers that claim to support range requests but don't actually
/// honor them — a surprisingly common real-world scenario.
pub struct RangeIgnoringResponder {
    pub body: Vec<u8>,
}

impl wiremock::Respond for RangeIgnoringResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        // Always return full body regardless of any Range header
        wiremock::ResponseTemplate::new(200)
            .set_body_bytes(self.body.clone())
            .insert_header("Content-Length", self.body.len().to_string().as_str())
    }
}

/// Sends data but with a configurable delay, simulating a slow/stalling
/// connection (e.g. saturated server, poor network).
pub struct SlowTrickleResponder {
    pub body: Vec<u8>,
    pub delay: std::time::Duration,
}

impl wiremock::Respond for SlowTrickleResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        wiremock::ResponseTemplate::new(200)
            .set_body_bytes(self.body.clone())
            .insert_header("Content-Length", self.body.len().to_string().as_str())
            .set_delay(self.delay)
    }
}

/// Returns different body content on each successive GET call, while keeping
/// the same Content-Length. Simulates a remote file being updated between
/// pause and resume.
///
/// - First call returns `body_v1`
/// - Subsequent calls return `body_v2`
pub struct ContentMorphingResponder {
    pub body_v1: Vec<u8>,
    pub body_v2: Vec<u8>,
    call_count: Arc<AtomicU32>,
}

impl ContentMorphingResponder {
    pub fn new(body_v1: Vec<u8>, body_v2: Vec<u8>) -> Self {
        Self {
            body_v1,
            body_v2,
            call_count: Arc::new(AtomicU32::new(0)),
        }
    }
}

impl wiremock::Respond for ContentMorphingResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        let count = self.call_count.fetch_add(1, Ordering::SeqCst);
        let body = if count == 0 {
            &self.body_v1
        } else {
            &self.body_v2
        };
        wiremock::ResponseTemplate::new(200)
            .set_body_bytes(body.clone())
            .insert_header("Content-Length", body.len().to_string().as_str())
    }
}

/// Fails every Nth request with a 500 Internal Server Error.
/// All other requests succeed with the provided body.
///
/// Useful for testing retry logic under intermittent failures.
pub struct IntermittentFailResponder {
    pub body: Vec<u8>,
    /// Fail every Nth request (1-indexed). E.g., `fail_every: 2` fails
    /// requests 2, 4, 6, etc.
    pub fail_every: u32,
    call_count: Arc<AtomicU32>,
}

impl IntermittentFailResponder {
    pub fn new(body: Vec<u8>, fail_every: u32) -> Self {
        Self {
            body,
            fail_every,
            call_count: Arc::new(AtomicU32::new(0)),
        }
    }
}

impl wiremock::Respond for IntermittentFailResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        let count = self.call_count.fetch_add(1, Ordering::SeqCst) + 1;
        if count % self.fail_every == 0 {
            wiremock::ResponseTemplate::new(500)
        } else {
            wiremock::ResponseTemplate::new(200)
                .set_body_bytes(self.body.clone())
                .insert_header("Content-Length", self.body.len().to_string().as_str())
        }
    }
}

/// Returns 200 OK but with an HTML body instead of the expected binary data.
///
/// Simulates captive portals (e.g. airport/hotel WiFi login pages) that
/// intercept requests and return HTML regardless of what was asked for.
pub struct GarbagePayloadResponder {
    pub html_body: String,
}

impl Default for GarbagePayloadResponder {
    fn default() -> Self {
        Self {
            html_body: r#"<!DOCTYPE html><html><body><h1>WiFi Login Required</h1><p>Please connect to continue.</p></body></html>"#.to_string(),
        }
    }
}

impl wiremock::Respond for GarbagePayloadResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        wiremock::ResponseTemplate::new(200)
            .set_body_string(&self.html_body)
            .insert_header("Content-Type", "text/html")
            .insert_header("Content-Length", self.html_body.len().to_string().as_str())
    }
}

/// Responder that fails for the first N requests, then succeeds.
/// Useful for testing retry recovery.
pub struct FailThenSucceedResponder {
    pub body: Vec<u8>,
    /// Number of initial requests that should fail with 500.
    pub fail_count: u32,
    call_count: Arc<AtomicU32>,
}

impl FailThenSucceedResponder {
    pub fn new(body: Vec<u8>, fail_count: u32) -> Self {
        Self {
            body,
            fail_count,
            call_count: Arc::new(AtomicU32::new(0)),
        }
    }
}

impl wiremock::Respond for FailThenSucceedResponder {
    fn respond(&self, _request: &wiremock::Request) -> wiremock::ResponseTemplate {
        let count = self.call_count.fetch_add(1, Ordering::SeqCst);
        if count < self.fail_count {
            wiremock::ResponseTemplate::new(500)
                .insert_header("Content-Length", "0")
        } else {
            wiremock::ResponseTemplate::new(200)
                .set_body_bytes(self.body.clone())
                .insert_header("Content-Length", self.body.len().to_string().as_str())
        }
    }
}

/// Range-aware responder that fails the first N requests for a specific chunk,
/// then serves the correct range data. Used for multi-connection retry tests.
pub struct IntermittentRangeResponder {
    pub body: Vec<u8>,
    /// Number of initial requests that should fail with 500.
    pub fail_count: u32,
    call_count: Arc<AtomicU32>,
}

impl IntermittentRangeResponder {
    pub fn new(body: Vec<u8>, fail_count: u32) -> Self {
        Self {
            body,
            fail_count,
            call_count: Arc::new(AtomicU32::new(0)),
        }
    }
}

impl wiremock::Respond for IntermittentRangeResponder {
    fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
        let count = self.call_count.fetch_add(1, Ordering::SeqCst);
        if count < self.fail_count {
            return wiremock::ResponseTemplate::new(500);
        }

        // Handle range requests
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
