import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import { getStroke } from "perfect-freehand";
import type { Arrowhead, Point, SketchElement, Viewport } from "./types";
import { fontString, LINE_HEIGHT, FONT_FAMILIES } from "./element";
import { getCenter, getCommonBounds } from "./geometry";
import virgilUrl from "./assets/fonts/Virgil.woff2?url";
import cascadiaUrl from "./assets/fonts/Cascadia.woff2?url";

const generator: RoughGenerator = rough.generator();

type Shape =
  | { kind: "rough"; drawables: Drawable[] }
  | { kind: "freedraw"; path: string };

// Elements are immutable, so the object itself is the cache key.
const shapeCache = new WeakMap<SketchElement, Shape>();

const roughOptions = (el: SketchElement, fill = true): Options => {
  const sw = el.strokeWidth;
  const opts: Options = {
    seed: el.seed,
    stroke: el.strokeColor,
    strokeWidth: sw,
    roughness: el.roughness,
    bowing: el.roughness === 0 ? 0 : 1,
    preserveVertices: el.roughness < 2,
    disableMultiStroke: el.strokeStyle !== "solid",
    fillWeight: sw / 2,
    hachureGap: sw * 4,
  };
  if (el.strokeStyle === "dashed") opts.strokeLineDash = [8, 8 + sw];
  if (el.strokeStyle === "dotted") opts.strokeLineDash = [1.5, 6 + sw];
  if (fill && el.backgroundColor !== "transparent") {
    opts.fill = el.backgroundColor;
    opts.fillStyle = el.fillStyle;
  }
  return opts;
};

