# CLAUDE.md

## Project Overview

**Crane** — open-source cross-platform download manager. Tauri v2 (Rust backend) + SolidJS frontend. Multi-connection HTTP/HTTPS/FTP downloads, pause/resume, queue management, browser extension integration.

- **License:** MIT OR Apache-2.0
- **Platforms:** macOS (Apple Silicon + Intel), Windows 10+, Linux (X11 + Wayland)

## Architecture

```
Crane/
├── crates/
│   ├── crane-core/          # Standalone Rust library — zero Tauri dependency
│   └── crane-native-host/   # Native messaging host for browser extensions
├── src-tauri/               # Tauri v2 app shell (IPC commands, tray, notifications)
├── src/                     # SolidJS + Tailwind CSS frontend
├── extensions/
│   ├── chrome/              # Chrome MV3 extension (functional)
│   └── firefox/             # Firefox extension (stub)
├── native-messaging/        # Host manifest templates + install script
├── scripts/                 # bump-version.sh
└── .github/workflows/       # CI (test matrix), nightly, release
```

### Key Constraints

- `crane-core` must **never** import Tauri. All Tauri interaction goes through `src-tauri/src/commands/`.
- Progress updates use Tauri v2 **IPC Channels** (not regular events) — avoids JSON serialization overhead at 250ms intervals.
- SQLite in WAL mode. DB writes for progress debounced to every 5s; live state lives in Rust memory.
- Browser extension uses **native messaging** (JSON-over-stdin/stdout, 4-byte little-endian length prefix).
- SSRF protection in `crane-core/src/network.rs` — blocks localhost, private IPs (10.x, 172.16.x, 192.168.x, 169.254.x), validates redirect chains.

## Commands

```bash
# Rust
cargo check --workspace            # Fast compilation check
cargo test --workspace             # All Rust tests
cargo test -p crane-core           # Core library tests only
cargo test -p crane-core test_name # Single test
cargo clippy --workspace           # Lint
cargo fmt --all                    # Format

# Tauri dev
npx tauri dev                      # NOT cargo tauri dev — Tauri CLI is npm-installed

# Build production app
npx tauri build

# Version bump
./scripts/bump-version.sh 0.2.0   # Updates all Cargo.toml + tauri.conf.json
```

## Key Files

| File | Purpose |
|------|---------|
| `crates/crane-core/src/lib.rs` | Core library entry — exports all modules |
| `crates/crane-core/src/engine/multi.rs` | Multi-connection download engine |
| `crates/crane-core/src/engine/download.rs` | Single-connection downloader |
| `crates/crane-core/src/engine/chaos_responders.rs` | Shared adversarial test mocks |
| `crates/crane-core/src/queue/mod.rs` | Queue manager — concurrency, slot promotion |
| `crates/crane-core/src/db/mod.rs` | SQLite schema + Database::open() |
| `crates/crane-core/src/bandwidth.rs` | Global token bucket bandwidth limiter |
| `crates/crane-core/src/network.rs` | SSRF protection layer |
| `crates/crane-core/src/protocol/ftp.rs` | FTP downloads |
| `src-tauri/src/main.rs` | Tauri app init, plugin registration, monitor loop |
| `src-tauri/src/commands/` | 19 IPC command handlers (downloads, settings, files, system) |
| `src-tauri/tauri.conf.json` | Tauri config (window size, CSP, updater, bundling) |
| `extensions/chrome/service-worker.js` | Chrome extension — intercepts downloads via native messaging |

## Database

SQLite at `{dirs::data_dir()}/crane/crane.db`. Five tables:

| Table | Purpose |
|-------|---------|
| `downloads` | Download records (url, filename, status, progress, category, queue_position) |
| `connections` | Byte-range chunks per download (start_byte, end_byte, status) |
| `speed_history` | Sparkline data for speed graphs |
| `retry_log` | Failure history per download |
| `site_settings` | Per-domain preferences |

## Download Engine Flow

1. **Analyze** — HEAD request → filename, size, MIME type, resumability
2. **Plan** — Split into byte-range chunks (min 256KB), create `{save_path}.crane_tmp/`
3. **Download** — Parallel tokio tasks with Range headers, 64KB streaming, retry 1s/2s/4s backoff
4. **Merge** — Sequential chunk assembly, temp dir cleanup

## Status State Machine

```
pending → analyzing → downloading → completed
              │              │
              │              ├→ paused → downloading
              │              └→ failed → downloading (retry)
              └→ queued → downloading (when slot opens)
```

## Configuration

TOML at `{dirs::config_dir()}/crane/config.toml`. Sections: General, Downloads (8 connections default, 3 max concurrent), FileOrganization, Network (proxy support), Appearance (theme, font size, density).

