const NATIVE_HOST = "com.crane.dl";

/**
 * Read extension settings from chrome.storage.local.
 * Returns { enabled: boolean, captureMode: "all" | "context-menu" }.
 */
async function getSettings() {
  const defaults = { enabled: true, captureMode: "all" };
  try {
    const result = await chrome.storage.local.get(defaults);
    return result;
  } catch (e) {
    console.warn("[crane] Failed to read settings, using defaults:", e);
    return defaults;
  }
}

/**
 * Send a message to the native messaging host and return the response.
 * Wraps chrome.runtime.sendNativeMessage in a Promise.
 */
function sendToNativeHost(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Extract a filename from a URL path, falling back to "download" if empty.
 */
function filenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1]);
    }
  } catch (e) {
    console.warn("[crane] Malformed URL, using default filename:", e);
  }
  return "download";
}

// ---------------------------------------------------------------------------
// Download interception
// ---------------------------------------------------------------------------

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const settings = await getSettings();

  // If disabled or not in "all" capture mode, let the browser handle it
  if (!settings.enabled || settings.captureMode !== "all") {
    return;
  }

  const url = downloadItem.finalUrl || downloadItem.url;

  // Skip non-HTTP(S) URLs (data:, blob:, etc.)
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return;
  }

  // Pause the browser download while we hand off to Crane
  let paused = true;
  try {
    await chrome.downloads.pause(downloadItem.id);
  } catch (e) {
    console.warn("[crane] Could not pause download, will still try Crane:", e);
    paused = false;
  }

  try {
    const response = await sendToNativeHost({
      type: "download",
      url,
      filename: downloadItem.filename || filenameFromUrl(url),
      fileSize: downloadItem.fileSize || 0,
      mimeType: downloadItem.mime || "",
      referrer: downloadItem.referrer || "",
    });

    if (response && response.type === "accepted") {
      // Crane accepted — cancel and erase the browser copy
      try {
        await chrome.downloads.cancel(downloadItem.id);
        await chrome.downloads.erase({ id: downloadItem.id });
      } catch (e) {
        // Download may have already completed; best-effort cleanup
        console.warn("[crane] Could not cancel/erase browser download:", e);
      }
    } else {
      // Crane rejected or returned unexpected response — resume in browser
      console.warn("[crane] Crane did not accept download:", response);
      if (paused) {
        try {
          await chrome.downloads.resume(downloadItem.id);
        } catch (e) {
          console.warn("[crane] Could not resume browser download:", e);
        }
      }
    }
  } catch (e) {
    // Native host unavailable — fall back to browser download
    console.error("[crane] Native host unavailable, falling back to browser:", e);
    if (paused) {
      try {
        await chrome.downloads.resume(downloadItem.id);
      } catch (e2) {
        console.warn("[crane] Could not resume browser download after fallback:", e2);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-with-crane",
    title: "Download with Crane",
    contexts: ["link", "image", "video", "audio"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "download-with-crane") {
    return;
  }

  const url = info.linkUrl || info.srcUrl;
  if (!url) {
    return;
  }

  const filename = filenameFromUrl(url);

  try {
    await sendToNativeHost({
      type: "download",
      url,
      filename,
      fileSize: 0,
      mimeType: "",
      referrer: info.pageUrl || "",
    });
  } catch (e) {
    // Native host unavailable — fall back to browser download
    console.error("[crane] Native host unavailable for context menu download:", e);
    chrome.downloads.download({ url });
  }
});

// ---------------------------------------------------------------------------
// Popup messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ping-native") {
    sendToNativeHost({ type: "ping" })
      .then((response) => sendResponse({ connected: true, response }))
      .catch(() => sendResponse({ connected: false }));
    // Return true to indicate we will call sendResponse asynchronously
    return true;
  }
});
