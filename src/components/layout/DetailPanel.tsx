import { Show, Switch, Match, createEffect, createSignal, onCleanup } from "solid-js";
import { selectedDownloadId, closeDetailPanel } from "../../stores/ui";
import {
  getDownload,
  subscribeProgress,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  deleteDownload,
  addDownload,
  openFile,
  openFolder,
  getDownloadPath,
  calculateHash,
} from "../../lib/commands";
import { formatSize, formatSpeed, formatEta } from "../../lib/format";
import type { Download, DownloadProgress, ConnectionProgress } from "../../lib/types";
import SpeedGraph from "../downloads/SpeedGraph";
import ConnectionSegments from "../downloads/ConnectionSegments";

// ─── Helpers ─────────────────────────────────────

function MetaRow(props: { label: string; value: string | null | undefined; breakAll?: boolean }) {
  return (
    <Show when={props.value}>
      <div>
        <p class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">{props.label}</p>
        <p class={`text-xs text-text-secondary ${props.breakAll ? "break-all" : "truncate"}`}>
          {props.value}
        </p>
      </div>
    </Show>
  );
}

function ActionButton(props: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "danger" | "default";
  disabled?: boolean;
}) {
  const cls = () => {
    switch (props.variant) {
      case "primary":
        return "bg-active hover:bg-active/80 text-white";
      case "danger":
        return "bg-error/20 hover:bg-error/30 text-error";
      default:
        return "bg-border hover:bg-surface-hover text-text-primary";
    }
  };
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class={`px-3 py-1.5 text-xs rounded transition-colors ${cls()} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {props.label}
    </button>
  );
}

function SectionTitle(props: { children: string }) {
  return (
    <h3 class="text-[10px] uppercase tracking-wider text-text-muted font-medium">
      {props.children}
    </h3>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeDuration(started: string | null, completed: string | null): string {
  if (!started || !completed) return "\u2014";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (isNaN(ms) || ms < 0) return "\u2014";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}

function computeAvgSpeed(size: number, started: string | null, completed: string | null): string {
  if (!started || !completed || size <= 0) return "\u2014";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (isNaN(ms) || ms <= 0) return "\u2014";
  return formatSpeed(size / (ms / 1000));
}

// ─── Active State ────────────────────────────────

function ActivePanel(props: { download: Download }) {
  const dl = () => props.download;
  const [progress, setProgress] = createSignal<DownloadProgress | null>(null);
  const [speedHistory, setSpeedHistory] = createSignal<number[]>([]);
  let subscribedId: string | null = null;

  // Subscribe to progress — only re-subscribe when the download ID changes,
  // not on every poll refresh (which creates a new object with the same ID).
  createEffect(() => {
    const id = dl().id;
    const status = dl().status;
    if (status !== "downloading" && status !== "analyzing") return;
    if (id === subscribedId) return;

    subscribedId = id;
    setSpeedHistory([]);
    subscribeProgress(id, (p) => {
      setProgress(p);
      setSpeedHistory((prev) => {
        const next = [...prev, p.speed];
        // Keep max 240 samples (60s at 250ms interval)
        if (next.length > 240) next.shift();
        return next;
      });
    });
  });

  const liveDownloaded = () => progress()?.downloaded_size ?? dl().downloaded_size;
  const liveTotal = () => progress()?.total_size ?? dl().total_size;
  const liveSpeed = () => progress()?.speed ?? dl().speed;
  const liveEta = () => progress()?.eta_seconds ?? null;
  const liveConnections = () => progress()?.connections ?? [];

  const percentComplete = () => {
    const total = liveTotal();
    if (!total || total === 0) return 0;
    return Math.min(100, (liveDownloaded() / total) * 100);
  };

  async function handlePause() {
    try { await pauseDownload(dl().id); } catch (e) { console.error("Pause failed:", e); }
  }
  async function handleCancel() {
    try { await cancelDownload(dl().id); } catch (e) { console.error("Cancel failed:", e); }
  }
  async function handleResume() {
    try { await resumeDownload(dl().id); } catch (e) { console.error("Resume failed:", e); }
  }
  function handleCopyUrl() {
    navigator.clipboard.writeText(dl().url).catch(() => {});
  }

  const isPaused = () => dl().status === "paused";

  return (
    <div class="px-4 py-3 space-y-4">
      {/* Progress bar */}
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs tabular-nums text-text-primary font-medium">
            {percentComplete().toFixed(1)}%
          </span>
          <span class="text-xs tabular-nums text-text-secondary">
            {formatSize(liveDownloaded())} / {formatSize(liveTotal())}
          </span>
        </div>
        <div class="h-2 bg-border rounded-full overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-300 ${
              isPaused() ? "bg-warning" : "bg-active"
            }`}
            style={{ width: `${percentComplete()}%` }}
          />
        </div>
        <div class="flex items-center justify-between mt-1.5">
          <span class="text-xs tabular-nums text-active">
            {isPaused() ? "Paused" : formatSpeed(liveSpeed())}
          </span>
          <Show when={!isPaused() && liveEta() !== null}>
            <span class="text-xs tabular-nums text-text-muted">
              {formatEta(liveEta())} remaining
            </span>
          </Show>
        </div>
      </div>

      {/* Connection Segments */}
      <Show when={liveConnections().length > 0 && liveTotal()}>
        <div>
          <SectionTitle>Connections</SectionTitle>
          <div class="mt-1.5">
            <ConnectionSegments
              connections={liveConnections()}
              totalSize={liveTotal()!}
            />
          </div>
        </div>
      </Show>

      {/* Speed Graph */}
      <Show when={!isPaused()}>
        <div>
          <SectionTitle>Speed</SectionTitle>
          <div class="mt-1.5">
            <SpeedGraph speedHistory={speedHistory()} />
          </div>
        </div>
      </Show>

      {/* Actions */}
      <div>
        <SectionTitle>Actions</SectionTitle>
        <div class="flex flex-wrap gap-2 mt-1.5">
          <Show when={dl().status === "downloading"}>
            <ActionButton label="Pause" onClick={handlePause} />
          </Show>
          <Show when={isPaused()}>
            <ActionButton label="Resume" onClick={handleResume} variant="primary" />
          </Show>
          <ActionButton label="Cancel" onClick={handleCancel} variant="danger" />
          <ActionButton label="Copy URL" onClick={handleCopyUrl} />
        </div>
      </div>

      {/* Metadata */}
      <div class="space-y-2">
        <SectionTitle>Details</SectionTitle>
        <MetaRow label="URL" value={dl().url} breakAll />
        <MetaRow label="Filename" value={dl().filename} />
        <MetaRow label="MIME Type" value={dl().mime_type} />
        <MetaRow label="Server" value={dl().source_domain} />
        <MetaRow label="Size" value={formatSize(dl().total_size)} />
        <MetaRow label="Resumable" value={dl().resumable ? "Yes" : "No"} />
        <MetaRow label="Connections" value={String(dl().connections)} />
        <MetaRow label="Save Location" value={dl().save_path} breakAll />
        <MetaRow label="Category" value={dl().category} />
      </div>
    </div>
  );
}

