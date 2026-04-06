import { storageGet, storageSet } from "@shared/storage";

/**
 * Service worker handles:
 * 1. Direct panel requests (ping, storage)
 * 2. Relaying messages from panel → content script (using tabId)
 * 3. Relaying messages from content script → panel
 */

// Track which devtools panels are open per tab
const panelPorts = new Map<number, chrome.runtime.Port>();

// ── Long-lived connections from panels ──────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("ivy-panel:")) return;
  const tabId = parseInt(port.name.split(":")[1], 10);
  panelPorts.set(tabId, port);

  port.onDisconnect.addListener(() => {
    panelPorts.delete(tabId);
  });
});

// ── Message routing ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload, tabId } = message;

  // Content script → panel relay
  if (type?.startsWith("panel:") && sender.tab?.id) {
    const port = panelPorts.get(sender.tab.id);
    if (port) {
      port.postMessage({ type, payload });
    }
    return false;
  }

  // Panel → content script relay (with auto-inject fallback)
  if (type?.startsWith("content:") && tabId) {
    chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not injected yet — inject it, then retry
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["content/content-script.js"],
          })
          .then(() => {
            // Small delay for the script to initialize its listener
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { type, payload }, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                  sendResponse(retryResponse);
                }
              });
            }, 100);
          })
          .catch((err) => {
            sendResponse({ error: err.message });
          });
      } else {
        sendResponse(response);
      }
    });
    return true;
  }

  // Direct service worker handlers
  switch (type) {
    case "panel:ping":
      sendResponse({ pong: true, timestamp: Date.now() });
      return false;

    case "panel:storage-get":
      storageGet(payload.key).then((value) => sendResponse({ value }));
      return true;

    case "panel:storage-set":
      storageSet(payload.key, payload.value).then(() => sendResponse({ success: true }));
      return true;

  }

  return false;
});

// ── Dev live-reload ────────────────────────────────────────────────────
// Connects to the Vite plugin's WebSocket server during development.
// On "reload" message, reloads the entire extension and refreshes open tabs.
// Only active when the extension is loaded unpacked (development mode).

if (chrome.runtime.getManifest().update_url === undefined) {
  // Use a single attempt per service worker wake — no retries.
  // If the dev server isn't running, we just skip live reload.
  try {
    const ws = new WebSocket("ws://localhost:5174");
    ws.onmessage = (event) => {
      if (event.data === "reload") {
        console.log("[Ivy DevTools] Reloading extension…");
        for (const tabId of panelPorts.keys()) {
          chrome.tabs.reload(tabId);
        }
        chrome.runtime.reload();
      }
    };
  } catch {
    // Dev server not running — that's fine
  }
}

console.log("[Ivy DevTools] Service worker started");
