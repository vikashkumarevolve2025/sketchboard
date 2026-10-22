export type Point = [number, number];

export type ElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freedraw"
  | "text";

export type ToolType = ElementType | "selection" | "hand" | "eraser";

export type FillStyle = "hachure" | "cross-hatch" | "solid";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Roundness = "sharp" | "round";
export type FontFamily = 1 | 2 | 3; // 1 = hand-drawn, 2 = normal, 3 = code
export type TextAlign = "left" | "center" | "right";
export type Arrowhead = "arrow" | "triangle" | "dot" | "bar" | null;

/** Visual properties shared by every element; also the "current style" for new elements. */
export interface StyleProps {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number; // 0 architect, 1 artist, 2 cartoonist
  opacity: number; // 0-100
  roundness: Roundness;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
}

/**
 * Elements are immutable: every change produces a new object with a bumped
 * `version`. The renderer caches rough.js drawables per object identity.
 *
 * Geometry invariant: (x, y) is the top-left of the unrotated bounding box,
 * and rotation happens around the box centre. For line/arrow/freedraw the
 * `points` are relative to (x, y) and normalised so their minimum is 0,0.
 */
export interface SketchElement extends StyleProps {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  seed: number;
  version: number;
  groupIds: string[];
  points?: Point[];
  pressures?: number[];
  text?: string;
  locked?: boolean;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export type Theme = "light" | "dark";

export interface PersistedAppState {
  viewport: Viewport;
  theme: Theme;
  style: StyleProps;
  gridEnabled: boolean;
  viewBackground: string;
}
