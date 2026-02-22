const NATIVE_HOST = "com.crane.dl";

// ---------------------------------------------------------------------------
// Authorization header cache
// ---------------------------------------------------------------------------

const authCache = new Map();
const AUTH_CACHE_TTL_MS = 30_000;

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;
    for (const header of details.requestHeaders) {
      if (header.name.toLowerCase() === "authorization" && header.value) {
        authCache.set(details.url, {
          value: header.value,
          timestamp: Date.now(),
        });
        break;
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

setInterval(() => {
  const now = Date.now();
  for (const [url, entry] of authCache) {
    if (now - entry.timestamp > AUTH_CACHE_TTL_MS) {
      authCache.delete(url);
    }
  }
}, AUTH_CACHE_TTL_MS);

/**
 * Read extension settings from chrome.storage.local.
 * Returns { enabled: boolean, captureMode: "all" | "context-menu" }.
 */
async function getSettings() {
  const defaults = { enabled: true, captureMode: "all", minFileSize: 1_048_576 };
  try {
    const result = await chrome.storage.local.get(defaults);
    return result;
  } catch (e) {
    console.warn("[crane] Failed to read settings, using defaults:", e);
    return defaults;
  }
}

/**
 * Send a single message to the native messaging host.
 */
function sendToNativeHostOnce(message) {
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
 * Send a message to the native host with retry on connection errors.
 * Retries up to 2 times with 500ms delay. Does NOT retry if the host
 * responded (even with an error response — that means it's reachable).
 */
async function sendToNativeHost(message, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendToNativeHostOnce(message);
    } catch (e) {
      if (attempt < maxRetries) {
        console.warn(`[crane] Native host attempt ${attempt + 1} failed, retrying in 500ms:`, e);
        await new Promise((r) => setTimeout(r, 500));
      } else {
        throw e;
      }
    }
  }
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

  // Skip small files (browser handles them fine)
  // fileSize may be 0/-1 when unknown — still send those to Crane
  if (settings.minFileSize > 0 && downloadItem.fileSize > 0 && downloadItem.fileSize < settings.minFileSize) {
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

  // Look up cached Authorization header
  const authEntry = authCache.get(url);
  const authorization = authEntry ? authEntry.value : undefined;
  if (authEntry) authCache.delete(url);

  try {
    const response = await sendToNativeHost({
      type: "download",
      url,
      filename: downloadItem.filename || filenameFromUrl(url),
      fileSize: downloadItem.fileSize || 0,
      mimeType: downloadItem.mime || "",
      referrer: downloadItem.referrer || "",
      authorization,
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

  // Look up cached Authorization header
  const authEntry = authCache.get(url);
  const authorization = authEntry ? authEntry.value : undefined;
  if (authEntry) authCache.delete(url);

  try {
    await sendToNativeHost({
      type: "download",
      url,
      filename,
      fileSize: 0,
      mimeType: "",
      referrer: info.pageUrl || "",
      authorization,
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
