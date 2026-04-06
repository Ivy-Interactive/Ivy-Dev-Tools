/**
 * Red pen drawing overlay — freehand annotation directly on the webpage.
 * Draws on a full-page canvas that sits above all content.
 * Supports undo (per-stroke) and clear.
 */

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let active = false;
let drawing = false;

// Store completed strokes for undo
type Stroke = { points: { x: number; y: number }[] };
let strokes: Stroke[] = [];
let currentStroke: Stroke | null = null;

// ── Canvas setup ───────────────────────────────────────────────────────

function createCanvas(): HTMLCanvasElement {
  const el = document.createElement("canvas");
  el.id = "__ivy-redpen-canvas";
  Object.assign(el.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "2147483646",
    cursor: "crosshair",
    // Let pointer events through when not active
    pointerEvents: "auto",
  });
  el.width = window.innerWidth;
  el.height = window.innerHeight;
  document.documentElement.appendChild(el);

  // Track resize
  window.addEventListener("resize", handleResize);

  return el;
}

function handleResize() {
  if (!canvas || !ctx) return;
  // Save current drawing
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.putImageData(imageData, 0, 0);
  // Re-apply stroke style after resize (canvas reset clears it)
  applyStrokeStyle();
}

function applyStrokeStyle() {
  if (!ctx) return;
  ctx.strokeStyle = "rgba(220, 38, 38, 0.55)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(220, 38, 38, 0.3)";
  ctx.shadowBlur = 3;
}

// ── Drawing ────────────────────────────────────────────────────────────

function redrawAll() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyStrokeStyle();

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return; // left click only
  drawing = true;
  currentStroke = { points: [{ x: e.clientX, y: e.clientY }] };

  canvas?.setPointerCapture(e.pointerId);
  ctx?.beginPath();
  ctx?.moveTo(e.clientX, e.clientY);
}

function onPointerMove(e: PointerEvent) {
  if (!drawing || !ctx || !currentStroke) return;
  const point = { x: e.clientX, y: e.clientY };
  currentStroke.points.push(point);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function onPointerUp(_e: PointerEvent) {
  if (!drawing) return;
  drawing = false;
  if (currentStroke && currentStroke.points.length > 1) {
    strokes.push(currentStroke);
  }
  currentStroke = null;
  ctx?.beginPath();
}

function onKeyDown(e: KeyboardEvent) {
  // Ctrl+Z / Cmd+Z to undo
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
  // Escape to exit
  if (e.key === "Escape") {
    e.preventDefault();
    stop();
  }
}

// Prevent page interaction while drawing
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
}

// ── Public API ─────────────────────────────────────────────────────────

export function start() {
  if (active) return;
  active = true;

  if (!canvas) {
    canvas = createCanvas();
    ctx = canvas.getContext("2d");
    applyStrokeStyle();
    // Redraw existing strokes (if re-entering after stop)
    redrawAll();
  } else {
    canvas.style.display = "block";
    canvas.style.pointerEvents = "auto";
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("keydown", onKeyDown, true);
}

export function stop() {
  if (!active) return;
  active = false;
  drawing = false;
  currentStroke = null;

  if (canvas) {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("contextmenu", onContextMenu);
    // Keep canvas visible (annotations stay) but let clicks through
    canvas.style.pointerEvents = "none";
    canvas.style.cursor = "default";
  }
  document.removeEventListener("keydown", onKeyDown, true);
}

export function clear() {
  strokes = [];
  currentStroke = null;
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function undo() {
  if (strokes.length === 0) return;
  strokes.pop();
  redrawAll();
}