// ─── Completed State ─────────────────────────────

function CompletedPanel(props: { download: Download }) {
  const dl = () => props.download;
  const [hashResult, setHashResult] = createSignal<string | null>(null);
  const [hashAlgo, setHashAlgo] = createSignal<"sha256" | "md5">("sha256");
  const [hashLoading, setHashLoading] = createSignal(false);
  const [verifyInput, setVerifyInput] = createSignal("");
  const [filePath, setFilePath] = createSignal<string | null>(null);

  // Fetch file path on mount
  createEffect(() => {
    getDownloadPath(dl().id)
      .then((p) => setFilePath(p))
      .catch(() => setFilePath(dl().save_path));
  });

  async function handleCalculateHash() {
    setHashLoading(true);
    setHashResult(null);
    try {
      const hash = await calculateHash(dl().id, hashAlgo());
      setHashResult(hash);
    } catch (e) {
      console.error("Hash calculation failed:", e);
      setHashResult("Error calculating hash");
    } finally {
      setHashLoading(false);
    }
  }

  async function handleOpenFile() {
    try { await openFile(dl().id); } catch (e) { console.error("Open file failed:", e); }
  }
  async function handleOpenFolder() {
    try { await openFolder(dl().id); } catch (e) { console.error("Open folder failed:", e); }
  }
  function handleCopyPath() {
    const p = filePath() || dl().save_path;
    navigator.clipboard.writeText(p).catch(() => {});
  }
  async function handleRedownload() {
    try { await addDownload(dl().url); } catch (e) { console.error("Redownload failed:", e); }
  }
  async function handleDelete() {
    try { await deleteDownload(dl().id, false); closeDetailPanel(); } catch (e) { console.error("Delete failed:", e); }
  }

  const verifyMatch = () => {
    if (!hashResult() || !verifyInput().trim()) return null;
    return hashResult()!.toLowerCase() === verifyInput().trim().toLowerCase();
  };

  return (
    <div class="px-4 py-3 space-y-4">
      {/* Completed badge */}
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-success" />
        <span class="text-xs text-success font-medium">Completed</span>
      </div>

      {/* File info */}
      <div class="space-y-2">
        <SectionTitle>File Info</SectionTitle>
        <div>
          <p class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Path</p>
          <p
            class="text-xs text-active break-all cursor-pointer hover:underline"
            onClick={handleOpenFile}
          >
            {filePath() ?? dl().save_path}
          </p>
        </div>
        <MetaRow label="Size" value={formatSize(dl().downloaded_size ?? dl().total_size)} />
        <MetaRow label="Duration" value={computeDuration(dl().started_at, dl().completed_at)} />
        <MetaRow
          label="Average Speed"
          value={computeAvgSpeed(
            dl().downloaded_size ?? dl().total_size ?? 0,
            dl().started_at,
            dl().completed_at,
          )}
        />
        <MetaRow label="Completed" value={formatDate(dl().completed_at)} />
        <MetaRow label="Started" value={formatDate(dl().started_at)} />
        <MetaRow label="Category" value={dl().category} />
      </div>

      {/* Actions */}
      <div>
        <SectionTitle>Actions</SectionTitle>
        <div class="flex flex-wrap gap-2 mt-1.5">
          <ActionButton label="Open File" onClick={handleOpenFile} variant="primary" />
          <ActionButton label="Open Folder" onClick={handleOpenFolder} />
          <ActionButton label="Copy Path" onClick={handleCopyPath} />
          <ActionButton label="Redownload" onClick={handleRedownload} />
          <ActionButton label="Delete" onClick={handleDelete} variant="danger" />
        </div>
      </div>

      {/* Hash verification */}
      <div class="space-y-2">
        <SectionTitle>Hash Verification</SectionTitle>
        <div class="flex items-center gap-2">
          <select
            value={hashAlgo()}
            onChange={(e) => setHashAlgo(e.currentTarget.value as "sha256" | "md5")}
            class="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-active"
          >
            <option value="sha256">SHA-256</option>
            <option value="md5">MD5</option>
          </select>
          <ActionButton
            label={hashLoading() ? "Calculating..." : "Calculate"}
            onClick={handleCalculateHash}
            disabled={hashLoading()}
          />
        </div>
        <Show when={hashResult()}>
          <div class="space-y-2">
            <div class="bg-bg rounded p-2">
              <p class="text-[10px] text-text-muted mb-1">{hashAlgo().toUpperCase()}</p>
              <p class="text-xs text-text-secondary break-all font-mono select-all">
                {hashResult()}
              </p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                Verify (paste expected hash)
              </p>
              <input
                type="text"
                value={verifyInput()}
                onInput={(e) => setVerifyInput(e.currentTarget.value)}
                placeholder="Paste hash to compare..."
                class="w-full text-xs bg-bg border border-border rounded px-2 py-1.5 text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-active"
              />
              <Show when={verifyMatch() !== null}>
                <p
                  class={`text-xs mt-1 font-medium ${
                    verifyMatch() ? "text-success" : "text-error"
                  }`}
                >
                  {verifyMatch() ? "Match" : "Mismatch"}
                </p>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* Metadata */}
      <div class="space-y-2">
        <SectionTitle>Details</SectionTitle>
        <MetaRow label="URL" value={dl().url} breakAll />
        <MetaRow label="Filename" value={dl().filename} />
        <MetaRow label="MIME Type" value={dl().mime_type} />
        <MetaRow label="Server" value={dl().source_domain} />
        <MetaRow label="Connections" value={String(dl().connections)} />
      </div>
    </div>
  );
}

