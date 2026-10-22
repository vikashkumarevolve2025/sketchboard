import type { PersistedAppState, Point, Roundness, SketchElement } from "./types";
import { DEFAULT_STYLE, normalizePoints, randomSeed, randomId } from "./element";

const ELEMENTS_KEY = "sketchboard-elements";
const STATE_KEY = "sketchboard-state";

export const DEFAULT_APP_STATE: PersistedAppState = {
  viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
  theme:
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  style: DEFAULT_STYLE,
  gridEnabled: false,
  viewBackground: "#ffffff",
};

export const loadFromStorage = () => {
  let elements: SketchElement[] = [];
  let appState = DEFAULT_APP_STATE;
  try {
    const raw = localStorage.getItem(ELEMENTS_KEY);
    if (raw) elements = restoreElements(JSON.parse(raw));
    const rawState = localStorage.getItem(STATE_KEY);
    if (rawState) {
      const parsed = JSON.parse(rawState);
      appState = {
        ...DEFAULT_APP_STATE,
        ...parsed,
        style: { ...DEFAULT_STYLE, ...parsed.style },
      };
    }
  } catch (e) {
    console.warn("Could not restore saved drawing", e);
  }
  return { elements, appState };
};

export const saveToStorage = (
  elements: readonly SketchElement[],
  appState: PersistedAppState,
) => {
  try {
    localStorage.setItem(ELEMENTS_KEY, JSON.stringify(elements));
    localStorage.setItem(STATE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn("Could not save drawing", e);
  }
};

// ---------- File format ----------

export const FILE_EXTENSION = ".sketchboard";

export const serializeScene = (
  elements: readonly SketchElement[],
  viewBackground: string,
) =>
  JSON.stringify(
    {
      type: "sketchboard",
      version: 1,
      source: location.origin,
      elements,
      appState: { viewBackgroundColor: viewBackground },
    },
    null,
    2,
  );

const ELEMENT_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
]);

/**
 * Accepts our own elements as well as elements from `.excalidraw` files, whose
 * schema is close to ours. Anything unknown is dropped rather than crashing.
 */
export const restoreElements = (raw: unknown): SketchElement[] => {
  if (!Array.isArray(raw)) return [];
  const out: SketchElement[] = [];
  for (const r of raw as Record<string, any>[]) {
    if (!r || !ELEMENT_TYPES.has(r.type) || r.isDeleted) continue;
    const roundness: Roundness =
      r.roundness === "sharp" || r.roundness === "round"
        ? r.roundness
        : r.roundness
          ? "round"
          : r.type === "rectangle" || r.type === "diamond"
            ? "sharp"
            : "round";
    let el: SketchElement = {
      ...DEFAULT_STYLE,
      id: typeof r.id === "string" ? r.id : randomId(),
      type: r.type,
      x: Number(r.x) || 0,
      y: Number(r.y) || 0,
      width: Math.abs(Number(r.width) || 0),
      height: Math.abs(Number(r.height) || 0),
      angle: Number(r.angle) || 0,
      strokeColor: r.strokeColor ?? DEFAULT_STYLE.strokeColor,
      backgroundColor: r.backgroundColor ?? "transparent",
      fillStyle: ["hachure", "cross-hatch", "solid"].includes(r.fillStyle)
        ? r.fillStyle
        : r.fillStyle === "zigzag"
          ? "hachure"
          : "solid",
      strokeWidth: Number(r.strokeWidth) || 2,
      strokeStyle: ["solid", "dashed", "dotted"].includes(r.strokeStyle)
        ? r.strokeStyle
        : "solid",
      roughness: Number.isFinite(r.roughness) ? r.roughness : 1,
      opacity: Number.isFinite(r.opacity) ? r.opacity : 100,
      roundness,
      fontSize: Number(r.fontSize) || DEFAULT_STYLE.fontSize,
      fontFamily: [1, 2, 3].includes(r.fontFamily) ? r.fontFamily : 1,
      textAlign: ["left", "center", "right"].includes(r.textAlign)
        ? r.textAlign
        : "left",
      startArrowhead: r.startArrowhead ?? null,
      endArrowhead:
        r.type === "arrow" ? (r.endArrowhead === undefined ? "arrow" : r.endArrowhead) : null,
      seed: Number.isFinite(r.seed) ? r.seed : randomSeed(),
      version: 1,
      groupIds: Array.isArray(r.groupIds) ? r.groupIds.filter((g: unknown) => typeof g === "string") : [],
      locked: !!r.locked,
    };
    if (r.type === "text") {
      el.text = typeof r.text === "string" ? r.text : "";
    }
    if (r.type === "line" || r.type === "arrow" || r.type === "freedraw") {
      el.points = Array.isArray(r.points)
        ? r.points
            .filter((p: unknown) => Array.isArray(p) && p.length >= 2)
            .map((p: number[]) => [Number(p[0]) || 0, Number(p[1]) || 0] as Point)
        : [];
      if (!el.points.length) continue;
      if (Array.isArray(r.pressures) && r.pressures.length === el.points.length) {
        el.pressures = r.pressures;
      }
      el = normalizePoints(el);
    }
    out.push(el);
  }
  return out;
};

export const parseSceneFile = async (file: Blob) => {
  const data = JSON.parse(await file.text());
  if (data?.type !== "sketchboard" && data?.type !== "excalidraw") {
    throw new Error("Not a Sketchboard or Excalidraw file");
  }
  return {
    elements: restoreElements(data.elements),
    viewBackground:
      typeof data.appState?.viewBackgroundColor === "string"
        ? data.appState.viewBackgroundColor
        : undefined,
  };
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const pickFile = (accept: string) =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