## Scope

**Implemented:** HTTP/HTTPS multi-connection downloads, FTP downloads, pause/resume/retry, queue management (auto-promotion), bandwidth limiting (global token bucket, schedule-aware), auto-resume on restart, config validation (clamp + warn), Chrome MV3 extension, native messaging host, system tray, file categorization, hash verification (SHA256/MD5), SSRF protection, SQLite persistence, TOML config, SolidJS frontend with download list, detail panel, settings, keyboard shortcuts.

**Future:** Firefox extension, yt-dlp integration, HLS/DASH streams.


## Frontend Stack

- **Framework:** SolidJS — fine-grained reactivity, no virtual DOM
- **Styling:** Tailwind CSS — utility-first, design tokens mapped to Tailwind config
- **Components:** Kobalte (headless) + custom styles
- **Build:** Vite
- **Design reference:** `Crane.pen` file

## Git & Commit Rules

- **Small, focused commits** — one logical change per commit.
- **Verify CI locally before pushing.** Run `cargo fmt --all -- --check && cargo clippy --workspace && cargo test -p crane-core -p crane-native-host` and confirm all pass before committing and pushing. Do not push code that breaks CI.

## Key Rust Crates

| Crate | Purpose |
|-------|---------|
| `reqwest` 0.12 (stream, cookies, rustls-tls) | HTTP client |
| `rusqlite` 0.32 (bundled) | SQLite — no system dependency |
| `tokio` 1 (full) | Async runtime |
| `suppaftp` 6 (async-rustls) | FTP protocol |
| `tauri` 2 (tray-icon) | Desktop app shell |
| `wiremock` | Mock HTTP servers (dev) |
| `tempfile` | Temp directories (dev) |

## Testing

**Tests are mandatory.** Every feature/bugfix must include tests.

```bash
cargo test --workspace              # All tests
cargo test -p crane-core            # Core only
cargo test -p crane-core chaos_     # Chaos tests only
```

- Tests are inline (`mod tests { ... }` at bottom of each file)
- `wiremock` for mock HTTP, `tempfile` for temp dirs, `tokio-test` for async

### Chaos / Adversarial Tests

Tests prefixed `chaos_` simulate hostile conditions. Shared responders in `engine/chaos_responders.rs`:

`TruncatingResponder`, `RangeIgnoringResponder`, `SlowTrickleResponder`, `ContentMorphingResponder`, `IntermittentFailResponder`, `GarbagePayloadResponder`, `FailThenSucceedResponder`, `IntermittentRangeResponder` — reuse these, don't build one-off mocks.

## Gotchas

- **`npx tauri dev` not `cargo tauri dev`** — Tauri CLI is installed via npm, not cargo.
- **Bandwidth limiter is global** — one shared token bucket across ALL active downloads, including FTP (`bandwidth.rs`).
- **Config values are clamped** — invalid values (e.g. `max_concurrent: 0`) are silently corrected to nearest valid bound. Warnings logged to stderr with `[config]` prefix.
- **Progress streaming** — uses IPC Channels, not Tauri events. Don't add `app.emit()` for progress; use the channel pattern in `commands/downloads.rs`.
- **DB schema is versioned** — `schema_version` table tracks migration state. Add new migrations as `migrate_vN_to_vN+1()` functions in `db/mod.rs`. Never modify existing migration functions.
- **DB writes are debounced** — progress state lives in memory (QueueManager's HashMap). Only flushed to SQLite every 5s. Don't query DB for real-time progress.
- **Extension errors log to service worker console** — all catch blocks in `service-worker.js` log to `console.warn`/`console.error` with `[crane]` prefix. Debug via `chrome://extensions` → service worker "Inspect".
- **Auth headers forwarded from extension** — `Authorization` headers captured via `webRequest.onBeforeSendHeaders`, cached 30s, stored as JSON in the `headers` DB column. Engine applies them via `apply_options_headers()`.
- **Download deduplication** — native host skips insert if a pending/active download with the same URL already exists. Completed/failed downloads are not deduplicated.
- **Extension file size filter** — downloads below `minFileSize` (default 1MB) skip Crane and stay in browser. Context menu downloads always go to Crane. Configurable in popup.
- **Native host retry** — `sendToNativeHost` retries up to 2 times with 500ms delay on connection errors before falling back to browser.
- **Firefox extension is a stub** — only `.gitkeep` exists. Chrome extension is fully functional.
- **Native messaging protocol** — 4-byte little-endian length prefix + UTF-8 JSON. Max 1MB per message.
- **`docs/plans/` is gitignored** — working documents, never commit.
