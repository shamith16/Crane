import { createSignal, Show, Switch, Match, type Component } from "solid-js";
import { isTauri, analyzeUrl, addDownload } from "../../lib/tauri";
import type { UrlAnalysis } from "../../types/download";
import AnalyzingState from "./AnalyzingState";
import ConfirmState from "./ConfirmState";

type DialogState =
  | { phase: "analyzing" }
  | { phase: "confirmed"; analysis: UrlAnalysis }
  | { phase: "error"; message: string; retryable: boolean };

interface DownloadDialogProps {
  url: string;
  onClose: () => void;
  onAdded: () => void;
}

const DownloadDialog: Component<DownloadDialogProps> = (props) => {
  const [state, setState] = createSignal<DialogState>({ phase: "analyzing" });
  const [submitting, setSubmitting] = createSignal(false);

  const analyze = async () => {
    setState({ phase: "analyzing" });
    try {
      if (!isTauri()) {
        // Browser mode: simulate analysis with mock data
        await new Promise((r) => setTimeout(r, 1500));
        const mockAnalysis: UrlAnalysis = {
          url: props.url,
          filename: props.url.split("/").pop() || "download",
          total_size: 156_000_000,
          mime_type: "application/octet-stream",
          resumable: true,
          category: "other",
          server: "mock-server",
        };
        setState({ phase: "confirmed", analysis: mockAnalysis });
        return;
      }
      const analysis = await analyzeUrl(props.url);
      setState({ phase: "confirmed", analysis });
    } catch (e) {
      const msg = String(e);
      const isSSRF = msg.toLowerCase().includes("private") || msg.toLowerCase().includes("ssrf");
      setState({
        phase: "error",
        message: isSSRF
          ? "This URL points to a private network and cannot be downloaded."
          : `Could not analyze URL: ${msg}`,
        retryable: !isSSRF,
      });
    }
  };

  // Start analysis immediately
  analyze();

  const handleConfirm = async (opts: { filename: string; savePath: string; connections: number }) => {
    const current = state();
    if (current.phase !== "confirmed") return;

    setSubmitting(true);
    try {
      if (isTauri()) {
        await addDownload(current.analysis.url, {
          filename: opts.filename,
          save_path: opts.savePath,
          connections: opts.connections,
          category: current.analysis.category,
        });
      }
      props.onAdded();
      props.onClose();
    } catch (e) {
      setState({
        phase: "error",
        message: `Failed to add download: ${String(e)}`,
        retryable: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[8px] bg-page/80"
      onClick={handleBackdropClick}
    >
      <div class="w-[520px] rounded-xl bg-surface shadow-[0_8px_40px_#00000066] overflow-hidden">
        <Switch>
          <Match when={state().phase === "analyzing"}>
            <AnalyzingState url={props.url} onCancel={props.onClose} />
          </Match>

          <Match when={state().phase === "confirmed"}>
            <ConfirmState
              analysis={(state() as { phase: "confirmed"; analysis: UrlAnalysis }).analysis}
              defaultSavePath="~/Downloads"
              defaultConnections={8}
              onConfirm={handleConfirm}
              onCancel={props.onClose}
              submitting={submitting()}
            />
          </Match>

          <Match when={state().phase === "error"}>
            {(() => {
              const s = state() as { phase: "error"; message: string; retryable: boolean };
              return (
                <div class="flex flex-col gap-[20px] p-[28px_32px]">
                  <span class="text-heading font-semibold text-primary">Analysis Failed</span>
                  <div class="h-px bg-inset" />
                  <div class="rounded-md bg-inset p-[10px_14px]">
                    <p class="text-body font-mono text-secondary break-all">{props.url}</p>
                  </div>
                  <p class="text-body text-error">{s.message}</p>
                  <div class="h-px bg-inset" />
                  <div class="flex justify-end gap-[12px]">
                    <button
                      class="rounded-md bg-inset px-[16px] h-[38px] text-body-lg font-medium text-secondary hover:text-primary hover:bg-hover cursor-pointer transition-colors"
                      onClick={props.onClose}
                    >
                      Cancel
                    </button>
                    <Show when={s.retryable}>
                      <button
                        class="rounded-md bg-accent px-[16px] h-[38px] text-body-lg font-semibold text-inverted hover:bg-accent/80 cursor-pointer transition-colors"
                        onClick={analyze}
                      >
                        Retry
                      </button>
                    </Show>
                  </div>
                </div>
              );
            })()}
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export default DownloadDialog;
