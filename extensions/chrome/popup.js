document.addEventListener("DOMContentLoaded", async () => {
  const toggleEnabled = document.getElementById("toggle-enabled");
  const modeAll = document.getElementById("mode-all");
  const modeContext = document.getElementById("mode-context");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  // Load saved settings
  const defaults = { enabled: true, captureMode: "all" };
  const settings = await chrome.storage.local.get(defaults);

  toggleEnabled.checked = settings.enabled;
  if (settings.captureMode === "context-menu") {
    modeContext.checked = true;
  } else {
    modeAll.checked = true;
  }

  // Ping native host to check connection status
  chrome.runtime.sendMessage({ type: "ping-native" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.connected) {
      statusDot.classList.remove("connected");
      statusText.textContent = "Disconnected";
    } else {
      statusDot.classList.add("connected");
      statusText.textContent = "Connected";
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
});
