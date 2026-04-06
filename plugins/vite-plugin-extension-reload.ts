import type { Plugin } from "vite";
import { WebSocketServer } from "ws";

/**
 * Vite plugin that starts a WebSocket server during watch mode.
 * After each successful rebuild it sends a "reload" message.
 * The extension's service worker connects and calls chrome.runtime.reload().
 */
export function extensionReload(port = 5174): Plugin {
  let wss: WebSocketServer | null = null;

  return {
    name: "extension-reload",
    apply: "build",

    buildStart() {
      if (wss) return;
      wss = new WebSocketServer({ port });
      console.log(`[extension-reload] WebSocket server on ws://localhost:${port}`);
    },

    writeBundle() {
      if (!wss) return;
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send("reload");
        }
      }
      console.log("[extension-reload] Reload signal sent");
    },

    closeBundle() {
      // Don't close in watch mode — only on final shutdown
    },
  };
}
