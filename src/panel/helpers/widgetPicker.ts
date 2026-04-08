/**
 * Shared widget picker injected into the page via pageEval.
 * Extracts full widget info including props from the React fiber tree.
 */

export const INJECT_WIDGET_PICKER = `
(function() {
  if (window.__ivyWidgetPicker) { window.__ivyWidgetPicker.start(); return "started"; }

  var overlay = null;
  var label = null;
  var active = false;
  var widgetStack = [];
  var stackIndex = 0;
  var mode = "inspect"; // "inspect" or "vscode"

  function createOverlay() {
    var el = document.createElement("div");
    el.id = "__ivy-widgetpicker-overlay";
    el.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;transition:all 80ms ease-out;display:none;";
    var lbl = document.createElement("div");
    lbl.id = "__ivy-widgetpicker-label";
    lbl.style.cssText = "position:absolute;bottom:100%;left:0;color:#fff;font-size:11px;font-family:system-ui,sans-serif;padding:2px 6px;border-radius:2px 2px 0 0;white-space:nowrap;max-width:500px;overflow:hidden;text-overflow:ellipsis;";
    el.appendChild(lbl);
    document.documentElement.appendChild(el);
    overlay = el;
    label = lbl;
  }

  function applyTheme() {
    if (!overlay) return;
    if (mode === "vscode") {
      overlay.style.background = "rgba(124,58,237,0.12)";
      overlay.style.border = "2px solid rgba(124,58,237,0.8)";
      label.style.background = "rgba(124,58,237,0.9)";
    } else {
      overlay.style.background = "rgba(66,133,244,0.15)";
      overlay.style.border = "2px solid rgba(66,133,244,0.8)";
      label.style.background = "rgba(66,133,244,0.9)";
    }
  }

  function getWidgetBounds(el) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < el.children.length; i++) {
      var r = el.children[i].getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
    if (minX === Infinity) { var r2 = el.getBoundingClientRect(); return { top: r2.top, left: r2.left, width: r2.width, height: r2.height }; }
    return { top: minY, left: minX, width: maxX - minX, height: maxY - minY };
  }

  // Walk React fiber tree to find the MemoizedWidget component and extract its WidgetNode props
  function getReactFiber(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
        return el[keys[i]];
      }
    }
    return null;
  }

  function extractWidgetData(ivyWidgetEl) {
    var fiber = getReactFiber(ivyWidgetEl);
    if (!fiber) return null;

    // Walk up the fiber tree to find the component that has a "node" prop (MemoizedWidget)
    var cur = fiber;
    var maxDepth = 20;
    while (cur && maxDepth-- > 0) {
      if (cur.memoizedProps && cur.memoizedProps.node && cur.memoizedProps.node.props) {
        var node = cur.memoizedProps.node;
        // Serialize props (skip children, functions, and circular refs)
        var safeProps = {};
        var nodeProps = node.props || {};
        var propKeys = Object.keys(nodeProps);
        for (var i = 0; i < propKeys.length; i++) {
          var key = propKeys[i];
          var val = nodeProps[key];
          var t = typeof val;
          if (t === "function") {
            safeProps[key] = "[function]";
          } else if (val === null || val === undefined || t === "string" || t === "number" || t === "boolean") {
            safeProps[key] = val;
          } else if (Array.isArray(val)) {
            try { safeProps[key] = JSON.parse(JSON.stringify(val)); } catch(e) { safeProps[key] = "[Array(" + val.length + ")]"; }
          } else if (t === "object") {
            try { safeProps[key] = JSON.parse(JSON.stringify(val)); } catch(e) { safeProps[key] = "[Object]"; }
          } else {
            safeProps[key] = String(val);
          }
        }
        // Extract callSite directly from the WidgetNode (set by Ivy in DEBUG builds)
        var callSite = node.callSite || null;
        return { props: safeProps, events: node.events || [], callSite: callSite };
      }
      cur = cur.return;
    }
    return null;
  }

  function buildResult(el) {
    var id = el.getAttribute("id") || "";
    var type = el.getAttribute("type") || "";
    var bounds = getWidgetBounds(el);
    var fiberData = extractWidgetData(el);
    var cs = fiberData ? fiberData.callSite : null;

    // Build ancestors + find nearest parent callsite if this widget has none
    var ancestors = [];
    var parentCallSite = null;
    var parentCallSiteWidgetType = null;
    var parent = el.parentElement ? el.parentElement.closest("ivy-widget") : null;
    while (parent) {
      var pid = parent.getAttribute("id") || "";
      var ptype = parent.getAttribute("type") || "";
      ancestors.push({ id: pid, type: ptype });
      if (!parentCallSite) {
        var pData = extractWidgetData(parent);
        if (pData && pData.callSite && pData.callSite.filePath) {
          parentCallSite = pData.callSite;
          parentCallSiteWidgetType = ptype;
        }
      }
      parent = parent.parentElement ? parent.parentElement.closest("ivy-widget") : null;
    }

    // Direct children
    var children = [];
    var childEls = el.querySelectorAll("ivy-widget");
    var seen = {};
    for (var ci = 0; ci < childEls.length; ci++) {
      var ch = childEls[ci].closest("ivy-widget");
      if (!ch) continue;
      // Only direct widget children (skip nested grandchildren)
      var chParent = ch.parentElement ? ch.parentElement.closest("ivy-widget") : null;
      if (chParent !== el) continue;
      var cid = ch.getAttribute("id") || "";
      if (seen[cid]) continue;
      seen[cid] = true;
      children.push({ id: cid, type: ch.getAttribute("type") || "" });
    }

    var hasCallSite = cs && cs.filePath;

    return {
      id: id,
      type: type,
      bounds: bounds,
      callSite: cs,
      parentCallSite: hasCallSite ? null : parentCallSite,
      parentCallSiteWidgetType: hasCallSite ? null : parentCallSiteWidgetType,
      ancestors: ancestors,
      children: children,
      props: fiberData ? fiberData.props : null,
      events: fiberData ? fiberData.events : []
    };
  }

  function updateOverlay(el) {
    if (!overlay) { createOverlay(); applyTheme(); }
    if (!el) { overlay.style.display = "none"; return; }
    var b = getWidgetBounds(el);
    var type = el.getAttribute("type") || "unknown";
    var short = type.indexOf("Ivy.") === 0 ? type.slice(4) : type;
    var id = el.getAttribute("id") || "";

    var loc = "";
    if (mode === "vscode") {
      var fd = extractWidgetData(el);
      var cs = fd ? fd.callSite : null;
      if (cs && cs.filePath) {
        var parts = cs.filePath.split(/[/\\\\]/);
        loc = " — " + parts[parts.length - 1] + (cs.lineNumber ? ":" + cs.lineNumber : "");
      }
    }

    overlay.style.display = "block";
    overlay.style.top = b.top + "px";
    overlay.style.left = b.left + "px";
    overlay.style.width = b.width + "px";
    overlay.style.height = b.height + "px";
    label.textContent = short + loc;
  }

  function onMouseMove(e) {
    var target = e.target;
    if (target.closest && target.closest("#__ivy-widgetpicker-overlay")) return;
    var w = target.closest ? target.closest("ivy-widget") : null;
    if (!w) { updateOverlay(null); widgetStack = []; stackIndex = 0; return; }
    widgetStack = [];
    var cur = w;
    while (cur) { widgetStack.push(cur); cur = cur.parentElement ? cur.parentElement.closest("ivy-widget") : null; }
    stackIndex = 0;
    updateOverlay(widgetStack[stackIndex]);
  }

  function onWheel(e) {
    if (widgetStack.length === 0) return;
    e.preventDefault(); e.stopPropagation();
    if (e.deltaY < 0) stackIndex = Math.min(stackIndex + 1, widgetStack.length - 1);
    else stackIndex = Math.max(stackIndex - 1, 0);
    updateOverlay(widgetStack[stackIndex]);
  }

  function onClick(e) {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var w = widgetStack[stackIndex];
    if (!w) { window.__ivyWidgetPickerResult = { action: "cancel" }; stop(); return; }

    var info = buildResult(w);

    if (mode === "vscode") {
      // Just pass the result back — the panel handles opening VS Code
      if (info.callSite && info.callSite.filePath) {
        window.__ivyWidgetPickerResult = { action: "vscode", widget: info };
      } else {
        window.__ivyWidgetPickerResult = { action: "error", reason: info.callSite ? "No filePath in CallSite" : "No CallSite found (is debug mode enabled?)", widget: info };
      }
    } else {
      window.__ivyWidgetPickerResult = { action: "inspect", widget: info };
    }
    stop();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); window.__ivyWidgetPickerResult = { action: "cancel" }; stop(); }
  }

  function start(m) {
    if (active) return;
    active = true;
    mode = m || "inspect";
    window.__ivyWidgetPickerResult = null;
    if (overlay) applyTheme();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.cursor = "crosshair";
  }

  function stop() {
    if (!active) return;
    active = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.body.style.cursor = "";
    updateOverlay(null);
    widgetStack = [];
    stackIndex = 0;
  }

  window.__ivyWidgetPicker = { start: start, stop: stop, isActive: function() { return active; } };
  return "ready";
})()
`;

export const START_PICKER = (mode: "inspect" | "vscode") =>
  `(function() { if (!window.__ivyWidgetPicker) return "not_ready"; window.__ivyWidgetPicker.start("${mode}"); return "started"; })()`;

export const STOP_PICKER = `window.__ivyWidgetPicker && window.__ivyWidgetPicker.stop()`;
export const CHECK_RESULT = `window.__ivyWidgetPickerResult`;
export const IS_ACTIVE = `window.__ivyWidgetPicker && window.__ivyWidgetPicker.isActive()`;

export interface CallSite {
  path?: string;
  filePath?: string;
  lineNumber?: number;
  memberName?: string;
  declaringType?: string;
}

export interface PickerWidgetInfo {
  id: string;
  type: string;
  bounds: { top: number; left: number; width: number; height: number };
  callSite?: CallSite;
  parentCallSite?: CallSite | null;
  parentCallSiteWidgetType?: string | null;
  ancestors: { id: string; type: string }[];
  children: { id: string; type: string }[];
  props: Record<string, unknown> | null;
  events: string[];
}

export interface PickerResult {
  action: "inspect" | "vscode" | "cancel" | "error";
  widget?: PickerWidgetInfo;
  uri?: string;
  reason?: string;
}
