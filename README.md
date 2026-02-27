<div align="center">

<img src="src-tauri/icons/crane-icon.svg" alt="Crane" width="128" height="128" />

# Crane

**The download manager your browser should have been.**

Accelerated, multi-connection downloads. Built entirely in Rust.

[![CI](https://github.com/shamith16/Crane/actions/workflows/ci.yml/badge.svg)](https://github.com/shamith16/Crane/actions/workflows/ci.yml)
[![License: MIT/Apache-2.0](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-informational)](https://github.com/shamith16/Crane/releases)

<!-- TODO: Replace with actual app screenshot/demo GIF -->
<!-- ![Crane Screenshot](docs/assets/screenshot.png) -->

[Download](#download) &nbsp;&bull;&nbsp; [Features](#features) &nbsp;&bull;&nbsp; [How It Works](#how-it-works) &nbsp;&bull;&nbsp; [Build From Source](#build-from-source) &nbsp;&bull;&nbsp; [Contributing](#contributing)

</div>

---

## Why Crane?

Most download managers are either bloated Electron apps, abandonware from 2010, or closed-source tools you wouldn't trust with your network traffic.

Crane is different:

- **Pure Rust core** — the entire download engine, queue manager, and persistence layer are written in Rust. Zero garbage collection, zero runtime overhead.
- **Actually fast** — splits files into parallel byte-range chunks across up to 128 connections. A 1GB file downloads in segments simultaneously, not one slow stream.
- **Native, not wrapped** — built on [Tauri v2](https://v2.tauri.app), Crane runs as a true native app on every platform. ~15MB installed, not 200MB of bundled Chromium.
- **Battle-tested** — 242 tests including adversarial chaos scenarios that simulate truncated transfers, lying servers, captive portals, content morphing, and intermittent failures.
- **Open source, forever** — MIT / Apache-2.0 dual licensed. No telemetry, no accounts, no upsells.

---

## Features

### Downloads

- **Multi-connection acceleration** — splits files into parallel byte-range chunks (min 256KB each), downloading segments simultaneously with up to 128 connections per file
- **Pause, resume, retry** — interrupt anytime. Resume works across app restarts — per-chunk progress is checkpointed with CRC32 integrity verification
- **Smart queue** — configurable concurrent download limits (default 3, up to 20) with automatic slot promotion when downloads complete or fail
- **Crash recovery** — downloads interrupted by crash or force-close automatically resume on next launch
- **Hash verification** — post-download SHA-256 and MD5 integrity checks
- **FTP & FTPS** — full FTP protocol support with TLS, resume, retry, and bandwidth limiting

### Browser Integration

- **Chrome extension** (Manifest V3) — automatically intercepts browser downloads and accelerates them through Crane
- **Smart filtering** — configurable minimum file size threshold (default 1MB) — small files stay in the browser, large files go to Crane
- **Context menu** — right-click any link, image, or media element to "Download with Crane"
- **Auth-aware** — captures cookies and authorization headers from your browser session, so authenticated downloads from Google Drive, Dropbox, and similar services just work

### Control

- **Global bandwidth limiter** — shared token bucket across all active downloads with burst allowance
- **Speed scheduling** — set time-of-day bandwidth rules (e.g., unlimited at night, 5MB/s during work hours) with midnight-wrapping support
- **File categorization** — auto-organizes downloads into Documents, Video, Audio, Images, Archives, Software, or Other
- **SSRF protection** — blocks downloads targeting localhost, private IPs, link-local addresses, and AWS metadata endpoints. Validates every redirect hop.
- **Keyboard-first** — 13 shortcuts including `Cmd+A` select all, `Cmd+B` sidebar toggle, arrow key navigation, `Space` pause/resume, and `Cmd+,` settings

### Platform

- **macOS** — Apple Silicon and Intel, with optional notarization and code signing
- **Windows** — Windows 10+ with NSIS installer
- **Linux** — X11 and Wayland, `.deb` and `.AppImage` packages
- **System tray** — minimize to tray, background downloads
- **Auto-update** — built-in updater with signed releases
- **Dark & light themes** — system-aware with customizable accent color and font sizing

---

## How It Works

```
          ┌─────────────────────────────────────────────────────────┐
          │                     Crane Engine                        │
          │                                                         │
          │  1. ANALYZE ─── HEAD request ─── filename, size,        │
          │                                  MIME, resumability     │
          │                                                         │
          │  2. PLAN ────── split into N byte-range chunks          │
          │                 (min 256KB each)                        │
          │                                                         │
          │  3. DOWNLOAD ── parallel tokio tasks ── Range headers   │
          │                 64KB streaming ── retry 1s/2s/4s        │
          │                                                         │
          │  4. MERGE ───── sequential assembly ── hash verify      │
          │                 temp cleanup                            │
          └─────────────────────────────────────────────────────────┘

    Browser Extension                                  Native App
  ┌──────────────────┐     Native Messaging      ┌──────────────────┐
  │  Chrome MV3      │ ◄──── JSON + 4-byte ────► │  Tauri v2 Shell  │
  │  Intercepts DL   │       length prefix        │  IPC Commands    │
  │  Captures auth   │                            │  System Tray     │
  └──────────────────┘                            └──────────────────┘
                                                         │
                                                    ┌────┴────┐
                                                    │  Rust   │
                                                    │  Core   │
                                                    │ Library │
                                                    └─────────┘
                                                         │
                                                  ┌──────┴──────┐
                                                  │   SQLite    │
                                                  │  (WAL mode) │
                                                  └─────────────┘
```

**Performance by design:**

| Aspect | Implementation |
|--------|---------------|
| Progress updates | IPC Channels — avoids JSON serialization overhead at 250ms intervals |
| DB writes | Debounced to 5s — live state in Rust memory, not disk |
| Speed display | EMA-smoothed — stable numbers, no jitter |
| Streaming buffer | 64KB chunks — constant memory regardless of file size |
| Bandwidth control | Global token bucket with 128KB burst allowance |

---

## Download

Grab the latest release from [**GitHub Releases**](https://github.com/shamith16/Crane/releases).

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Crane_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Crane_x.x.x_x64.dmg` |
| Windows 10+ | `Crane_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `crane_x.x.x_amd64.deb` |
| Linux (AppImage) | `Crane_x.x.x_amd64.AppImage` |

> Every release includes a `SHA256SUMS.txt` for verification.

### Browser Extension

Install the Chrome extension from the `extensions/chrome/` directory:

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extensions/chrome/` folder
4. The extension will automatically connect to Crane via native messaging

---

## Build From Source

**Requirements:** Rust 1.75+, Node.js 20+, [Bun](https://bun.sh) (or npm)

```bash
git clone https://github.com/shamith16/Crane.git
cd Crane
bun install          # or: npm install
npx tauri build      # production build
```

<details>
<summary><strong>Linux system dependencies</strong></summary>

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

</details>

### Development

```bash
npx tauri dev                       # App with hot reload
cargo test --workspace              # All 242 Rust tests
cargo clippy --workspace            # Lint
cargo fmt --all                     # Format
```

---

## Architecture

```
Crane/
├── crates/
│   ├── crane-core/              # Standalone Rust library — zero Tauri dependency
│   │   ├── engine/              #   Multi-connection download engine
│   │   ├── queue/               #   Queue manager with auto-promotion
│   │   ├── db/                  #   SQLite persistence (WAL mode)
│   │   ├── protocol/            #   FTP/FTPS implementation
│   │   ├── metadata/            #   URL analysis, MIME detection, categorization
│   │   ├── bandwidth.rs         #   Global token bucket limiter
│   │   └── network.rs           #   SSRF protection layer
│   │
│   └── crane-native-host/       # Native messaging host for browser extensions
│
├── src-tauri/                   # Tauri v2 app shell
│   └── src/commands/            #   19 IPC command handlers
│
├── src/                         # SolidJS + Tailwind CSS frontend
│
└── extensions/chrome/           # Chrome MV3 extension
```

### Design Principles

1. **`crane-core` is a standalone library** — it never imports Tauri. You could build a CLI download manager on top of it. All Tauri interaction flows through the IPC command layer in `src-tauri/`.

2. **Memory-first, disk-second** — download progress lives in Rust memory (updated every 250ms). SQLite is only flushed every 5 seconds. This keeps the UI responsive without hammering the disk.

3. **Adversarial testing** — the test suite includes 9 reusable chaos responders (`TruncatingResponder`, `RangeIgnoringResponder`, `ContentMorphingResponder`, `GarbagePayloadResponder`, etc.) that simulate hostile network conditions. Downloads are tested against truncation, lying servers, captive portals, and content that changes between pause and resume.

4. **Security boundaries** — SSRF protection validates every redirect hop. The network layer blocks loopback, RFC-1918 private ranges, link-local, AWS metadata endpoints, and IPv4-mapped IPv6 addresses. Only `http`, `https`, `ftp`, `ftps` schemes are allowed.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository and create a feature branch
2. **Run the tests** — `cargo test --workspace` must pass
3. **Follow conventions** — `cargo fmt --all` and `cargo clippy --workspace` with no warnings
4. **Write tests** — every feature and bugfix needs tests, including edge cases
5. **Submit a PR** — keep commits small and focused, one logical change per commit

### Project Structure for Contributors

| Area | Start Here |
|------|-----------|
| Download engine | `crates/crane-core/src/engine/multi.rs` — multi-connection orchestrator |
| Queue management | `crates/crane-core/src/queue/mod.rs` — slot promotion, concurrency |
| Database | `crates/crane-core/src/db/mod.rs` — schema, migrations |
| Bandwidth control | `crates/crane-core/src/bandwidth.rs` — token bucket algorithm |
| SSRF protection | `crates/crane-core/src/network.rs` — IP validation, redirect chains |
| FTP protocol | `crates/crane-core/src/protocol/ftp.rs` — FTP/FTPS downloads |
| IPC commands | `src-tauri/src/commands/` — 19 Tauri command handlers |
| Browser extension | `extensions/chrome/service-worker.js` — download interception |
| Frontend | `src/` — SolidJS + Tailwind CSS |

### Test Helpers

The project provides shared mock responders in `crates/crane-core/src/engine/chaos_responders.rs` for testing against hostile conditions:

| Responder | Simulates |
|-----------|-----------|
| `TruncatingResponder` | Server drops connection mid-transfer |
| `RangeIgnoringResponder` | Server claims range support but ignores Range headers |
| `SlowTrickleResponder` | Extremely slow/stalling server |
| `ContentMorphingResponder` | File content changes between pause and resume |
| `IntermittentFailResponder` | Random 500 errors on some requests |
| `GarbagePayloadResponder` | Returns HTML captive portal page instead of file |
| `FailThenSucceedResponder` | Fails N times then succeeds (retry testing) |
| `IntermittentRangeResponder` | Range-aware + intermittent failures |

Reuse these in new tests instead of writing one-off mocks.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Core engine | **Rust** — tokio async runtime, reqwest HTTP client, suppaftp |
| Persistence | **SQLite** (rusqlite, bundled) — WAL mode, versioned schema |
| Desktop shell | **Tauri v2** — native windows, system tray, IPC channels, auto-updater |
| Frontend | **SolidJS** + **Tailwind CSS** — fine-grained reactivity, no virtual DOM |
| Browser extension | **Chrome MV3** — service worker, native messaging, webRequest API |
| CI/CD | **GitHub Actions** — cross-platform test matrix, nightly builds, signed releases |

---

## Roadmap

- [x] Multi-connection HTTP/HTTPS downloads
- [x] FTP/FTPS protocol support
- [x] Pause/resume/retry with crash recovery
- [x] Queue management with auto-promotion
- [x] Global bandwidth limiter with time-of-day scheduling
- [x] Chrome browser extension (MV3)
- [x] Hash verification (SHA-256, MD5)
- [x] SSRF protection
- [x] System tray and notifications
- [x] Auto-updater with signed releases
- [ ] Firefox browser extension
- [ ] yt-dlp integration for video sites
- [ ] HLS/DASH streaming support

---

## License

Licensed under either of:

- [Apache License, Version 2.0](LICENSE-APACHE)
- [MIT License](LICENSE-MIT)

at your option.
