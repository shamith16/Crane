import { createSignal } from "solid-js";

export default function BrowserSettings() {
  const [testStatus, setTestStatus] = createSignal<
    "idle" | "testing" | "connected" | "failed"
  >("idle");

  function testConnection() {
    setTestStatus("testing");
    // Simulate a test — in the real app this would ping the native messaging host
    setTimeout(() => {
      setTestStatus("connected");
    }, 1000);
  }

  return (
    <div class="max-w-2xl space-y-6">
      <h2 class="text-base font-semibold text-text-primary">
        Browser Integration
      </h2>

      {/* Connection Status */}
      <div class="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-text-primary">
              Extension Connection
            </div>
            <div class="text-xs text-text-muted">
              Status of the native messaging host connection
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span
              class={`text-xs font-medium px-2 py-1 rounded-full ${
                testStatus() === "connected"
                  ? "bg-success/20 text-success"
                  : testStatus() === "failed"
                    ? "bg-error/20 text-error"
                    : testStatus() === "testing"
                      ? "bg-warning/20 text-warning"
                      : "bg-surface-hover text-text-muted"
              }`}
            >
              {testStatus() === "connected"
                ? "Connected"
                : testStatus() === "failed"
                  ? "Failed"
                  : testStatus() === "testing"
                    ? "Testing..."
                    : "Not tested"}
            </span>
            <button
              class="px-3 py-1.5 bg-active text-white rounded-full text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={testConnection}
              disabled={testStatus() === "testing"}
            >
              Test
            </button>
          </div>
        </div>
      </div>

      {/* Chrome Extension */}
      <div class="bg-surface border border-border rounded-lg p-4 space-y-2">
        <div class="text-sm font-medium text-text-primary">
          Chrome Extension
        </div>
        <div class="text-xs text-text-muted">
          Install the Crane extension from the Chrome Web Store to automatically
          intercept downloads in Chrome.
        </div>
        <div class="text-xs text-text-muted mt-2">
          The extension communicates with Crane via native messaging to capture
          download requests.
        </div>
      </div>

      {/* Firefox Extension */}
      <div class="bg-surface border border-border rounded-lg p-4 space-y-2">
        <div class="text-sm font-medium text-text-primary">
          Firefox Extension
        </div>
        <div class="text-xs text-text-muted">
          Install the Crane extension from Firefox Add-ons to automatically
          intercept downloads in Firefox.
        </div>
      </div>

      {/* URL Patterns */}
      <div class="space-y-3">
        <div>
          <div class="text-sm font-medium text-text-primary">URL Patterns</div>
          <div class="text-xs text-text-muted">
            Configure whitelist and blacklist patterns for download interception.
            This feature will be available in a future update.
          </div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="text-xs text-text-muted italic">
            URL pattern configuration coming soon. Currently all downloads are
            intercepted by the browser extension.
          </div>
        </div>
      </div>
    </div>
  );
}
