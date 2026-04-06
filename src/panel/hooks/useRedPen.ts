import { useState, useCallback, useRef } from "react";
import { pageEval } from "../helpers/pageEval";

/**
 * The entire red pen runtime is injected into the page as an IIFE.
 * It attaches to window.__ivyRedPen so subsequent calls can control it.
 */
const INJECT_REDPEN = `
(function() {
  if (window.__ivyRedPen) return;

  var canvas = null;
  var ctx = null;
  var active = false;
  var drawing = false;
  var strokes = [];
  var currentStroke = null;

  function createCanvas() {
    var el = document.createElement("canvas");
    el.id = "__ivy-redpen-canvas";
    el.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;cursor:crosshair;pointer-events:auto;";
    el.width = window.innerWidth;
    el.height = window.innerHeight;
    document.documentElement.appendChild(el);
    window.addEventListener("resize", handleResize);
    return el;
  }

  function handleResize() {
    if (!canvas || !ctx) return;
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.putImageData(img, 0, 0);
    applyStyle();
  }

  function applyStyle() {
    if (!ctx) return;
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function redrawAll() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyStyle();
    for (var s = 0; s < strokes.length; s++) {
      var pts = strokes[s];
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    drawing = true;
    currentStroke = [[e.clientX, e.clientY]];
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    if (!drawing || !ctx || !currentStroke) return;
    currentStroke.push([e.clientX, e.clientY]);
    ctx.lineTo(e.clientX, e.clientY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX, e.clientY);
  }

  function onPointerUp() {
    if (!drawing) return;
    drawing = false;
    if (currentStroke && currentStroke.length > 1) strokes.push(currentStroke);
    currentStroke = null;
    if (ctx) ctx.beginPath();
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); window.__ivyRedPen.undo(); }
    if (e.key === "Escape") { e.preventDefault(); window.__ivyRedPen.stop(); }
  }

  function onContextMenu(e) { e.preventDefault(); }

  window.__ivyRedPen = {
    start: function() {
      if (active) return;
      active = true;
      if (!canvas) {
        canvas = createCanvas();
        ctx = canvas.getContext("2d");
        applyStyle();
        redrawAll();
      } else {
        canvas.style.display = "block";
        canvas.style.pointerEvents = "auto";
        canvas.style.cursor = "crosshair";
      }
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("contextmenu", onContextMenu);
      document.addEventListener("keydown", onKeyDown, true);
    },
    stop: function() {
      if (!active) return;
      active = false;
      drawing = false;
      currentStroke = null;
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("contextmenu", onContextMenu);
        canvas.style.pointerEvents = "none";
        canvas.style.cursor = "default";
      }
      document.removeEventListener("keydown", onKeyDown, true);
    },
    clear: function() {
      strokes = [];
      currentStroke = null;
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    undo: function() {
      if (strokes.length === 0) return;
      strokes.pop();
      redrawAll();
    },
    isActive: function() { return active; }
  };
})();
`;

export function useRedPen() {
  const [active, setActive] = useState(false);
  const injected = useRef(false);

  const ensureInjected = useCallback(async () => {
    if (!injected.current) {
      await pageEval(INJECT_REDPEN);
      injected.current = true;
    }
  }, []);

  const start = useCallback(async () => {
    await ensureInjected();
    await pageEval("window.__ivyRedPen.start()");
    setActive(true);
  }, [ensureInjected]);

  const stop = useCallback(async () => {
    await pageEval("window.__ivyRedPen.stop()");
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active) stop();
    else start();
  }, [active, start, stop]);

  const clear = useCallback(async () => {
    await pageEval("window.__ivyRedPen.clear()");
  }, []);

  const undo = useCallback(async () => {
    await pageEval("window.__ivyRedPen.undo()");
  }, []);

  return { active, toggle, clear, undo };
}
