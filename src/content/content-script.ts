/**
 * Content script injected into the inspected page.
 * Handles Ivy detection, widget inspection overlay, and call site retrieval.
 *
 * The widgetCallSiteRegistry lives in the PAGE context (not content script),
 * so we inject a small script to bridge that data back.
 */

import type { WidgetInfo, CallSite, IvyDetectionResult } from "@shared/types";
import * as redpen from "./redpen";

// ── State ──────────────────────────────────────────────────────────────

let inspecting = false;
let highlightOverlay: HTMLDivElement | null = null;
let currentWidgetStack: HTMLElement[] = [];
let currentStackIndex = 0;

// ── Ivy Detection ──────────────────────────────────────────────────────

function detectIvy(): IvyDetectionResult {
  const meta = document.querySelector('meta[name="ivy-enable-dev-tools"]');
  const devToolsEnabled = meta?.getAttribute("content") === "true";
  const hasIvyMeta = !!document.querySelector('meta[name^="ivy-"]');
  const widgetCount = document.querySelectorAll("ivy-widget").length;

  return {
    isIvy: hasIvyMeta || widgetCount > 0,
    devToolsEnabled,
    widgetCount,
  };
}

// ── Call site retrieval (bridge to page context) ───────────────────────

function getCallSite(widgetId: string): Promise<CallSite | undefined> {
  return new Promise((resolve) => {
    const channel = `__ivy_devtools_callsite_${Date.now()}_${Math.random()}`;

    const handler = (e: MessageEvent) => {
      if (e.data?.channel === channel) {
        window.removeEventListener("message", handler);
        resolve(e.data.callSite);
      }
    };
    window.addEventListener("message", handler);

    // Inject into page context to access the registry
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        var cs = undefined;
        if (window.widgetCallSiteRegistry) {
          cs = window.widgetCallSiteRegistry.get(${JSON.stringify(widgetId)});
        }
        window.postMessage({ channel: ${JSON.stringify(channel)}, callSite: cs || undefined }, "*");
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(undefined);
    }, 500);
  });
}

// ── Widget bounds (matches Ivy's approach — union of children bounds) ──

function getWidgetBounds(el: HTMLElement): { top: number; left: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const child of Array.from(el.children)) {
    const rect = child.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }

  if (minX === Infinity) {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }

  return { top: minY, left: minX, width: maxX - minX, height: maxY - minY };
}

// ── Build widget info ──────────────────────────────────────────────────

async function buildWidgetInfo(el: HTMLElement): Promise<WidgetInfo> {
  const id = el.getAttribute("id") ?? "";
  const type = el.getAttribute("type") ?? "";
  const bounds = getWidgetBounds(el);
  const callSite = await getCallSite(id);

  const ancestors: { id: string; type: string }[] = [];
  let parent: HTMLElement | null = el.parentElement?.closest("ivy-widget") as HTMLElement | null;
  while (parent) {
    ancestors.push({
      id: parent.getAttribute("id") ?? "",
      type: parent.getAttribute("type") ?? "",
    });
    parent = parent.parentElement?.closest("ivy-widget") as HTMLElement | null;
  }

  return { id, type, bounds, callSite, ancestors };
}

// ── Highlight overlay ──────────────────────────────────────────────────

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = "__ivy-devtools-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    background: "rgba(66, 133, 244, 0.15)",
    border: "2px solid rgba(66, 133, 244, 0.8)",
    transition: "all 80ms ease-out",
    display: "none",
  });

  const label = document.createElement("div");
  label.id = "__ivy-devtools-overlay-label";
  Object.assign(label.style, {
    position: "absolute",
    bottom: "100%",
    left: "0",
    background: "rgba(66, 133, 244, 0.9)",
    color: "#fff",
    fontSize: "11px",
    fontFamily: "system-ui, sans-serif",
    padding: "2px 6px",
    borderRadius: "2px 2px 0 0",
    whiteSpace: "nowrap",
    maxWidth: "400px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });
  overlay.appendChild(label);

  document.documentElement.appendChild(overlay);
  return overlay;
}

function updateOverlay(el: HTMLElement | null) {
  if (!highlightOverlay) highlightOverlay = createOverlay();

  if (!el) {
    highlightOverlay.style.display = "none";
    return;
  }

  const bounds = getWidgetBounds(el);
  const type = el.getAttribute("type") ?? "unknown";
  const label = highlightOverlay.querySelector("#__ivy-devtools-overlay-label") as HTMLDivElement;

  Object.assign(highlightOverlay.style, {
    display: "block",
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });

  const shortType = type.startsWith("Ivy.") ? type.slice(4) : type;
  label.textContent = shortType;
}

// ── Inspect mode event handlers ────────────────────────────────────────

function onMouseMove(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("#__ivy-devtools-overlay")) return;

  const widget = target.closest("ivy-widget") as HTMLElement | null;
  if (!widget) {
    updateOverlay(null);
    currentWidgetStack = [];
    currentStackIndex = 0;
    return;
  }

  // Build ancestor stack
  currentWidgetStack = [];
  let current: HTMLElement | null = widget;
  while (current) {
    currentWidgetStack.push(current);
    current = current.parentElement?.closest("ivy-widget") as HTMLElement | null;
  }
  currentStackIndex = 0;

  updateOverlay(currentWidgetStack[currentStackIndex]);
}

function onWheel(e: WheelEvent) {
  if (currentWidgetStack.length === 0) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.deltaY < 0) {
    // Scroll up → go to parent
    currentStackIndex = Math.min(currentStackIndex + 1, currentWidgetStack.length - 1);
  } else {
    // Scroll down → go to child
    currentStackIndex = Math.max(currentStackIndex - 1, 0);
  }

  updateOverlay(currentWidgetStack[currentStackIndex]);
}

async function onClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const widget = currentWidgetStack[currentStackIndex];
  if (widget) {
    const info = await buildWidgetInfo(widget);
    chrome.runtime.sendMessage({ type: "panel:widget-selected", payload: info });
  }

  stopInspect();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: "panel:inspect-cancelled", payload: undefined });
    stopInspect();
  }
}

// ── Start / stop inspection ────────────────────────────────────────────

function startInspect() {
  if (inspecting) return;
  inspecting = true;
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.body.style.cursor = "crosshair";
}

function stopInspect() {
  if (!inspecting) return;
  inspecting = false;
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("wheel", onWheel, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
  document.body.style.cursor = "";
  updateOverlay(null);
  currentWidgetStack = [];
  currentStackIndex = 0;
}

// ── Message handler ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "content:detect-ivy":
      sendResponse(detectIvy());
      return false;

    case "content:start-inspect":
      startInspect();
      sendResponse({ ok: true });
      return false;

    case "content:stop-inspect":
      stopInspect();
      sendResponse({ ok: true });
      return false;

    case "content:get-widget-callsite":
      getCallSite(message.payload.widgetId).then((callSite) => {
        sendResponse({ callSite });
      });
      return true; // async

    case "content:redpen-start":
      redpen.start();
      sendResponse({ ok: true });
      return false;

    case "content:redpen-stop":
      redpen.stop();
      sendResponse({ ok: true });
      return false;

    case "content:redpen-clear":
      redpen.clear();
      sendResponse({ ok: true });
      return false;

    case "content:redpen-undo":
      redpen.undo();
      sendResponse({ ok: true });
      return false;
  }

  return false;
});
