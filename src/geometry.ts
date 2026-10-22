import type { Point, SketchElement, Viewport } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const rotatePoint = (
  [x, y]: Point,
  [cx, cy]: Point,
  angle: number,
): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
};

export const distance = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

export const distanceToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
};

export const getCenter = (el: SketchElement): Point => [
  el.x + el.width / 2,
  el.y + el.height / 2,
];

/** The four corners of an element's (possibly rotated) box in scene coords. */
export const getCorners = (el: SketchElement): Point[] => {
  const c = getCenter(el);
  const { x, y, width: w, height: h } = el;
  return (
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ] as Point[]
  ).map((p) => rotatePoint(p, c, el.angle));
};

/** Axis-aligned bounds of an element after rotation. */
export const getElementBounds = (el: SketchElement): Bounds => {
  let pts: Point[];
  if (el.points && el.points.length) {
    const c = getCenter(el);
    pts = el.points.map(([px, py]) =>
      rotatePoint([el.x + px, el.y + py], c, el.angle),
    );
  } else {
    pts = getCorners(el);
  }
  return boundsOfPoints(pts);
};

export const boundsOfPoints = (pts: Point[]): Bounds => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
};

export const getCommonBounds = (els: readonly SketchElement[]): Bounds => {
  const b: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const el of els) {
    const e = getElementBounds(el);
    b.minX = Math.min(b.minX, e.minX);
    b.minY = Math.min(b.minY, e.minY);
    b.maxX = Math.max(b.maxX, e.maxX);
    b.maxY = Math.max(b.maxY, e.maxY);
  }
  return b;
};

export const sceneToScreen = ([x, y]: Point, v: Viewport): Point => [
  (x + v.scrollX) * v.zoom,
  (y + v.scrollY) * v.zoom,
];

export const screenToScene = ([x, y]: Point, v: Viewport): Point => [
  x / v.zoom - v.scrollX,
  y / v.zoom - v.scrollY,
];

/** Converts a scene point into the element's own unrotated frame (relative to x,y). */
export const toLocal = (el: SketchElement, p: Point): Point => {
  const [lx, ly] = rotatePoint(p, getCenter(el), -el.angle);
  return [lx - el.x, ly - el.y];
};

/** Zooms around a screen-space anchor so the point under the cursor stays put. */
export const zoomAt = (v: Viewport, nextZoom: number, anchor: Point): Viewport => {
  const zoom = Math.min(30, Math.max(0.1, nextZoom));
  const [sx, sy] = screenToScene(anchor, v);
  return {
    zoom,
    scrollX: anchor[0] / zoom - sx,
    scrollY: anchor[1] / zoom - sy,
  };
};

export const snapAngle = (angle: number, step = Math.PI / 12) =>
  Math.round(angle / step) * step;

export const normalizeAngle = (a: number) => {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
};
