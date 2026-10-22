import type { Point, SketchElement, Viewport } from "./types";
import { getCenter, getCommonBounds, rotatePoint, sceneToScreen } from "./geometry";
import { isLinear } from "./element";

export type HandleName = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotation";

export const HANDLE_DIRS: Record<Exclude<HandleName, "rotation">, Point> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export type SelectionFrame =
  | {
      kind: "box";
      /** Outline polygon in screen coords. */
      outline: Point[];
      /** Handle centres in screen coords. */
      handles: Partial<Record<HandleName, Point>>;
      angle: number;
    }
  | { kind: "linear"; outline: Point[]; points: Point[] };

const PAD = 6; // screen px between element and selection outline
const ROTATION_OFFSET = 24;

/** Builds the selection outline and transform handles for the current selection. */
export const getSelectionFrame = (
  selected: readonly SketchElement[],
  v: Viewport,
): SelectionFrame | null => {
  if (!selected.length) return null;
  const pad = PAD / v.zoom;
  if (selected.length === 1) {
    const el = selected[0];
    const c = getCenter(el);
    const toScreen = (lx: number, ly: number) =>
      sceneToScreen(rotatePoint([el.x + lx, el.y + ly], c, el.angle), v);
    const { width: w, height: h } = el;
    const outline = [
      toScreen(-pad, -pad),
      toScreen(w + pad, -pad),
      toScreen(w + pad, h + pad),
      toScreen(-pad, h + pad),
    ];
    if (isLinear(el) && (el.points?.length ?? 0) >= 2) {
      return {
        kind: "linear",
        outline,
        points: el.points!.map(([px, py]) => toScreen(px, py)),
      };
    }
    const handles: Partial<Record<HandleName, Point>> = {
      nw: outline[0],
      ne: outline[1],
      se: outline[2],
      sw: outline[3],
      rotation: toScreen(w / 2, -pad - ROTATION_OFFSET / v.zoom),
    };
    // Edge handles get in the way on small shapes, and text only scales uniformly.
    const big = Math.min(w, h) * v.zoom > 40;
    if (el.type !== "text" && big) {
      handles.n = toScreen(w / 2, -pad);
      handles.s = toScreen(w / 2, h + pad);
      handles.e = toScreen(w + pad, h / 2);
      handles.w = toScreen(-pad, h / 2);
    }
    return { kind: "box", outline, handles, angle: el.angle };
  }
  const b = getCommonBounds(selected);
  const outline: Point[] = [
    sceneToScreen([b.minX - pad, b.minY - pad], v),
    sceneToScreen([b.maxX + pad, b.minY - pad], v),
    sceneToScreen([b.maxX + pad, b.maxY + pad], v),
    sceneToScreen([b.minX - pad, b.maxY + pad], v),
  ];
  return {
    kind: "box",
    outline,
    angle: 0,
    handles: {
      nw: outline[0],
      ne: outline[1],
      se: outline[2],
      sw: outline[3],
      rotation: [(outline[0][0] + outline[1][0]) / 2, outline[0][1] - ROTATION_OFFSET],
    },
  };
};

const HANDLE_HIT = 9;

export const getHandleAt = (
  frame: SelectionFrame | null,
  screen: Point,
): { kind: "handle"; name: HandleName } | { kind: "point"; index: number } | null => {
  if (!frame) return null;
  const near = (p: Point) => Math.hypot(p[0] - screen[0], p[1] - screen[1]) <= HANDLE_HIT;
  if (frame.kind === "linear") {
    const i = frame.points.findIndex(near);
    return i >= 0 ? { kind: "point", index: i } : null;
  }
  for (const [name, p] of Object.entries(frame.handles) as [HandleName, Point][]) {
    if (near(p)) return { kind: "handle", name };
  }
  return null;
};

export const handleCursor = (name: HandleName, angle: number) => {
  if (name === "rotation") return "grab";
  const dir = HANDLE_DIRS[name];
  const deg = ((Math.atan2(dir[1], dir[0]) + angle) * 180) / Math.PI;
  const norm = ((Math.round(deg / 45) % 8) + 8) % 8;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][norm % 4];
};

export const drawSelectionFrame = (
  ctx: CanvasRenderingContext2D,
  frame: SelectionFrame,
  accent: string,
  showHandles: boolean,
) => {
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  if (frame.kind === "box" || !showHandles) {
    ctx.setLineDash(frame.kind === "box" && showHandles ? [] : [4, 4]);
    ctx.beginPath();
    frame.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (showHandles) {
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;
    if (frame.kind === "linear") {
      for (const [x, y] of frame.points) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      for (const [name, [x, y]] of Object.entries(frame.handles)) {
        ctx.beginPath();
        if (name === "rotation") {
          ctx.arc(x, y, 5, 0, Math.PI * 2);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(frame.angle);
          ctx.roundRect(-4.5, -4.5, 9, 9, 2);
          ctx.restore();
        }
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
};

/** Dashed outlines for each element in a multi-selection. */
export const drawElementOutlines = (
  ctx: CanvasRenderingContext2D,
  els: readonly SketchElement[],
  v: Viewport,
  color: string,
) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const pad = 3 / v.zoom;
  for (const el of els) {
    const c = getCenter(el);
    const pts = (
      [
        [el.x - pad, el.y - pad],
        [el.x + el.width + pad, el.y - pad],
        [el.x + el.width + pad, el.y + el.height + pad],
        [el.x - pad, el.y + el.height + pad],
      ] as Point[]
    ).map((p) => sceneToScreen(rotatePoint(p, c, el.angle), v));
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
};
