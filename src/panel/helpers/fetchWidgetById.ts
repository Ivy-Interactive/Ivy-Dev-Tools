import { pageEval } from "./pageEval";
import type { PickerWidgetInfo } from "./widgetPicker";

/**
 * Fetch full widget info (props, events, callSite, ancestors) for a given widget ID
 * by evaluating on the inspected page. Reuses the same fiber-walking approach as the picker.
 */
export async function fetchWidgetById(widgetId: string): Promise<PickerWidgetInfo | null> {
  const code = `
(function() {
  var el = document.getElementById(${JSON.stringify(widgetId)});
  if (!el || el.tagName.toLowerCase() !== "ivy-widget") return null;

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
    var cur = fiber;
    var maxDepth = 20;
    while (cur && maxDepth-- > 0) {
      if (cur.memoizedProps && cur.memoizedProps.node && cur.memoizedProps.node.props) {
        var node = cur.memoizedProps.node;
        var safeProps = {};
        var nodeProps = node.props || {};
        var propKeys = Object.keys(nodeProps);
        for (var i = 0; i < propKeys.length; i++) {
          var key = propKeys[i];
          var val = nodeProps[key];
          var t = typeof val;
          if (t === "function") { safeProps[key] = "[function]"; }
          else if (val === null || val === undefined || t === "string" || t === "number" || t === "boolean") { safeProps[key] = val; }
          else if (Array.isArray(val)) { try { safeProps[key] = JSON.parse(JSON.stringify(val)); } catch(e) { safeProps[key] = "[Array(" + val.length + ")]"; } }
          else if (t === "object") { try { safeProps[key] = JSON.parse(JSON.stringify(val)); } catch(e) { safeProps[key] = "[Object]"; } }
          else { safeProps[key] = String(val); }
        }
        return { props: safeProps, events: node.events || [], callSite: node.callSite || null };
      }
      cur = cur.return;
    }
    return null;
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

  var id = el.getAttribute("id") || "";
  var type = el.getAttribute("type") || "";
  var bounds = getWidgetBounds(el);
  var fiberData = extractWidgetData(el);

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

  var children = [];
  var childEls = el.querySelectorAll("ivy-widget");
  var seen = {};
  for (var ci = 0; ci < childEls.length; ci++) {
    var ch = childEls[ci].closest("ivy-widget");
    if (!ch) continue;
    var chParent = ch.parentElement ? ch.parentElement.closest("ivy-widget") : null;
    if (chParent !== el) continue;
    var cid = ch.getAttribute("id") || "";
    if (seen[cid]) continue;
    seen[cid] = true;
    children.push({ id: cid, type: ch.getAttribute("type") || "" });
  }

  var callSite = fiberData ? fiberData.callSite : null;

  return {
    id: id,
    type: type,
    bounds: bounds,
    callSite: callSite,
    parentCallSite: (!callSite || !callSite.filePath) ? parentCallSite : null,
    parentCallSiteWidgetType: (!callSite || !callSite.filePath) ? parentCallSiteWidgetType : null,
    ancestors: ancestors,
    children: children,
    props: fiberData ? fiberData.props : null,
    events: fiberData ? fiberData.events : []
  };
})()
`;
  return pageEval<PickerWidgetInfo | null>(code);
}