const roundedRectPath = (w: number, h: number) => {
  const r = Math.min(Math.min(w, h) * 0.25, 32);
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0 Z`;
};

const roundedPolygonPath = (pts: Point[]) => {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const lenPrev = Math.hypot(prev[0] - cur[0], prev[1] - cur[1]);
    const lenNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const t1 = lenPrev ? Math.min(0.25, 32 / lenPrev) : 0;
    const t2 = lenNext ? Math.min(0.25, 32 / lenNext) : 0;
    const a = [cur[0] + (prev[0] - cur[0]) * t1, cur[1] + (prev[1] - cur[1]) * t1];
    const b = [cur[0] + (next[0] - cur[0]) * t2, cur[1] + (next[1] - cur[1]) * t2];
    d += `${i === 0 ? "M" : "L"} ${a[0]} ${a[1]} Q ${cur[0]} ${cur[1]}, ${b[0]} ${b[1]} `;
  }
  return d + "Z";
};

const arrowheadDrawables = (
  el: SketchElement,
  head: Arrowhead,
  tip: Point,
  from: Point,
): Drawable[] => {
  if (!head) return [];
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const ux = dx / len;
  const uy = dy / len;
  const size = Math.min(10 + el.strokeWidth * 5, len * 0.75);
  const opts = { ...roughOptions(el, false), strokeLineDash: undefined };
  const at = (angle: number, s = size): Point => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      tip[0] - s * (ux * cos - uy * sin),
      tip[1] - s * (uy * cos + ux * sin),
    ];
  };
  switch (head) {
    case "arrow": {
      const a = at(0.45);
      const b = at(-0.45);
      return [generator.linearPath([a, tip, b], opts)];
    }
    case "triangle": {
      const a = at(0.4);
      const b = at(-0.4);
      return [
        generator.polygon([a, tip, b], {
          ...opts,
          fill: el.strokeColor,
          fillStyle: "solid",
        }),
      ];
    }
    case "dot": {
      const d = Math.max(6, size * 0.6);
      return [
        generator.circle(tip[0] - (ux * d) / 2, tip[1] - (uy * d) / 2, d, {
          ...opts,
          fill: el.strokeColor,
          fillStyle: "solid",
        }),
      ];
    }
    case "bar": {
      const half = size / 2;
      return [
        generator.line(
          tip[0] - uy * half,
          tip[1] + ux * half,
          tip[0] + uy * half,
          tip[1] - ux * half,
          opts,
        ),
      ];
    }
  }
};

export const freedrawPath = (el: SketchElement) => {
  const pts = el.points ?? [];
  const input = pts.map(([x, y], i) => [x, y, el.pressures?.[i] ?? 0.5]);
  const outline = getStroke(input, {
    size: el.strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !el.pressures,
    last: true,
  });
  if (!outline.length) return "";
  // Smooth the outline with quadratic curves through midpoints.
  const d = outline.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...outline[0], "Q"],
  );
  d.push("Z");
  return d.join(" ");
};

const generateShape = (el: SketchElement): Shape => {
  const { width: w, height: h } = el;
  const opts = roughOptions(el);
  switch (el.type) {
    case "rectangle":
      return {
        kind: "rough",
        drawables: [
          el.roundness === "round"
            ? generator.path(roundedRectPath(w, h), opts)
            : generator.rectangle(0, 0, w, h, opts),
        ],
      };
    case "diamond": {
      const pts: Point[] = [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
      return {
        kind: "rough",
        drawables: [
          el.roundness === "round"
            ? generator.path(roundedPolygonPath(pts), opts)
            : generator.polygon(pts, opts),
        ],
      };
    }
    case "ellipse":
      return {
        kind: "rough",
        drawables: [generator.ellipse(w / 2, h / 2, w, h, opts)],
      };
    case "line":
    case "arrow": {
      const pts = el.points ?? [];
      const lineOpts = roughOptions(el, false);
      const drawables: Drawable[] = [
        pts.length > 2 && el.roundness === "round"
          ? generator.curve(pts, lineOpts)
          : generator.linearPath(pts, lineOpts),
      ];
      if (el.type === "arrow" && pts.length >= 2) {
        drawables.push(
          ...arrowheadDrawables(el, el.endArrowhead, pts[pts.length - 1], pts[pts.length - 2]),
          ...arrowheadDrawables(el, el.startArrowhead, pts[0], pts[1]),
        );
      }
      return { kind: "rough", drawables };
    }
    case "freedraw":
      return { kind: "freedraw", path: freedrawPath(el) };
    case "text":
      return { kind: "rough", drawables: [] };
  }
};

const getShape = (el: SketchElement) => {
  let shape = shapeCache.get(el);
  if (!shape) {
    shape = generateShape(el);
    shapeCache.set(el, shape);
  }
  return shape;
};

const textLineY = (el: SketchElement, i: number) => {
  const lh = el.fontSize * LINE_HEIGHT;
  // Approximate alphabetic baseline inside each line box.
  return i * lh + (lh - el.fontSize) / 2 + el.fontSize * 0.8;
};

const textLineX = (el: SketchElement) =>
  el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: SketchElement,
  alpha = 1,
) => {
  const [cx, cy] = getCenter(el);
  ctx.save();
  ctx.globalAlpha = (el.opacity / 100) * alpha;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);
  if (el.type === "text") {
    ctx.font = fontString(el.fontSize, el.fontFamily);
    ctx.fillStyle = el.strokeColor;
    ctx.textAlign = el.textAlign;
    ctx.textBaseline = "alphabetic";
    (el.text ?? "").split("\n").forEach((line, i) => {
      ctx.fillText(line, textLineX(el), textLineY(el, i));
    });
  } else {
    const shape = getShape(el);
    if (shape.kind === "freedraw") {
      ctx.fillStyle = el.strokeColor;
      ctx.fill(new Path2D(shape.path));
    } else {
      for (const d of shape.drawables) rc.draw(d);
    }
  }
  ctx.restore();
};

export interface RenderOptions {
  viewport: Viewport;
  width: number;
  height: number;
  dpr: number;
  background: string;
  gridEnabled: boolean;
  /** Elements drawn translucent, e.g. while the eraser is over them. */
  fadedIds?: ReadonlySet<string>;
  /** Elements not drawn at all, e.g. text being edited in the overlay. */
  hiddenIds?: ReadonlySet<string>;
}

const GRID = 20;

export const renderScene = (
  canvas: HTMLCanvasElement,
  elements: readonly SketchElement[],
  opts: RenderOptions,
  drawOverlay?: (ctx: CanvasRenderingContext2D) => void,
) => {
  const ctx = canvas.getContext("2d")!;
  const rc = rough.canvas(canvas);
  const { viewport: v, dpr, width, height } = opts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, width, height);

  if (opts.gridEnabled) drawGrid(ctx, v, width, height);

  ctx.save();
  ctx.scale(v.zoom, v.zoom);
  ctx.translate(v.scrollX, v.scrollY);
  const viewMinX = -v.scrollX;
  const viewMinY = -v.scrollY;
  const viewMaxX = viewMinX + width / v.zoom;
  const viewMaxY = viewMinY + height / v.zoom;
  for (const el of elements) {
    if (opts.hiddenIds?.has(el.id)) continue;
    // Cheap culling using an unrotated, padded box.
    const pad = Math.max(el.width, el.height) + 50;
    if (
      el.x + el.width + pad < viewMinX ||
      el.y + el.height + pad < viewMinY ||
      el.x - pad > viewMaxX ||
      el.y - pad > viewMaxY
    ) {
      continue;
    }
    drawElement(ctx, rc, el, opts.fadedIds?.has(el.id) ? 0.25 : 1);
  }
  ctx.restore();
  drawOverlay?.(ctx);
};

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  width: number,
  height: number,
) => {
  if (GRID * v.zoom < 6) return;
  const lines = (from: number, to: number, horizontal: boolean) => {
    for (let s = Math.floor(from / GRID) * GRID; s <= to; s += GRID) {
      const major = Math.round(s / GRID) % 5 === 0;
      ctx.strokeStyle = major ? "rgba(0,0,0,0.09)" : "rgba(0,0,0,0.04)";
      const p = Math.round((s + (horizontal ? v.scrollY : v.scrollX)) * v.zoom) + 0.5;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(0, p);
        ctx.lineTo(width, p);
      } else {
        ctx.moveTo(p, 0);
        ctx.lineTo(p, height);
      }
      ctx.stroke();
    }
  };
  ctx.save();
  ctx.lineWidth = 1;
  lines(-v.scrollX, -v.scrollX + width / v.zoom, false);
  lines(-v.scrollY, -v.scrollY + height / v.zoom, true);
  ctx.restore();
};

export const GRID_SIZE = GRID;

// ---------- Export ----------

export interface ExportOptions {
  background: string | null;
  padding?: number;
  scale?: number;
}

export const exportToCanvas = (
  elements: readonly SketchElement[],
  { background, padding = 20, scale = 2 }: ExportOptions,
) => {
  const b = getCommonBounds(elements);
  const w = b.maxX - b.minX + padding * 2;
  const h = b.maxY - b.minY + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d")!;
  const rc = rough.canvas(canvas);
  ctx.scale(scale, scale);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.translate(padding - b.minX, padding - b.minY);
  for (const el of elements) drawElement(ctx, rc, el);
  return canvas;
};

const fontDataUrlCache = new Map<string, Promise<string | null>>();

const fontAsDataUrl = (file: string) => {
  if (!fontDataUrlCache.has(file)) {
    fontDataUrlCache.set(
      file,
      fetch(file)
        .then((r) => (r.ok ? r.blob() : null))
        .then(
          (blob) =>
            blob &&
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => null),
    );
  }
  return fontDataUrlCache.get(file)!;
};

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const exportToSvg = async (
  elements: readonly SketchElement[],
  { background, padding = 20 }: ExportOptions,
) => {
  const b = getCommonBounds(elements);
  const w = b.maxX - b.minX + padding * 2;
  const h = b.maxY - b.minY + padding * 2;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));

  // Embed the fonts actually used so the SVG renders the same anywhere.
  const families = new Set(
    elements.filter((e) => e.type === "text").map((e) => e.fontFamily),
  );
  let css = "";
  for (const [fam, file, name] of [
    [1, virgilUrl, "Virgil"],
    [3, cascadiaUrl, "Cascadia"],
  ] as const) {
    if (!families.has(fam)) continue;
    const url = await fontAsDataUrl(file);
    if (url) css += `@font-face{font-family:${name};src:url(${url});}`;
  }
  if (css) {
    const defs = document.createElementNS(NS, "defs");
    const style = document.createElementNS(NS, "style");
    style.textContent = css;
    defs.appendChild(style);
    svg.appendChild(defs);
  }

  if (background) {
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", background);
    svg.appendChild(rect);
  }

  const rs = rough.svg(svg);
  const offX = padding - b.minX;
  const offY = padding - b.minY;
  for (const el of elements) {
    const [cx, cy] = getCenter(el);
    const g = document.createElementNS(NS, "g");
    g.setAttribute(
      "transform",
      `translate(${cx + offX} ${cy + offY}) rotate(${(el.angle * 180) / Math.PI}) translate(${-el.width / 2} ${-el.height / 2})`,
    );
    if (el.opacity < 100) g.setAttribute("opacity", String(el.opacity / 100));
    if (el.type === "text") {
      const anchor =
        el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
      (el.text ?? "").split("\n").forEach((line, i) => {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", String(textLineX(el)));
        t.setAttribute("y", String(textLineY(el, i)));
        t.setAttribute("font-family", FONT_FAMILIES[el.fontFamily]);
        t.setAttribute("font-size", `${el.fontSize}px`);
        t.setAttribute("fill", el.strokeColor);
        t.setAttribute("text-anchor", anchor);
        t.setAttribute("style", "white-space: pre;");
        t.innerHTML = escapeXml(line);
        g.appendChild(t);
      });
    } else {
      const shape = getShape(el);
      if (shape.kind === "freedraw") {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", shape.path);
        p.setAttribute("fill", el.strokeColor);
        g.appendChild(p);
      } else {
        for (const d of shape.drawables) g.appendChild(rs.draw(d));
      }
    }
    svg.appendChild(g);
  }
  return svg;
};
