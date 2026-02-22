document.addEventListener("DOMContentLoaded", async () => {
  const toggleEnabled = document.getElementById("toggle-enabled");
  const modeAll = document.getElementById("mode-all");
  const modeContext = document.getElementById("mode-context");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const versionText = document.getElementById("version-text");
  const versionWarning = document.getElementById("version-warning");
  const minFileSizeSelect = document.getElementById("min-file-size");

  const extVersion = chrome.runtime.getManifest().version;

  // Load saved settings
  const defaults = { enabled: true, captureMode: "all", minFileSize: 1_048_576 };
  const settings = await chrome.storage.local.get(defaults);

  toggleEnabled.checked = settings.enabled;
  if (settings.captureMode === "context-menu") {
    modeContext.checked = true;
  } else {
    modeAll.checked = true;
  }
  minFileSizeSelect.value = String(settings.minFileSize);

  // Ping native host to check connection and version
  chrome.runtime.sendMessage({ type: "ping-native" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.connected) {
      statusDot.classList.remove("connected");
      statusText.textContent = "Disconnected";
      versionText.textContent = `Extension v${extVersion}`;
    } else {
      statusDot.classList.add("connected");
      statusText.textContent = "Connected";

      const hostVersion = response.response?.version || "unknown";
      versionText.textContent = `Extension v${extVersion} · Host v${hostVersion}`;

      if (hostVersion !== extVersion && hostVersion !== "unknown") {
        versionWarning.classList.remove("hidden");
      }
    }
  });

  // Save settings on toggle change
  toggleEnabled.addEventListener("change", () => {
    chrome.storage.local.set({ enabled: toggleEnabled.checked });
  });

  // Save settings on capture mode change
  modeAll.addEventListener("change", () => {
    if (modeAll.checked) {
      chrome.storage.local.set({ captureMode: "all" });
    }
  });

  modeContext.addEventListener("change", () => {
    if (modeContext.checked) {
      chrome.storage.local.set({ captureMode: "context-menu" });
    }
  });

  // Save settings on min file size change
  minFileSizeSelect.addEventListener("change", () => {
    chrome.storage.local.set({ minFileSize: Number(minFileSizeSelect.value) });
  });
});