// ─── Failed State ────────────────────────────────

function FailedPanel(props: { download: Download }) {
  const dl = () => props.download;

  async function handleRetry() {
    try { await retryDownload(dl().id); } catch (e) { console.error("Retry failed:", e); }
  }
  async function handleDelete() {
    try { await deleteDownload(dl().id, true); closeDetailPanel(); } catch (e) { console.error("Delete failed:", e); }
  }
  function handleCopyUrl() {
    navigator.clipboard.writeText(dl().url).catch(() => {});
  }

  return (
    <div class="px-4 py-3 space-y-4">
      {/* Error header */}
      <div class="bg-error/10 border border-error/20 rounded-lg p-3">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-2 h-2 rounded-full bg-error" />
          <span class="text-xs text-error font-medium">Download Failed</span>
        </div>
        <Show when={dl().error_message}>
          <p class="text-xs text-error/80 break-all">{dl().error_message}</p>
        </Show>
        <Show when={dl().error_code}>
          <p class="text-[10px] text-text-muted mt-1">
            Error code: <span class="tabular-nums text-text-secondary">{dl().error_code}</span>
          </p>
        </Show>
      </div>

      {/* Failure details */}
      <div class="space-y-2">
        <SectionTitle>Failure Details</SectionTitle>
        <MetaRow
          label="Downloaded Before Failure"
          value={`${formatSize(dl().downloaded_size)}${dl().total_size ? ` / ${formatSize(dl().total_size)}` : ""}`}
        />
        <MetaRow label="Retry Count" value={String(dl().retry_count)} />
        <MetaRow label="Started" value={formatDate(dl().started_at)} />
        <MetaRow label="Failed At" value={formatDate(dl().updated_at)} />
        <MetaRow label="Created" value={formatDate(dl().created_at)} />
      </div>

      {/* Prominent Retry */}
      <div>
        <SectionTitle>Actions</SectionTitle>
        <div class="flex flex-wrap gap-2 mt-1.5">
          <ActionButton label="Retry Download" onClick={handleRetry} variant="primary" />
          <ActionButton label="Copy URL" onClick={handleCopyUrl} />
          <ActionButton label="Delete" onClick={handleDelete} variant="danger" />
        </div>
      </div>

      {/* Metadata */}
      <div class="space-y-2">
        <SectionTitle>Details</SectionTitle>
        <MetaRow label="URL" value={dl().url} breakAll />
        <MetaRow label="Filename" value={dl().filename} />
        <MetaRow label="MIME Type" value={dl().mime_type} />
        <MetaRow label="Server" value={dl().source_domain} />
        <MetaRow label="Save Location" value={dl().save_path} breakAll />
        <MetaRow label="Category" value={dl().category} />
      </div>
    </div>
  );
}

