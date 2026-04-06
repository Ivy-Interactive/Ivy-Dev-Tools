import { pageEval } from "./pageEval";

/**
 * Inject the prop editor bridge into the page (once).
 * Modifies widget props on the React fiber and uses multiple strategies
 * to force an immediate synchronous re-render.
 */
const INJECT_EDITOR = `
(function() {
  if (window.__ivyPropEditor && window.__ivyPropEditor._v === 6) return;

  function getReactFiber(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
        return el[keys[i]];
      }
    }
    return null;
  }

  function findWidgetFiber(el) {
    var fiber = getReactFiber(el);
    if (!fiber) return null;
    var cur = fiber;
    var maxDepth = 30;
    while (cur && maxDepth-- > 0) {
      if (cur.memoizedProps && cur.memoizedProps.node && cur.memoizedProps.node.props) {
        return cur;
      }
      cur = cur.return;
    }
    return null;
  }

  // Find the React.memo wrapper fiber above the widget fiber
  function findMemoFiber(fiber) {
    var cur = fiber.return;
    var depth = 10;
    while (cur && depth-- > 0) {
      if (cur.type && typeof cur.type === "object" && typeof cur.type.compare === "function") {
        return cur;
      }
      cur = cur.return;
    }
    return null;
  }

  // Get the React renderer from the DevTools global hook (injected by React itself).
  // The renderer has scheduleUpdate(fiber) which calls React's internal
  // scheduleUpdateOnFiber at SyncLane — the same mechanism React DevTools uses.
  function getRenderer() {
    var hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook || !hook.renderers) return null;
    // hook.renderers is a Map; get the first (usually only) renderer
    var renderer = null;
    hook.renderers.forEach(function(r) {
      if (!renderer && r) renderer = r;
    });
    return renderer;
  }

  function forceRerender(fiber) {
    var flushSync = window.ReactDOM && window.ReactDOM.flushSync;

    // Temporarily disable the memo compare so the update propagates through
    var memoFiber = findMemoFiber(fiber);
    var origCompare = null;
    if (memoFiber) {
      origCompare = memoFiber.type.compare;
      memoFiber.type.compare = function() { return false; };
    }

    var triggered = false;

    // Strategy 1: Use React's internal scheduleUpdate via DevTools hook.
    // This is the cleanest approach — no state corruption, works on any fiber.
    var renderer = getRenderer();
    if (renderer && typeof renderer.scheduleUpdate === "function") {
      try {
        // Schedule on a parent fiber (above memo) so the re-render propagates down
        var target = memoFiber ? memoFiber.return || memoFiber : fiber;
        if (flushSync) {
          flushSync(function() { renderer.scheduleUpdate(target); });
        } else {
          renderer.scheduleUpdate(target);
        }
        triggered = true;
      } catch(e) { /* fall through to Strategy 2 */ }
    }

    // Strategy 2: Walk up and find a class component's forceUpdate (safe, no state change)
    if (!triggered) {
      var cur = fiber;
      var maxDepth = 60;
      while (cur && maxDepth-- > 0) {
        if (cur.stateNode && typeof cur.stateNode.forceUpdate === "function") {
          if (flushSync) {
            try { flushSync(function() { cur.stateNode.forceUpdate(); }); } catch(e) { cur.stateNode.forceUpdate(); }
          } else {
            cur.stateNode.forceUpdate();
          }
          triggered = true;
          break;
        }
        cur = cur.return;
      }
    }

    // Strategy 3: Walk up and find a hook with object/array state (safe to clone)
    if (!triggered) {
      cur = fiber;
      maxDepth = 60;
      while (cur && maxDepth-- > 0) {
        var hookState = cur.memoizedState;
        var hookDepth = 20;
        while (hookState && hookDepth-- > 0) {
          if (hookState.queue && typeof hookState.queue.dispatch === "function") {
            var val = hookState.memoizedState;
            if (val !== null && typeof val === "object") {
              var dispatch = hookState.queue.dispatch;
              function doClone() {
                dispatch(function(prev) {
                  if (Array.isArray(prev)) return prev.slice();
                  return Object.assign({}, prev);
                });
              }
              if (flushSync) {
                try { flushSync(doClone); } catch(e) { doClone(); }
              } else {
                doClone();
              }
              triggered = true;
              break;
            }
          }
          hookState = hookState.next;
        }
        if (triggered) break;
        cur = cur.return;
      }
    }

    // Restore memo compare after React has processed the update
    if (origCompare) {
      requestAnimationFrame(function() {
        if (memoFiber.type.compare !== origCompare) {
          memoFiber.type.compare = origCompare;
        }
      });
    }

    return triggered;
  }

  window.__ivyPropEditor = {
    _v: 6,
    setProp: function(widgetId, propKey, value) {
      var el = document.getElementById(widgetId);
      if (!el) return { ok: false, reason: "Widget element not found" };

      var fiber = findWidgetFiber(el);
      if (!fiber) return { ok: false, reason: "React fiber not found" };

      var node = fiber.memoizedProps.node;
      if (!node || !node.props) return { ok: false, reason: "WidgetNode not found on fiber" };

      // Mutate the node props IN PLACE so the data is correct regardless
      // of which component triggers the next render
      node.props[propKey] = value;

      // Also put a cloned node on the fiber so memo sees a new reference
      var clone = Object.assign({}, node);
      clone.props = Object.assign({}, node.props);
      fiber.memoizedProps = Object.assign({}, fiber.memoizedProps, { node: clone });
      if (fiber.pendingProps) {
        fiber.pendingProps = Object.assign({}, fiber.pendingProps, { node: clone });
      }
      if (fiber.alternate) {
        if (fiber.alternate.memoizedProps) {
          fiber.alternate.memoizedProps = Object.assign({}, fiber.alternate.memoizedProps, { node: clone });
        }
        if (fiber.alternate.pendingProps) {
          fiber.alternate.pendingProps = Object.assign({}, fiber.alternate.pendingProps, { node: clone });
        }
      }

      var rerendered = forceRerender(fiber);
      return { ok: true, rerendered: rerendered };
    },

    deleteProp: function(widgetId, propKey) {
      var el = document.getElementById(widgetId);
      if (!el) return { ok: false, reason: "Widget element not found" };

      var fiber = findWidgetFiber(el);
      if (!fiber) return { ok: false, reason: "React fiber not found" };

      var node = fiber.memoizedProps.node;
      if (!node || !node.props) return { ok: false, reason: "WidgetNode not found on fiber" };

      delete node.props[propKey];

      var clone = Object.assign({}, node);
      clone.props = Object.assign({}, node.props);
      fiber.memoizedProps = Object.assign({}, fiber.memoizedProps, { node: clone });
      if (fiber.pendingProps) {
        fiber.pendingProps = Object.assign({}, fiber.pendingProps, { node: clone });
      }
      if (fiber.alternate) {
        if (fiber.alternate.memoizedProps) {
          fiber.alternate.memoizedProps = Object.assign({}, fiber.alternate.memoizedProps, { node: clone });
        }
        if (fiber.alternate.pendingProps) {
          fiber.alternate.pendingProps = Object.assign({}, fiber.alternate.pendingProps, { node: clone });
        }
      }

      var rerendered = forceRerender(fiber);
      return { ok: true, rerendered: rerendered };
    }
  };
})()
`;

let injected = false;

async function ensureInjected() {
  if (!injected) {
    await pageEval(INJECT_EDITOR);
    injected = true;
  }
}

/**
 * Set a prop value on a widget and force React to re-render.
 * Values are parsed: "true"→boolean, "123"→number, JSON for objects/arrays.
 */
export async function setWidgetProp(
  widgetId: string,
  propKey: string,
  rawValue: string
): Promise<{ ok: boolean; reason?: string }> {
  await ensureInjected();

  const parsed = parseValue(rawValue);
  const valueStr = JSON.stringify(parsed);

  return pageEval<{ ok: boolean; reason?: string }>(
    `window.__ivyPropEditor.setProp(${JSON.stringify(widgetId)}, ${JSON.stringify(propKey)}, ${valueStr})`
  );
}

export async function deleteWidgetProp(
  widgetId: string,
  propKey: string
): Promise<{ ok: boolean; reason?: string }> {
  await ensureInjected();
  return pageEval<{ ok: boolean; reason?: string }>(
    `window.__ivyPropEditor.deleteProp(${JSON.stringify(widgetId)}, ${JSON.stringify(propKey)})`
  );
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { /* fall through to string */ }
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return raw;
}
