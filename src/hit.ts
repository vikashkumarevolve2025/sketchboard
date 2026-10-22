import type { Point, SketchElement } from "./types";
import { distanceToSegment, getElementBounds, toLocal, type Bounds } from "./geometry";

const pointInPolygon = ([x, y]: Point, poly: Point[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const nearPolyline = (p: Point, pts: Point[], threshold: number, closed = false) => {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distanceToSegment(p, pts[i], pts[i + 1]) <= threshold) return true;
  }
  if (closed && pts.length > 2) {
    return distanceToSegment(p, pts[pts.length - 1], pts[0]) <= threshold;
  }
  return pts.length === 1 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= threshold;
};

/**
 * Whether a scene point hits an element. Unfilled shapes are only hit near
 * their outline, so you can click "through" an empty box like in Excalidraw.
 */
export const hitTest = (el: SketchElement, scenePoint: Point, threshold: number) => {
  const p = toLocal(el, scenePoint);
  const t = threshold + el.strokeWidth / 2;
  const { width: w, height: h } = el;
  const filled = el.backgroundColor !== "transparent";
  switch (el.type) {
    case "text":
      return p[0] >= -t && p[0] <= w + t && p[1] >= -t && p[1] <= h + t;
    case "rectangle": {
      const poly: Point[] = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
      return (filled && pointInPolygon(p, poly)) || nearPolyline(p, poly, t, true);
    }
    case "diamond": {
      const poly: Point[] = [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
      return (filled && pointInPolygon(p, poly)) || nearPolyline(p, poly, t, true);
    }
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      if (rx === 0 || ry === 0) return false;
      const dx = p[0] - rx;
      const dy = p[1] - ry;
      const norm = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
      if (filled && norm <= 1) return true;
      // Approximate distance to the outline in scene units.
      const r = Math.hypot(dx, dy);
      return Math.abs(r - r / (norm || 1)) <= t;
    }
    case "line":
    case "arrow":
    case "freedraw":
      return nearPolyline(p, el.points ?? [], el.type === "freedraw" ? t + el.strokeWidth : t);
  }
};

export const getElementAt = (
  elements: readonly SketchElement[],
  p: Point,
  threshold: number,
) => {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTest(elements[i], p, threshold)) return elements[i];
  }
  return null;
};

export const elementsInBox = (elements: readonly SketchElement[], box: Bounds) =>
  elements.filter((el) => {
    const b = getElementBounds(el);
    return (
      b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
    );
  });