// ─── Main DetailPanel ────────────────────────────

export default function DetailPanel() {
  const [download, setDownload] = createSignal<Download | null>(null);

  createEffect(() => {
    const id = selectedDownloadId();

    if (!id) {
      setDownload(null);
      return;
    }

    // Initial fetch
    getDownload(id)
      .then((dl) => setDownload(dl))
      .catch(() => setDownload(null));

    // Poll for status changes (e.g. downloading -> completed)
    const interval = setInterval(() => {
      getDownload(id)
        .then((dl) => setDownload(dl))
        .catch(() => {});
    }, 2000);

    onCleanup(() => clearInterval(interval));
  });

  const isActive = () => {
    const s = download()?.status;
    return s === "downloading" || s === "paused" || s === "analyzing" || s === "queued" || s === "pending";
  };
  const isCompleted = () => download()?.status === "completed";
  const isFailed = () => download()?.status === "failed";

  return (
    <Show when={selectedDownloadId()}>
      <div class="w-80 flex-shrink-0 bg-surface border-l border-border flex flex-col overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 class="text-sm font-medium text-text-primary truncate flex-1">
            {download()?.filename ?? "Loading..."}
          </h2>
          <button
            onClick={closeDetailPanel}
            class="ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            {"\u2715"}
          </button>
        </div>

        {/* Content based on status */}
        <Show when={download()}>
          {(dl) => (
            <Switch>
              <Match when={isActive()}>
                <ActivePanel download={dl()} />
              </Match>
              <Match when={isCompleted()}>
                <CompletedPanel download={dl()} />
              </Match>
              <Match when={isFailed()}>
                <FailedPanel download={dl()} />
              </Match>
            </Switch>
          )}
        </Show>
      </div>
    </Show>
  );
}
