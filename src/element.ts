import type {
  ElementType,
  FontFamily,
  Point,
  SketchElement,
  StyleProps,
} from "./types";

export const randomId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export const DEFAULT_STYLE: StyleProps = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  roundness: "round",
  fontSize: 20,
  fontFamily: 1,
  textAlign: "left",
  startArrowhead: null,
  endArrowhead: "arrow",
};

export const LINE_HEIGHT = 1.25;

export const FONT_FAMILIES: Record<FontFamily, string> = {
  1: "Virgil, Segoe UI Emoji",
  2: "Helvetica, Arial, sans-serif",
  3: "Cascadia, ui-monospace, monospace",
};

export const fontString = (fontSize: number, fontFamily: FontFamily) =>
  `${fontSize}px ${FONT_FAMILIES[fontFamily]}`;

export const newElement = (
  type: ElementType,
  x: number,
  y: number,
  style: StyleProps,
  extra: Partial<SketchElement> = {},
): SketchElement => ({
  ...style,
  startArrowhead: type === "arrow" ? style.startArrowhead : null,
  endArrowhead: type === "arrow" ? style.endArrowhead : null,
  id: randomId(),
  type,
  x,
  y,
  width: 0,
  height: 0,
  angle: 0,
  seed: randomSeed(),
  version: 1,
  groupIds: [],
  ...extra,
});

export const updateElement = (
  el: SketchElement,
  patch: Partial<SketchElement>,
): SketchElement => ({ ...el, ...patch, version: el.version + 1 });

export const isLinear = (el: { type: ElementType }) =>
  el.type === "line" || el.type === "arrow";

export const hasPoints = (el: { type: ElementType }) =>
  isLinear(el) || el.type === "freedraw";

/**
 * Re-bases a point-based element so its points start at 0,0 and its x/y/width/height
 * match the points' bounding box. Keeps the element visually in place when unrotated.
 */
export const normalizePoints = (el: SketchElement): SketchElement => {
  const pts = el.points ?? [];
  if (!pts.length) return el;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (el.angle === 0) {
    return {
      ...el,
      x: el.x + minX,
      y: el.y + minY,
      width: maxX - minX,
      height: maxY - minY,
      points: pts.map(([x, y]) => [x - minX, y - minY] as Point),
    };
  }
  // For rotated elements keep the world position of the points stable:
  // the rotation centre moves when the box changes, so compensate for it.
  const oldCx = el.x + el.width / 2;
  const oldCy = el.y + el.height / 2;
  const w = maxX - minX;
  const h = maxY - minY;
  const localCx = minX + w / 2;
  const localCy = minY + h / 2;
  // World position of the new local centre under the old rotation.
  const cos = Math.cos(el.angle);
  const sin = Math.sin(el.angle);
  const dx = el.x + localCx - oldCx;
  const dy = el.y + localCy - oldCy;
  const newCx = oldCx + dx * cos - dy * sin;
  const newCy = oldCy + dx * sin + dy * cos;
  return {
    ...el,
    x: newCx - w / 2,
    y: newCy - h / 2,
    width: w,
    height: h,
    points: pts.map(([x, y]) => [x - minX, y - minY] as Point),
  };
};

let measureCtx: CanvasRenderingContext2D | null = null;

export const measureText = (
  text: string,
  fontSize: number,
  fontFamily: FontFamily,
) => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const ctx = measureCtx!;
  ctx.font = fontString(fontSize, fontFamily);
  const lines = text.split("\n");
  const width = Math.max(
    ...lines.map((l) => ctx.measureText(l || " ").width),
    fontSize * 0.5,
  );
  return { width, height: lines.length * fontSize * LINE_HEIGHT };
};

/** Re-measures a text element after its text or font changed, keeping its alignment anchor. */
export const refreshTextDimensions = (el: SketchElement): SketchElement => {
  if (el.type !== "text") return el;
  const { width, height } = measureText(el.text ?? "", el.fontSize, el.fontFamily);
  let x = el.x;
  if (el.textAlign === "center") x = el.x + el.width / 2 - width / 2;
  else if (el.textAlign === "right") x = el.x + el.width - width;
  return { ...el, x, width, height };
};

export const duplicateElements = (
  els: readonly SketchElement[],
  offset = 10,
): SketchElement[] => {
  const groupMap = new Map<string, string>();
  return els.map((el) => ({
    ...el,
    id: randomId(),
    seed: randomSeed(),
    version: 1,
    x: el.x + offset,
    y: el.y + offset,
    groupIds: el.groupIds.map((g) => {
      if (!groupMap.has(g)) groupMap.set(g, randomId());
      return groupMap.get(g)!;
    }),
  }));
};
