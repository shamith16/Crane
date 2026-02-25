import { createSignal, For, Show, type Component } from "solid-js";
import {
  FolderOpen, Minus, Plus, Download, Loader, CircleCheck, CircleX, Layers,
} from "lucide-solid";
import { isTauri, analyzeUrl, addDownload } from "../../lib/tauri";
import type { UrlAnalysis } from "../../types/download";

type UrlStatus =
  | { phase: "analyzing" }
  | { phase: "ready"; analysis: UrlAnalysis }
  | { phase: "error"; message: string };

interface BatchDownloadDialogProps {
  urls: string[];
  onClose: () => void;
  onAdded: () => void;
}

const BatchDownloadDialog: Component<BatchDownloadDialogProps> = (props) => {
  const [statuses, setStatuses] = createSignal<Map<string, UrlStatus>>(new Map());
  const [savePath, setSavePath] = createSignal("~/Downloads");
  const [connections, setConnections] = createSignal(8);
  const [submitting, setSubmitting] = createSignal(false);

  // Analyze all URLs in parallel
  const analyzeAll = () => {
    const initial = new Map<string, UrlStatus>();
    for (const url of props.urls) {
      initial.set(url, { phase: "analyzing" });
    }
    setStatuses(new Map(initial));

    for (const url of props.urls) {
      analyzeOne(url);
    }
  };

  const analyzeOne = async (url: string) => {
    try {
      if (!isTauri()) {
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
        const mock: UrlAnalysis = {
          url,
          filename: url.split("/").pop() || "download",
          total_size: Math.floor(Math.random() * 1_000_000_000),
          mime_type: "application/octet-stream",
          resumable: true,
          category: "other",
          server: "mock-server",
        };
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(url, { phase: "ready", analysis: mock });
          return next;
        });
        return;
      }
      const analysis = await analyzeUrl(url);
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(url, { phase: "ready", analysis });
        return next;
      });
    } catch (e) {
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(url, { phase: "error", message: String(e) });
        return next;
      });
    }
  };

  analyzeAll();

  const readyCount = () => {
    let count = 0;
    for (const s of statuses().values()) {
      if (s.phase === "ready") count++;
    }
    return count;
  };

  const analyzingCount = () => {
    let count = 0;
    for (const s of statuses().values()) {
      if (s.phase === "analyzing") count++;
    }
    return count;
  };

  const errorCount = () => {
    let count = 0;
    for (const s of statuses().values()) {
      if (s.phase === "error") count++;
    }
    return count;
  };

  const totalSize = () => {
    let total = 0;
    for (const s of statuses().values()) {
      if (s.phase === "ready" && s.analysis.total_size) {
        total += s.analysis.total_size;
      }
    }
    return total;
  };

  const allResumable = () => {
    for (const s of statuses().values()) {
      if (s.phase === "ready" && !s.analysis.resumable) return false;
    }
    return true;
  };

  const maxConn = () => (allResumable() ? 32 : 1);

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, defaultPath: savePath() });
      if (selected) setSavePath(selected as string);
    } catch {
      // ignore
    }
  };

  const handleConfirm = () => {
    // Close dialog immediately, add downloads sequentially in background
    const readyItems = [...statuses().values()].filter(
      (s): s is { phase: "ready"; analysis: UrlAnalysis } => s.phase === "ready",
    );
    const sp = savePath();
    const conn = connections();

    props.onClose();

    // Add sequentially with a small stagger so tiles appear smoothly
    (async () => {
      for (const item of readyItems) {
        if (isTauri()) {
          try {
            await addDownload(item.analysis.url, {
              filename: item.analysis.filename,
              save_path: sp,
              connections: conn,
              category: item.analysis.category,
            });
          } catch (e) {
            console.error("[crane] batch add failed:", e);
          }
        }
      }
      props.onAdded();
    })();
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[8px] bg-page/80"
      onClick={handleBackdropClick}
    >
      <div class="w-[560px] max-h-[80vh] rounded-xl bg-surface shadow-[0_8px_40px_#00000066] overflow-hidden flex flex-col">
        {/* Header */}
        <div class="flex items-center gap-[10px] px-[20px] py-[16px] border-b border-inset shrink-0">
          <Layers size={18} class="text-accent" />
          <span class="text-caption font-semibold text-tertiary uppercase tracking-[2px]">
            Batch Download
          </span>
          <span class="ml-auto text-caption font-mono font-extrabold text-accent">
            {props.urls.length} files
          </span>
        </div>

        {/* URL list */}
        <div class="flex-1 overflow-y-auto min-h-0">
          <div class="flex flex-col gap-[1px] p-[12px]">
            <For each={props.urls}>
              {(url) => {
                const status = () => statuses().get(url);
                const filename = () => {
                  const s = status();
                  if (s?.phase === "ready") return s.analysis.filename;
                  return url.split("/").pop() || url;
                };
                const size = () => {
                  const s = status();
                  if (s?.phase === "ready" && s.analysis.total_size) return formatSize(s.analysis.total_size);
                  return null;
                };

                return (
                  <div class="flex items-center gap-[10px] rounded-lg px-[12px] py-[8px] bg-inset/50">
                    {/* Status indicator */}
                    <Show when={status()?.phase === "analyzing"}>
                      <Loader size={14} class="text-accent animate-spin-slow shrink-0" />
                    </Show>
                    <Show when={status()?.phase === "ready"}>
                      <CircleCheck size={14} class="text-success shrink-0" />
                    </Show>
                    <Show when={status()?.phase === "error"}>
                      <CircleX size={14} class="text-error shrink-0" />
                    </Show>

                    {/* Filename / URL */}
                    <span class="text-body-sm font-mono text-primary truncate flex-1">
                      {filename()}
                    </span>

                    {/* Size */}
                    <Show when={size()}>
                      <span class="text-caption font-mono font-extrabold text-muted shrink-0">
                        {size()}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Summary bar */}
        <div class="flex items-center gap-[12px] px-[20px] py-[10px] border-t border-inset shrink-0">
          <Show when={analyzingCount() > 0}>
            <span class="text-caption font-mono text-accent">
              Analyzing {analyzingCount()}...
            </span>
          </Show>
          <Show when={readyCount() > 0}>
            <span class="text-caption font-mono text-success">
              {readyCount()} ready
            </span>
          </Show>
          <Show when={errorCount() > 0}>
            <span class="text-caption font-mono text-error">
              {errorCount()} failed
            </span>
          </Show>
          <Show when={totalSize() > 0}>
            <span class="text-caption font-mono font-extrabold text-secondary ml-auto">
              Total: {formatSize(totalSize())}
            </span>
          </Show>
        </div>

        {/* Settings */}
        <div class="flex flex-col gap-[12px] px-[20px] py-[12px] border-t border-inset shrink-0">
          {/* Save to */}
          <div class="flex items-center justify-between">
            <span class="text-caption font-semibold text-tertiary uppercase tracking-[1px]">
              Save to
            </span>
            <div class="flex items-center gap-[8px]">
              <span class="text-body-sm font-mono text-primary truncate max-w-[240px]">
                {savePath()}
              </span>
              <button
                class="flex items-center gap-[4px] rounded bg-hover px-[8px] py-[4px] text-caption font-medium text-secondary hover:text-primary cursor-pointer transition-colors shrink-0"
                onClick={handleBrowse}
              >
                <FolderOpen size={12} />
                Browse
              </button>
            </div>
          </div>

          {/* Connections */}
          <div class="flex items-center justify-between">
            <span class="text-caption font-semibold text-tertiary uppercase tracking-[1px]">
              Connections
            </span>
            <div class="flex items-center rounded-md bg-inset border border-inset">
              <button
                class="flex items-center justify-center px-[8px] py-[6px] text-secondary hover:text-primary cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setConnections((c) => Math.max(1, c - 1))}
                disabled={connections() <= 1}
              >
                <Minus size={12} />
              </button>
              <span class="text-body font-mono font-bold text-accent px-[12px] py-[6px] border-x border-inset">
                {connections()}
              </span>
              <button
                class="flex items-center justify-center px-[8px] py-[6px] text-secondary hover:text-primary cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setConnections((c) => Math.min(maxConn(), c + 1))}
                disabled={connections() >= maxConn()}
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-end gap-[12px] px-[20px] py-[14px] border-t border-inset shrink-0">
          <button
            class="rounded-md bg-inset px-[20px] py-[10px] text-body-sm font-mono font-extrabold text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            class="flex items-center gap-[6px] rounded-md bg-accent px-[24px] py-[10px] text-body-sm font-mono font-extrabold text-inverted hover:bg-accent/80 cursor-pointer transition-colors disabled:opacity-50"
            onClick={handleConfirm}
            disabled={submitting() || readyCount() === 0}
          >
            <Download size={14} />
            Download {readyCount()} files
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchDownloadDialog;
