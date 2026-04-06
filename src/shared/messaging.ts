/**
 * Typed messaging layer between DevTools panel ↔ service worker ↔ content scripts.
 *
 * Panel → service worker:  chrome.runtime.sendMessage
 * Panel → content script:  chrome.tabs.sendMessage (routed via service worker)
 * Content script → panel:  chrome.runtime.sendMessage (relayed by service worker)
 */

import type { IvyDetectionResult, WidgetInfo } from "./types";

// ── Message type registry ──────────────────────────────────────────────

export interface MessageMap {
  // Panel ↔ service worker
  "panel:ping": { payload: undefined; response: { pong: true; timestamp: number } };
  "panel:storage-get": { payload: { key: string }; response: { value: unknown } };
  "panel:storage-set": { payload: { key: string; value: unknown }; response: { success: true } };

  // Panel → content script (routed via service worker using tabId)
  "content:detect-ivy": { payload: undefined; response: IvyDetectionResult };
  "content:start-inspect": { payload: undefined; response: { ok: true } };
  "content:stop-inspect": { payload: undefined; response: { ok: true } };
  "content:get-widget-callsite": { payload: { widgetId: string }; response: { callSite?: WidgetInfo["callSite"] } };

  // Red pen drawing
  "content:redpen-start": { payload: undefined; response: { ok: true } };
  "content:redpen-stop": { payload: undefined; response: { ok: true } };
  "content:redpen-clear": { payload: undefined; response: { ok: true } };
  "content:redpen-undo": { payload: undefined; response: { ok: true } };

  // Content script → panel (relayed via service worker)
  "panel:widget-selected": { payload: WidgetInfo; response: void };
  "panel:widget-hovered": { payload: WidgetInfo | null; response: void };
  "panel:inspect-cancelled": { payload: undefined; response: void };
}

export type MessageType = keyof MessageMap;

export interface Message<T extends MessageType = MessageType> {
  type: T;
  payload: MessageMap[T]["payload"];
  tabId?: number;
}

export type MessageResponse<T extends MessageType> = MessageMap[T]["response"];

// ── Sender (panel → service worker) ────────────────────────────────────

export function sendMessage<T extends MessageType>(
  type: T,
  payload: MessageMap[T]["payload"],
  tabId?: number
): Promise<MessageResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload, tabId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response as MessageResponse<T>);
      }
    });
  });
}

// ── Handler registry (used in service worker & content scripts) ────────

type Handler<T extends MessageType> = (
  payload: MessageMap[T]["payload"],
  sender: chrome.runtime.MessageSender
) => Promise<MessageResponse<T>> | MessageResponse<T>;

const handlers = new Map<string, Handler<any>>();

export function onMessage<T extends MessageType>(
  type: T,
  handler: Handler<T>
): void {
  handlers.set(type, handler);
}

export function initMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers.get(message.type);
    if (!handler) return false;

    Promise.resolve(handler(message.payload, sender))
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));

    return true; // keep channel open for async response
  });
}

// ── Listener for content-script-style messages (chrome.runtime.onMessage) ──

type SimpleHandler = (payload: any) => void;
const eventHandlers = new Map<string, SimpleHandler[]>();

export function onEvent<T extends MessageType>(
  type: T,
  handler: (payload: MessageMap[T]["payload"]) => void
): () => void {
  const list = eventHandlers.get(type) ?? [];
  list.push(handler);
  eventHandlers.set(type, list);
  return () => {
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  };
}

export function initEventListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    const list = eventHandlers.get(message.type);
    if (list) {
      for (const handler of list) handler(message.payload);
    }
  });
}
