import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  ElementType,
  Point,
  SketchElement,
  StyleProps,
  Theme,
  ToolType,
  Viewport,
} from "./types";
import {
  duplicateElements,
  fontString,
  LINE_HEIGHT,
  newElement,
  normalizePoints,
  randomId,
  refreshTextDimensions,
  updateElement,
} from "./element";
import {
  distance,
  getCenter,
  getCommonBounds,
  normalizeAngle,
  rotatePoint,
  sceneToScreen,
  screenToScene,
  snapAngle,
  toLocal,
  zoomAt,
  type Bounds,
} from "./geometry";
import { elementsInBox, getElementAt, hitTest } from "./hit";
import { GRID_SIZE, renderScene } from "./render";
import {
  drawElementOutlines,
  drawSelectionFrame,
  getHandleAt,
  getSelectionFrame,
  handleCursor,
  HANDLE_DIRS,
  type HandleName,
} from "./selection";
import {
  downloadBlob,
  FILE_EXTENSION,
  loadFromStorage,
  parseSceneFile,
  pickFile,
  restoreElements,
  saveToStorage,
  serializeScene,
} from "./storage";
import { Icons } from "./components/icons";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ExportDialog, HelpDialog } from "./components/Dialogs";

type Interaction =
  | { kind: "none" }
  | { kind: "pan"; start: Point; viewport: Viewport }
  | { kind: "pinch"; startDist: number; startCenter: Point; viewport: Viewport }
  | { kind: "create"; id: string; origin: Point }
  | { kind: "linear"; id: string; scenePts: Point[]; multipoint: boolean; downScreen: Point }
  | { kind: "freedraw"; id: string; scenePts: Point[]; pressures: number[] | null }
  | { kind: "marquee"; origin: Point; current: Point; base: Set<string> }
  | { kind: "move"; origin: Point; originals: Map<string, SketchElement> }
  | { kind: "resize"; handle: HandleName; originals: SketchElement[]; bounds: Bounds; offset: Point }
  | { kind: "rotate"; originals: SketchElement[]; center: Point; startAngle: number }
  | { kind: "point"; id: string; index: number; original: SketchElement }
  | { kind: "erase"; ids: Set<string>; last: Point };

const TOOLS: { type: ToolType; key: string; label: string }[] = [
  { type: "hand", key: "H", label: "Hand (pan)" },
  { type: "selection", key: "1", label: "Selection" },
  { type: "rectangle", key: "2", label: "Rectangle" },
  { type: "diamond", key: "3", label: "Diamond" },
  { type: "ellipse", key: "4", label: "Ellipse" },
  { type: "arrow", key: "5", label: "Arrow" },
  { type: "line", key: "6", label: "Line" },
  { type: "freedraw", key: "7", label: "Draw" },
  { type: "text", key: "8", label: "Text" },
  { type: "eraser", key: "0", label: "Eraser" },
];

const TOOL_KEYS: Record<string, ToolType> = {
  h: "hand",
  v: "selection",
  "1": "selection",
  r: "rectangle",
  "2": "rectangle",
  d: "diamond",
  "3": "diamond",
  o: "ellipse",
  "4": "ellipse",
  a: "arrow",
  "5": "arrow",
  l: "line",
  "6": "line",
  p: "freedraw",
  x: "freedraw",
  "7": "freedraw",
  t: "text",
  "8": "text",
  e: "eraser",
  "0": "eraser",
};

const CANVAS_BACKGROUNDS = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6"];
const ACCENT = "#6965db";
const CLIPBOARD_TYPE = "sketchboard/clipboard";
const HIT_TOLERANCE = 8; // screen px

const isShapeTool = (t: ToolType): t is ElementType =>
  t !== "selection" && t !== "hand" && t !== "eraser";

const sameElements = (a: readonly SketchElement[], b: readonly SketchElement[]) =>
  a.length === b.length && a.every((el, i) => el === b[i]);

/** Grows a selection so that clicking any member of a group selects the whole group. */
const expandGroups = (ids: Iterable<string>, elements: readonly SketchElement[]) => {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const el of elements) {
    if (out.has(el.id) && el.groupIds.length) groups.add(el.groupIds[el.groupIds.length - 1]);
  }
  if (groups.size) {
    for (const el of elements) {
      if (el.groupIds.some((g) => groups.has(g))) out.add(el.id);
    }
  }
  return out;
};

export default function App() {
  const initial = useMemo(loadFromStorage, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ----- Core state. Each piece has a ref twin so event handlers never read stale values.
  const [elements, setElementsState] = useState<SketchElement[]>(initial.elements);
  const elementsRef = useRef(elements);
  const [viewport, setViewportState] = useState<Viewport>(initial.appState.viewport);
  const viewportRef = useRef(viewport);
  const [selectedIds, setSelectedState] = useState<Set<string>>(new Set());
  const selectedRef = useRef(selectedIds);
  const [tool, setToolState] = useState<ToolType>("selection");
  const toolRef = useRef(tool);
  const [toolLocked, setToolLocked] = useState(false);
  const [style, setStyle] = useState<StyleProps>(initial.appState.style);
  const styleRef = useRef(style);
  styleRef.current = style;
  const [theme, setTheme] = useState<Theme>(initial.appState.theme);
  const [gridEnabled, setGridEnabled] = useState(initial.appState.gridEnabled);
  const [viewBackground, setViewBackground] = useState(initial.appState.viewBackground);
  const [editing, setEditingState] = useState<{ id: string } | null>(null);
  const editingRef = useRef(editing);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"export" | "help" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const interactionRef = useRef<Interaction>({ kind: "none" });
  const pointersRef = useRef(new Map<number, Point>());
  const spaceDownRef = useRef(false);
  const lastPointerRef = useRef<Point>([size.w / 2, size.h / 2]);
  const clipboardRef = useRef<SketchElement[]>([]);
  const history = useRef({ past: [] as SketchElement[][], future: [] as SketchElement[][] });
  const committedRef = useRef(elements);

  const setElements = useCallback((next: SketchElement[]) => {
    elementsRef.current = next;
    setElementsState(next);
  }, []);

  const setViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const setSelected = useCallback((next: Set<string>) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  const setEditing = useCallback((next: { id: string } | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);

  const setTool = useCallback(
    (next: ToolType) => {
      toolRef.current = next;
      setToolState(next);
      if (next !== "selection") setSelected(new Set());
    },
    [setSelected],
  );

  /** Records the current elements as one undo step (no-op if nothing changed). */
  const commit = useCallback(() => {
    const cur = elementsRef.current;
    if (sameElements(cur, committedRef.current)) return;
    history.current.past.push(committedRef.current);
    if (history.current.past.length > 200) history.current.past.shift();
    history.current.future = [];
    committedRef.current = cur;
  }, []);

  const applyAndCommit = useCallback(
    (next: SketchElement[]) => {
      setElements(next);
      commit();
    },
    [setElements, commit],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(committedRef.current);
    committedRef.current = prev;
    setElements(prev);
    setSelected(new Set([...selectedRef.current].filter((id) => prev.some((e) => e.id === id))));
  }, [setElements, setSelected]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(committedRef.current);
    committedRef.current = next;
    setElements(next);
    setSelected(new Set([...selectedRef.current].filter((id) => next.some((e) => e.id === id))));
  }, [setElements, setSelected]);

  const selectedElements = useMemo(
    () => elements.filter((e) => selectedIds.has(e.id)),
    [elements, selectedIds],
  );

  // ----- Rendering
  const paintRef = useRef<number | null>(null);

  const paint = useCallback(() => {
    paintRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { innerWidth: w, innerHeight: h } = window;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const v = viewportRef.current;
    const it = interactionRef.current;
    const els = elementsRef.current;
    const editingId = editingRef.current?.id;
    renderScene(
      canvas,
      els,
      {
        viewport: v,
        width: w,
        height: h,
        dpr,
        background: viewBackgroundRef.current,
        gridEnabled: gridRef.current,
        fadedIds: it.kind === "erase" ? it.ids : undefined,
        hiddenIds: editingId ? new Set([editingId]) : undefined,
      },
      (ctx) => {
        const selected = els.filter((e) => selectedRef.current.has(e.id) && e.id !== editingId);
        const busy = it.kind === "move" || it.kind === "create" || it.kind === "freedraw";
        if (selected.length > 1) drawElementOutlines(ctx, selected, v, ACCENT);
        const frame = getSelectionFrame(selected, v);
        if (frame && !(busy && it.kind !== "move")) {
          drawSelectionFrame(ctx, frame, ACCENT, it.kind !== "move");
        }
        if (it.kind === "marquee") {
          const [x1, y1] = sceneToScreen(it.origin, v);
          const [x2, y2] = sceneToScreen(it.current, v);
          ctx.save();
          ctx.fillStyle = "rgba(105,101,219,0.08)";
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1;
          ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          ctx.restore();
        }
      },
    );
  }, []);

  const schedulePaint = useCallback(() => {
    if (paintRef.current == null) paintRef.current = requestAnimationFrame(paint);
  }, [paint]);

  const viewBackgroundRef = useRef(viewBackground);
  viewBackgroundRef.current = viewBackground;
  const gridRef = useRef(gridEnabled);
  gridRef.current = gridEnabled;

  useLayoutEffect(() => {
    schedulePaint();
  }, [elements, viewport, selectedIds, viewBackground, gridEnabled, editing, size, schedulePaint]);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    // Repaint once the hand-drawn font has loaded so text measures correctly.
    document.fonts?.ready.then(() => {
      setElements(elementsRef.current.map((e) => (e.type === "text" ? refreshTextDimensions(e) : e)));
      committedRef.current = elementsRef.current;
    });
    return () => window.removeEventListener("resize", onResize);
  }, [setElements]);

  // ----- Persistence (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveToStorage(
        elements.filter((e) => e.type !== "text" || e.text),
        { viewport, theme, style, gridEnabled, viewBackground },
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [elements, viewport, theme, style, gridEnabled, viewBackground]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121212" : "#ffffff");
  }, [theme]);

  // ----- Helpers
  const toScene = (screen: Point) => screenToScene(screen, viewportRef.current);
  const snap = (p: Point, e?: { ctrlKey: boolean; metaKey: boolean }): Point =>
    gridRef.current && !(e && (e.ctrlKey || e.metaKey))
      ? [Math.round(p[0] / GRID_SIZE) * GRID_SIZE, Math.round(p[1] / GRID_SIZE) * GRID_SIZE]
      : p;
  const tolerance = () => HIT_TOLERANCE / viewportRef.current.zoom;

  const replaceElement = (id: string, fn: (el: SketchElement) => SketchElement) => {
    setElements(elementsRef.current.map((e) => (e.id === id ? fn(e) : e)));
  };

  const finishTool = (createdId: string | null) => {
    if (!toolLocked && toolRef.current !== "freedraw") {
      setTool("selection");
      if (createdId) setSelected(new Set([createdId]));
    }
  };

  const linearFromScenePoints = (base: SketchElement, pts: Point[]) =>
    normalizePoints({ ...base, x: 0, y: 0, width: 0, height: 0, points: pts, version: base.version + 1 });

  // ----- Text editing
  const startTextEditing = (el: SketchElement, isNew: boolean) => {
    if (isNew) setElements([...elementsRef.current, el]);
    setSelected(new Set());
    setEditing({ id: el.id });
  };

  // Focus the editor as soon as it mounts so no keystrokes are lost.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!editing || !ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [editing]);

  const createTextAt = (scenePt: Point, center?: Point) => {
    const s = styleRef.current;
    const lh = s.fontSize * LINE_HEIGHT;
    let el = newElement("text", scenePt[0], scenePt[1] - lh / 2, s, { text: "" });
    el = refreshTextDimensions(el);
    if (center) {
      el = refreshTextDimensions({ ...el, textAlign: "center" });
      el = { ...el, x: center[0] - el.width / 2, y: center[1] - el.height / 2 };
    }
    startTextEditing(el, true);
  };

  const finishEditing = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null);
    const el = elementsRef.current.find((e) => e.id === ed.id);
    if (!el) return;
    if (!el.text?.trim()) {
      const next = elementsRef.current.filter((e) => e.id !== ed.id);
      setElements(sameElements(next, committedRef.current) ? committedRef.current : next);
      commit();
    } else {
      commit();
      if (toolRef.current === "text" && toolLocked) return;
      toolRef.current = "selection";
      setToolState("selection");
      setSelected(new Set([el.id]));
    }
  }, [commit, setEditing, setElements, setSelected, toolLocked]);

  // ----- Pointer handling
  const canvasPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const finishLinear = () => {
    const it = interactionRef.current;
    if (it.kind !== "linear") return;
    interactionRef.current = { kind: "none" };
    let pts = it.scenePts;
    // In click-to-place mode the last point just follows the cursor; drop it.
    if (it.multipoint) pts = pts.slice(0, -1);
    const el = elementsRef.current.find((e) => e.id === it.id);
    if (!el || pts.length < 2) {
      setElements(elementsRef.current.filter((e) => e.id !== it.id));
      commit();
      return;
    }
    replaceElement(it.id, (cur) => linearFromScenePoints(cur, pts));
    commit();
    finishTool(it.id);
    schedulePaint();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingRef.current) {
      finishEditing();
      return;
    }
    setMenuOpen(false);
    const screen = canvasPoint(e);
    lastPointerRef.current = screen;
    pointersRef.current.set(e.pointerId, screen);
    e.currentTarget.setPointerCapture(e.pointerId);

    // Two fingers: abandon whatever the first finger started and pinch-zoom instead.
    if (pointersRef.current.size === 2) {
      const it = interactionRef.current;
      if (it.kind !== "none" && it.kind !== "pan") {
        setElements(committedRef.current);
      }
      const [a, b] = [...pointersRef.current.values()];
      interactionRef.current = {
        kind: "pinch",
        startDist: distance(a, b),
        startCenter: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        viewport: viewportRef.current,
      };
      return;
    }
    if (pointersRef.current.size > 2) return;

    const current = interactionRef.current;
    if (current.kind === "linear" && current.multipoint) {
      const scene = snap(toScene(screen), e);
      const pts = current.scenePts;
      // Clicking the previous point (or the start) ends the line.
      const prev = sceneToScreen(pts[pts.length - 2], viewportRef.current);
      if (distance(prev, screen) < 10) {
        finishLinear();
        return;
      }
      pts[pts.length - 1] = scene;
      pts.push(scene);
      return;
    }

    const t = toolRef.current;
    const scene = toScene(screen);

    if (e.button === 1 || spaceDownRef.current || t === "hand") {
      interactionRef.current = { kind: "pan", start: screen, viewport: viewportRef.current };
      e.currentTarget.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;

    if (t === "eraser") {
      const ids = new Set<string>();
      const hit = getElementAt(elementsRef.current, scene, tolerance());
      if (hit) ids.add(hit.id);
      interactionRef.current = { kind: "erase", ids, last: scene };
      schedulePaint();
      return;
    }

    if (t === "selection") {
      const v = viewportRef.current;
      const selected = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
      const frame = getSelectionFrame(selected, v);
      const handle = getHandleAt(frame, screen);
      if (handle?.kind === "point") {
        interactionRef.current = { kind: "point", id: selected[0].id, index: handle.index, original: selected[0] };
        return;
      }
      if (handle?.kind === "handle") {
        if (handle.name === "rotation") {
          const center: Point =
            selected.length === 1
              ? getCenter(selected[0])
              : (() => {
                  const b = getCommonBounds(selected);
                  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as Point;
                })();
          interactionRef.current = {
            kind: "rotate",
            originals: selected,
            center,
            startAngle: Math.atan2(scene[1] - center[1], scene[0] - center[0]),
          };
        } else {
          // Remember how far the pointer is from the true corner so the shape doesn't jump.
          const bounds = getCommonBounds(selected);
          const [dirX, dirY] = HANDLE_DIRS[handle.name];
          let corner: Point;
          if (selected.length === 1) {
            const el = selected[0];
            corner = rotatePoint(
              [el.x + ((dirX + 1) / 2) * el.width, el.y + ((dirY + 1) / 2) * el.height],
              getCenter(el),
              el.angle,
            );
          } else {
            corner = [dirX === 1 ? bounds.maxX : bounds.minX, dirY === 1 ? bounds.maxY : bounds.minY];
          }
          interactionRef.current = {
            kind: "resize",
            handle: handle.name,
            originals: selected,
            bounds,
            offset: [scene[0] - corner[0], scene[1] - corner[1]],
          };
        }
        return;
      }

      const hit = getElementAt(elementsRef.current, scene, tolerance());
      let sel = selectedRef.current;
      if (hit) {
        const group = expandGroups([hit.id], elementsRef.current);
        if (e.shiftKey) {
          sel = new Set(sel);
          const removing = sel.has(hit.id);
          group.forEach((id) => (removing ? sel.delete(id) : sel.add(id)));
        } else if (!sel.has(hit.id)) {
          sel = group;
        }
        setSelected(sel);
      } else {
        // Dragging inside the current multi-selection's box moves it, like Excalidraw.
        const b = selected.length > 1 ? getCommonBounds(selected) : null;
        const insideSelection =
          b && scene[0] >= b.minX && scene[0] <= b.maxX && scene[1] >= b.minY && scene[1] <= b.maxY;
        if (!insideSelection) {
          const base = e.shiftKey ? new Set(sel) : new Set<string>();
          if (!e.shiftKey) setSelected(new Set());
          interactionRef.current = { kind: "marquee", origin: scene, current: scene, base };
          return;
        }
      }
      if (hit && e.shiftKey && !sel.has(hit.id)) return;

      // Start moving the selection. Alt-drag leaves a copy behind.
      let els = elementsRef.current;
      if (e.altKey && sel.size) {
        const toCopy = els.filter((el) => sel.has(el.id));
        const copies = duplicateElements(toCopy, 0);
        // Copies go where the originals were (below them), originals keep moving.
        const firstIdx = els.findIndex((el) => sel.has(el.id));
        els = [...els.slice(0, firstIdx), ...copies, ...els.slice(firstIdx)];
        setElements(els);
      }
      interactionRef.current = {
        kind: "move",
        origin: scene,
        originals: new Map(els.filter((el) => sel.has(el.id)).map((el) => [el.id, el])),
      };
      return;
    }

    if (t === "text") {
      const hit = getElementAt(elementsRef.current, scene, tolerance());
      if (hit?.type === "text") startTextEditing(hit, false);
      else createTextAt(snap(scene, e));
      return;
    }

    if (isShapeTool(t)) {
      const origin = snap(scene, e);
      const s = styleRef.current;
      if (t === "line" || t === "arrow") {
        const el = newElement(t, origin[0], origin[1], s, { points: [[0, 0], [0, 0]] });
        setElements([...elementsRef.current, el]);
        interactionRef.current = { kind: "linear", id: el.id, scenePts: [origin, origin], multipoint: false, downScreen: screen };
      } else if (t === "freedraw") {
        const pressure = e.pointerType === "pen" ? e.pressure : null;
        const el = newElement("freedraw", origin[0], origin[1], s, {
          points: [[0, 0]],
          pressures: pressure != null ? [pressure] : undefined,
          roundness: "round",
        });
        setElements([...elementsRef.current, el]);
        interactionRef.current = { kind: "freedraw", id: el.id, scenePts: [scene], pressures: pressure != null ? [pressure] : null };
      } else {
        const el = newElement(t, origin[0], origin[1], s);
        setElements([...elementsRef.current, el]);
        interactionRef.current = { kind: "create", id: el.id, origin };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screen = canvasPoint(e);
    lastPointerRef.current = screen;
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, screen);
    const it = interactionRef.current;
    const scene = toScene(screen);

    switch (it.kind) {
      case "none": {
        updateHoverCursor(screen, scene);
        return;
      }
      case "pan": {
        const z = it.viewport.zoom;
        setViewport({
          ...it.viewport,
          scrollX: it.viewport.scrollX + (screen[0] - it.start[0]) / z,
          scrollY: it.viewport.scrollY + (screen[1] - it.start[1]) / z,
        });
        return;
      }
      case "pinch": {
        if (pointersRef.current.size < 2) return;
        const [a, b] = [...pointersRef.current.values()];
        const center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const zoomed = zoomAt(it.viewport, (it.viewport.zoom * distance(a, b)) / it.startDist, it.startCenter);
        setViewport({
          ...zoomed,
          scrollX: zoomed.scrollX + (center[0] - it.startCenter[0]) / zoomed.zoom,
          scrollY: zoomed.scrollY + (center[1] - it.startCenter[1]) / zoomed.zoom,
        });
        return;
      }
      case "create": {
        let [x2, y2] = snap(scene, e);
        const [x1, y1] = it.origin;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
          x2 = x1 + side * Math.sign(x2 - x1 || 1);
          y2 = y1 + side * Math.sign(y2 - y1 || 1);
        }
        replaceElement(it.id, (el) =>
          updateElement(el, {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
          }),
        );
        return;
      }
      case "linear": {
        let p = snap(scene, e);
        const pts = it.scenePts;
        const anchor = pts[pts.length - 2];
        if (e.shiftKey) {
          const len = distance(anchor, p);
          const ang = snapAngle(Math.atan2(p[1] - anchor[1], p[0] - anchor[0]));
          p = [anchor[0] + len * Math.cos(ang), anchor[1] + len * Math.sin(ang)];
        }
        pts[pts.length - 1] = p;
        replaceElement(it.id, (el) => linearFromScenePoints(el, [...pts]));
        return;
      }
      case "freedraw": {
        // Coalesced events give smoother strokes on fast movements.
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        for (const ev of events.length ? events : [e.nativeEvent]) {
          it.scenePts.push(toScene(canvasPoint(ev)));
          if (it.pressures) it.pressures.push(ev.pressure);
        }
        replaceElement(it.id, (el) => ({
          ...linearFromScenePoints(el, [...it.scenePts]),
          pressures: it.pressures ? [...it.pressures] : undefined,
        }));
        return;
      }
      case "marquee": {
        it.current = scene;
        const box = {
          minX: Math.min(it.origin[0], scene[0]),
          minY: Math.min(it.origin[1], scene[1]),
          maxX: Math.max(it.origin[0], scene[0]),
          maxY: Math.max(it.origin[1], scene[1]),
        };
        const inBox = elementsInBox(elementsRef.current, box).map((el) => el.id);
        setSelected(expandGroups([...it.base, ...inBox], elementsRef.current));
        schedulePaint();
        return;
      }
      case "move": {
        let dx = scene[0] - it.origin[0];
        let dy = scene[1] - it.origin[1];
        if (e.shiftKey) {
          // Constrain to the dominant axis.
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (gridRef.current) {
          const first = it.originals.values().next().value;
          if (first) {
            const [sx, sy] = snap([first.x + dx, first.y + dy], e);
            dx = sx - first.x;
            dy = sy - first.y;
          }
        }
        setElements(
          elementsRef.current.map((el) => {
            const o = it.originals.get(el.id);
            return o ? updateElement(o, { x: o.x + dx, y: o.y + dy }) : el;
          }),
        );
        return;
      }
      case "resize": {
        const updated = resizeElements(it, [scene[0] - it.offset[0], scene[1] - it.offset[1]], e.shiftKey);
        setElements(elementsRef.current.map((el) => updated.get(el.id) ?? el));
        return;
      }
      case "rotate": {
        const cur = Math.atan2(scene[1] - it.center[1], scene[0] - it.center[0]);
        let delta = cur - it.startAngle;
        if (it.originals.length === 1) {
          // Single element: absolute angle, so Shift snaps to clean 15° steps.
          let angle = normalizeAngle(it.originals[0].angle + delta);
          if (e.shiftKey) angle = normalizeAngle(snapAngle(angle));
          delta = angle - it.originals[0].angle;
        } else if (e.shiftKey) {
          delta = snapAngle(delta);
        }
        const map = new Map(
          it.originals.map((o) => {
            const [cx, cy] = rotatePoint(getCenter(o), it.center, delta);
            return [
              o.id,
              updateElement(o, {
                x: cx - o.width / 2,
                y: cy - o.height / 2,
                angle: normalizeAngle(o.angle + delta),
              }),
            ];
          }),
        );
        setElements(elementsRef.current.map((el) => map.get(el.id) ?? el));
        return;
      }
      case "point": {
        const o = it.original;
        const pts = [...(o.points ?? [])];
        let local = toLocal(o, snap(scene, e));
        const neighbour = pts[it.index === 0 ? 1 : it.index - 1];
        if (e.shiftKey && neighbour) {
          const len = distance(neighbour, local);
          const ang = snapAngle(Math.atan2(local[1] - neighbour[1], local[0] - neighbour[0]));
          local = [neighbour[0] + len * Math.cos(ang), neighbour[1] + len * Math.sin(ang)];
        }
        pts[it.index] = local;
        replaceElement(o.id, () => normalizePoints(updateElement(o, { points: pts })));
        return;
      }
      case "erase": {
        // Sample along the drag so fast swipes don't skip thin elements.
        const steps = Math.max(1, Math.ceil(distance(it.last, scene) / (4 / viewportRef.current.zoom)));
        for (let i = 1; i <= steps; i++) {
          const p: Point = [
            it.last[0] + ((scene[0] - it.last[0]) * i) / steps,
            it.last[1] + ((scene[1] - it.last[1]) * i) / steps,
          ];
          for (const el of elementsRef.current) {
            if (!it.ids.has(el.id) && hitTest(el, p, tolerance())) {
              expandGroups([el.id], elementsRef.current).forEach((id) => it.ids.add(id));
            }
          }
        }
        it.last = scene;
        schedulePaint();
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    const it = interactionRef.current;
    const canvas = e.currentTarget;
    switch (it.kind) {
      case "pinch":
        if (pointersRef.current.size === 0) interactionRef.current = { kind: "none" };
        return;
      case "pan":
        interactionRef.current = { kind: "none" };
        canvas.style.cursor = toolRef.current === "hand" || spaceDownRef.current ? "grab" : "";
        return;
      case "create": {
        interactionRef.current = { kind: "none" };
        const el = elementsRef.current.find((x) => x.id === it.id);
        if (!el || (el.width < 2 && el.height < 2)) {
          setElements(elementsRef.current.filter((x) => x.id !== it.id));
          commit();
          return;
        }
        commit();
        finishTool(el.id);
        return;
      }
      case "linear": {
        if (it.multipoint) return; // keeps going until Enter / Esc / double-click
        if (distance(canvasPoint(e), it.downScreen) < 4) {
          // A click instead of a drag starts click-to-place mode.
          it.multipoint = true;
          return;
        }
        finishLinear();
        return;
      }
      case "freedraw": {
        interactionRef.current = { kind: "none" };
        if (it.scenePts.length === 1) {
          // A single tap still leaves a dot.
          const p = it.scenePts[0];
          replaceElement(it.id, (el) => linearFromScenePoints(el, [p, [p[0] + 0.5, p[1] + 0.5]]));
        }
        commit();
        return;
      }
      case "marquee":
        interactionRef.current = { kind: "none" };
        schedulePaint();
        return;
      case "move":
      case "resize":
      case "rotate":
      case "point":
        interactionRef.current = { kind: "none" };
        commit();
        schedulePaint();
        return;
      case "erase": {
        interactionRef.current = { kind: "none" };
        if (it.ids.size) applyAndCommit(elementsRef.current.filter((el) => !it.ids.has(el.id)));
        schedulePaint();
        return;
      }
    }
  };

  const updateHoverCursor = (screen: Point, scene: Point) => {
    const canvas = canvasRef.current!;
    const t = toolRef.current;
    if (t === "hand" || spaceDownRef.current) {
      canvas.style.cursor = "grab";
      return;
    }
    if (t === "eraser") {
      canvas.style.cursor = "cell";
      return;
    }
    if (t === "text") {
      canvas.style.cursor = "text";
      return;
    }
    if (t !== "selection") {
      canvas.style.cursor = "crosshair";
      return;
    }
    const selected = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
    const frame = getSelectionFrame(selected, viewportRef.current);
    const handle = getHandleAt(frame, screen);
    if (handle?.kind === "point") canvas.style.cursor = "pointer";
    else if (handle?.kind === "handle")
      canvas.style.cursor = handleCursor(handle.name, frame?.kind === "box" ? frame.angle : 0);
    else if (getElementAt(elementsRef.current, scene, tolerance())) canvas.style.cursor = "move";
    else canvas.style.cursor = "";
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const it = interactionRef.current;
    if (it.kind === "linear") {
      finishLinear();
      return;
    }
    if (toolRef.current !== "selection") return;
    const scene = toScene(canvasPoint(e));
    const hit = getElementAt(elementsRef.current, scene, tolerance());
    if (hit?.type === "text") {
      startTextEditing(hit, false);
    } else if (hit && (hit.type === "rectangle" || hit.type === "ellipse" || hit.type === "diamond")) {
      createTextAt(scene, getCenter(hit));
    } else if (!hit) {
      createTextAt(snap(scene));
    }
  };

  // ----- Resize maths
  const resizeElements = (
    it: Extract<Interaction, { kind: "resize" }>,
    scene: Point,
    keepAspect: boolean,
  ) => {
    const out = new Map<string, SketchElement>();
    const handle = it.handle as Exclude<HandleName, "rotation">;
    const [dirX, dirY] = HANDLE_DIRS[handle];

    if (it.originals.length === 1) {
      const o = it.originals[0];
      const w = o.width || 1;
      const h = o.height || 1;
      const p = toLocal(o, scene);
      let minX = 0,
        maxX = o.width,
        minY = 0,
        maxY = o.height;
      if (dirX === 1) maxX = p[0];
      if (dirX === -1) minX = p[0];
      if (dirY === 1) maxY = p[1];
      if (dirY === -1) minY = p[1];
      let sx = (maxX - minX) / w;
      let sy = (maxY - minY) / h;
      // Text always scales uniformly (it changes the font size).
      if ((keepAspect || o.type === "text") && dirX && dirY) {
        const s = Math.max(Math.abs(sx), Math.abs(sy));
        sx = s * Math.sign(sx || 1);
        sy = s * Math.sign(sy || 1);
        if (dirX === 1) maxX = minX + w * sx;
        else minX = maxX - w * sx;
        if (dirY === 1) maxY = minY + h * sy;
        else minY = maxY - h * sy;
      }
      const newW = Math.abs(maxX - minX);
      const newH = Math.abs(maxY - minY);
      const localCx = (minX + maxX) / 2;
      const localCy = (minY + maxY) / 2;
      const [cx, cy] = rotatePoint([o.x + localCx, o.y + localCy], getCenter(o), o.angle);
      let next = updateElement(o, { x: cx - newW / 2, y: cy - newH / 2, width: newW, height: newH });
      if (o.points) {
        const fx = o.width ? (maxX - minX) / o.width : 1;
        const fy = o.height ? (maxY - minY) / o.height : 1;
        next.points = o.points.map(([px, py]) => [
          px * fx + (fx < 0 ? newW : 0),
          py * fy + (fy < 0 ? newH : 0),
        ]);
      }
      if (o.type === "text") {
        const fontSize = Math.max(4, o.fontSize * Math.abs(sy));
        next = { ...next, fontSize };
      }
      out.set(o.id, next);
      return out;
    }

    // Multi-selection: scale everything relative to the opposite corner.
    const b = it.bounds;
    const anchorX = dirX === 1 ? b.minX : b.maxX;
    const anchorY = dirY === 1 ? b.minY : b.maxY;
    const bw = b.maxX - b.minX || 1;
    const bh = b.maxY - b.minY || 1;
    let sx = Math.max(0.05, (dirX === 1 ? scene[0] - anchorX : anchorX - scene[0]) / bw);
    let sy = Math.max(0.05, (dirY === 1 ? scene[1] - anchorY : anchorY - scene[1]) / bh);
    if (keepAspect || it.originals.some((o) => o.type === "text")) sx = sy = Math.max(sx, sy);
    for (const o of it.originals) {
      const [ocx, ocy] = getCenter(o);
      const ncx = anchorX + (ocx - anchorX) * sx;
      const ncy = anchorY + (ocy - anchorY) * sy;
      const width = o.width * sx;
      const height = o.height * sy;
      const next = updateElement(o, { x: ncx - width / 2, y: ncy - height / 2, width, height });
      if (o.points) next.points = o.points.map(([px, py]) => [px * sx, py * sy]);
      if (o.type === "text") next.fontSize = Math.max(4, o.fontSize * sy);
      out.set(o.id, next);
    }
    return out;
  };

  // ----- Actions
  const deleteSelected = () => {
    const sel = selectedRef.current;
    if (!sel.size) return;
    applyAndCommit(elementsRef.current.filter((el) => !sel.has(el.id)));
    setSelected(new Set());
  };

  const duplicateSelected = () => {
    const sel = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
    if (!sel.length) return;
    const copies = duplicateElements(sel, 10);
    applyAndCommit([...elementsRef.current, ...copies]);
    setSelected(new Set(copies.map((c) => c.id)));
  };

  const reorder = (op: "front" | "forward" | "backward" | "back") => {
    const sel = selectedRef.current;
    const els = [...elementsRef.current];
    if (!sel.size) return;
    if (op === "front" || op === "back") {
      const picked = els.filter((e) => sel.has(e.id));
      const rest = els.filter((e) => !sel.has(e.id));
      applyAndCommit(op === "front" ? [...rest, ...picked] : [...picked, ...rest]);
      return;
    }
    if (op === "forward") {
      for (let i = els.length - 2; i >= 0; i--) {
        if (sel.has(els[i].id) && !sel.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      }
    } else {
      for (let i = 1; i < els.length; i++) {
        if (sel.has(els[i].id) && !sel.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    }
    applyAndCommit(els);
  };

  const group = () => {
    const sel = selectedRef.current;
    if (sel.size < 2) return;
    const gid = randomId();
    applyAndCommit(
      elementsRef.current.map((el) => (sel.has(el.id) ? updateElement(el, { groupIds: [...el.groupIds, gid] }) : el)),
    );
  };

  const ungroup = () => {
    const sel = selectedRef.current;
    applyAndCommit(
      elementsRef.current.map((el) =>
        sel.has(el.id) && el.groupIds.length ? updateElement(el, { groupIds: el.groupIds.slice(0, -1) }) : el,
      ),
    );
  };

  const changeStyle = (patch: Partial<StyleProps>) => {
    setStyle((s) => ({ ...s, ...patch }));
    const sel = selectedRef.current;
    const editingId = editingRef.current?.id;
    if (!sel.size && !editingId) return;
    const next = elementsRef.current.map((el) => {
      if (!sel.has(el.id) && el.id !== editingId) return el;
      const p: Partial<SketchElement> = { ...patch };
      if (el.type !== "arrow") {
        delete p.startArrowhead;
        delete p.endArrowhead;
      }
      let u = updateElement(el, p);
      if (el.type === "text" && ("fontSize" in p || "fontFamily" in p)) u = refreshTextDimensions(u);
      return u;
    });
    if (editingId) setElements(next);
    else applyAndCommit(next);
  };

  const nudge = (dx: number, dy: number) => {
    const sel = selectedRef.current;
    applyAndCommit(
      elementsRef.current.map((el) => (sel.has(el.id) ? updateElement(el, { x: el.x + dx, y: el.y + dy }) : el)),
    );
  };

  const zoomBy = (factor: number, anchor?: Point) => {
    const v = viewportRef.current;
    setViewport(zoomAt(v, v.zoom * factor, anchor ?? [window.innerWidth / 2, window.innerHeight / 2]));
  };

  const zoomToFit = (els: readonly SketchElement[]) => {
    if (!els.length) {
      setViewport({ scrollX: 0, scrollY: 0, zoom: 1 });
      return;
    }
    const b = getCommonBounds(els);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const zoom = Math.min(1, Math.max(0.1, Math.min(w / (b.maxX - b.minX + 160), h / (b.maxY - b.minY + 160))));
    setViewport({
      zoom,
      scrollX: w / 2 / zoom - (b.minX + b.maxX) / 2,
      scrollY: h / 2 / zoom - (b.minY + b.maxY) / 2,
    });
  };

  const selectAll = () => {
    setTool("selection");
    setSelected(new Set(elementsRef.current.map((e) => e.id)));
  };

  const copySelected = (cut: boolean) => {
    const sel = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
    if (!sel.length) return;
    clipboardRef.current = sel;
    navigator.clipboard
      ?.writeText(JSON.stringify({ type: CLIPBOARD_TYPE, elements: sel }))
      .catch(() => {});
    if (cut) deleteSelected();
  };

  const pasteElements = (raw: SketchElement[]) => {
    if (!raw.length) return;
    const b = getCommonBounds(raw);
    const [px, py] = toScene(lastPointerRef.current);
    const copies = duplicateElements(raw, 0).map((el) => ({
      ...el,
      x: el.x - (b.minX + b.maxX) / 2 + px,
      y: el.y - (b.minY + b.maxY) / 2 + py,
    }));
    setTool("selection");
    applyAndCommit([...elementsRef.current, ...copies]);
    setSelected(new Set(copies.map((c) => c.id)));
  };

  const saveFile = () => {
    const blob = new Blob([serializeScene(elementsRef.current, viewBackground)], { type: "application/json" });
    downloadBlob(blob, `sketch-${new Date().toISOString().slice(0, 10)}${FILE_EXTENSION}`);
  };

  const loadScene = (els: SketchElement[], bg?: string) => {
    applyAndCommit(els);
    setSelected(new Set());
    if (bg) setViewBackground(bg);
    zoomToFit(els);
  };

  const openFile = async () => {
    const file = await pickFile(`${FILE_EXTENSION},.excalidraw,.json,application/json`);
    if (!file) return;
    try {
      const { elements: els, viewBackground: bg } = await parseSceneFile(file);
      loadScene(els, bg);
      showToast(`Opened ${file.name}`);
    } catch {
      showToast("That file couldn't be opened");
    }
  };

  const resetCanvas = () => {
    if (!elementsRef.current.length) return;
    if (!window.confirm("Clear the whole canvas? You can undo this with Ctrl+Z.")) return;
    applyAndCommit([]);
    setSelected(new Set());
  };

  // ----- Keyboard
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (editingRef.current || dialog || target.closest("input, textarea, select")) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const it = interactionRef.current;

    if (e.key === " " && !spaceDownRef.current) {
      spaceDownRef.current = true;
      if (canvasRef.current && it.kind === "none") canvasRef.current.style.cursor = "grab";
      e.preventDefault();
      return;
    }

    if (it.kind === "linear" && it.multipoint && (e.key === "Escape" || e.key === "Enter")) {
      finishLinear();
      return;
    }

    if (mod) {
      const handled = (() => {
        if (key === "z" && !e.shiftKey) return undo(), true;
        if ((key === "z" && e.shiftKey) || key === "y") return redo(), true;
        if (key === "a") return selectAll(), true;
        if (key === "d") return duplicateSelected(), true;
        if (key === "c") return copySelected(false), true;
        if (key === "x") return copySelected(true), true;
        if (key === "g" && e.shiftKey) return ungroup(), true;
        if (key === "g") return group(), true;
        if (key === "s") return saveFile(), true;
        if (key === "o") return openFile(), true;
        if (key === "e" && e.shiftKey) return setDialog("export"), true;
        if (e.key === "]" || e.code === "BracketRight") return reorder(e.shiftKey ? "front" : "forward"), true;
        if (e.key === "[" || e.code === "BracketLeft") return reorder(e.shiftKey ? "back" : "backward"), true;
        if (e.key === "'" || e.code === "Quote") return setGridEnabled((g) => !g), true;
        if (e.key === "=" || e.key === "+") return zoomBy(1.1), true;
        if (e.key === "-") return zoomBy(1 / 1.1), true;
        if (e.key === "0") return setViewport({ ...viewportRef.current, ...zoomAt(viewportRef.current, 1, [window.innerWidth / 2, window.innerHeight / 2]) }), true;
        return false;
      })();
      if (handled) e.preventDefault();
      return;
    }

    if (e.altKey && e.shiftKey && key === "d") {
      setTheme((t) => (t === "dark" ? "light" : "dark"));
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (e.code === "Digit1" || e.key === "!")) {
      zoomToFit(elementsRef.current);
      return;
    }
    if (e.shiftKey && (e.code === "Digit2" || e.key === "@")) {
      const sel = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
      zoomToFit(sel.length ? sel : elementsRef.current);
      return;
    }

    switch (e.key) {
      case "Delete":
      case "Backspace":
        deleteSelected();
        e.preventDefault();
        return;
      case "Escape":
        setSelected(new Set());
        setMenuOpen(false);
        if (toolRef.current !== "selection") setTool("selection");
        return;
      case "Enter": {
        const sel = elementsRef.current.filter((el) => selectedRef.current.has(el.id));
        if (sel.length === 1 && sel[0].type === "text") {
          e.preventDefault();
          startTextEditing(sel[0], false);
        }
        return;
      }
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (!selectedRef.current.size) return;
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
        nudge(d[0], d[1]);
        e.preventDefault();
        return;
      }
      case "?":
        setDialog("help");
        return;
    }

    if (key === "q") {
      setToolLocked((l) => !l);
      return;
    }
    const nextTool = TOOL_KEYS[key];
    if (nextTool && !e.altKey) setTool(nextTool);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keyHandlerRef.current(e);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceDownRef.current = false;
        if (canvasRef.current && interactionRef.current.kind === "none") {
          canvasRef.current.style.cursor = toolRef.current === "hand" ? "grab" : "";
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Wheel needs a non-passive listener so we can stop the browser from zooming the page.
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const anchor = canvasPoint(e);
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const delta = Math.max(-50, Math.min(50, e.deltaY));
      zoomBy(Math.exp(-delta * 0.01), anchor);
      return;
    }
    const v = viewportRef.current;
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    setViewport({ ...v, scrollX: v.scrollX - dx / v.zoom, scrollY: v.scrollY - dy / v.zoom });
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => wheelHandlerRef.current(e);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // Stop Safari's own pinch-zoom gesture.
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", prevent);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("gesturestart", prevent);
    };
  }, []);

  // Paste: our own elements, Excalidraw clipboard JSON, or plain text.
  const pasteHandlerRef = useRef<(e: ClipboardEvent) => void>(() => {});
  pasteHandlerRef.current = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (editingRef.current || target.closest?.("input, textarea")) return;
    const text = e.clipboardData?.getData("text/plain") ?? "";
    e.preventDefault();
    if (!text) {
      pasteElements(clipboardRef.current);
      return;
    }
    try {
      const data = JSON.parse(text);
      if (data?.type === CLIPBOARD_TYPE || data?.type === "excalidraw/clipboard" || data?.type === "excalidraw") {
        pasteElements(restoreElements(data.elements));
        return;
      }
    } catch {
      /* not JSON, fall through to plain text */
    }
    const [x, y] = toScene(lastPointerRef.current);
    const el = refreshTextDimensions(newElement("text", x, y, styleRef.current, { text: text.replace(/\r\n?/g, "\n") }));
    setTool("selection");
    applyAndCommit([...elementsRef.current, el]);
    setSelected(new Set([el.id]));
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => pasteHandlerRef.current(e);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Drag-and-drop a .sketchboard / .excalidraw file onto the page to open it.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const { elements: els, viewBackground: bg } = await parseSceneFile(file);
      loadScene(els, bg);
    } catch {
      showToast("Only .sketchboard and .excalidraw files can be dropped here");
    }
  };

  // ----- Derived UI state
  const editingElement = editing ? elements.find((e) => e.id === editing.id) : undefined;
  const panelTypes = new Set<ElementType>(
    selectedElements.length
      ? selectedElements.map((e) => e.type)
      : isShapeTool(tool)
        ? [tool]
        : editingElement
          ? ["text"]
          : [],
  );
  const panelStyle: StyleProps = selectedElements[0]
    ? { ...style, ...pickStyle(selectedElements[0]) }
    : style;
  // On phones the panel would cover half the canvas, so only show it for a selection.
  const narrow = size.w < 760;
  const showPanel = panelTypes.size > 0 && (!narrow || selectedElements.length > 0 || !!editingElement);
  const zoomPct = Math.round(viewport.zoom * 100);

  useEffect(() => {
    // Keep the hover cursor in sync when switching tools from the toolbar.
    if (canvasRef.current && interactionRef.current.kind === "none") {
      canvasRef.current.style.cursor =
        tool === "hand" ? "grab" : tool === "selection" ? "" : tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";
    }
  }, [tool]);

  const textareaStyle: CSSProperties | undefined = editingElement
    ? (() => {
        const [left, top] = sceneToScreen([editingElement.x, editingElement.y], viewport);
        return {
          left,
          top,
          width: Math.max(editingElement.width, 10) * viewport.zoom + 4,
          height: editingElement.height * viewport.zoom,
          font: fontString(editingElement.fontSize * viewport.zoom, editingElement.fontFamily),
          lineHeight: LINE_HEIGHT,
          color: editingElement.strokeColor,
          textAlign: editingElement.textAlign,
          opacity: editingElement.opacity / 100,
          transform: `rotate(${editingElement.angle}rad)`,
        };
      })()
    : undefined;

  return (
    <div
      className={"app theme-" + theme}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="board"
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        // Stop the browser moving focus off a freshly opened text editor.
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      />

      {editingElement && (
        <textarea
          ref={textareaRef}
          className="text-editor"
          style={textareaStyle}
          value={editingElement.text ?? ""}
          spellCheck={false}
          wrap="off"
          onChange={(e) => {
            const value = e.target.value;
            replaceElement(editingElement.id, (el) => refreshTextDimensions(updateElement(el, { text: value })));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
              e.preventDefault();
              finishEditing();
            }
            e.stopPropagation();
          }}
          onBlur={finishEditing}
        />
      )}

      {/* Top-left: main menu */}
      <div className="top-left">
        <button
          type="button"
          className={"island icon-btn" + (menuOpen ? " active" : "")}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {Icons.menu}
        </button>
        {menuOpen && (
          <div className="island menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openFile(); }}>
              {Icons.open}<span>Open</span><kbd>Ctrl+O</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); saveFile(); }}>
              {Icons.save}<span>Save to file</span><kbd>Ctrl+S</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("export"); }}>
              {Icons.image}<span>Export image</span><kbd>Ctrl+Shift+E</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); resetCanvas(); }}>
              {Icons.clear}<span>Reset the canvas</span>
            </button>
            <hr />
            <button type="button" role="menuitem" onClick={() => setGridEnabled((g) => !g)}>
              {Icons.grid}<span>{gridEnabled ? "Hide grid" : "Show grid"}</span><kbd>Ctrl+'</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? Icons.sun : Icons.moon}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span><kbd>Alt+Shift+D</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog("help"); }}>
              {Icons.help}<span>Help</span><kbd>?</kbd>
            </button>
            <hr />
            <div className="menu-label">Canvas background</div>
            <div className="prop-row">
              {CANVAS_BACKGROUNDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Canvas background ${c}`}
                  className={"swatch" + (viewBackground === c ? " active" : "")}
                  style={{ background: c }}
                  onClick={() => setViewBackground(c)}
                />
              ))}
            </div>
          </div>
        )}
        {showPanel && !menuOpen && (
          <PropertiesPanel
            style={panelStyle}
            types={panelTypes}
            hasSelection={selectedElements.length > 0}
            canGroup={selectedElements.length > 1}
            canUngroup={selectedElements.some((e) => e.groupIds.length)}
            onChange={changeStyle}
            onLayer={reorder}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onGroup={group}
            onUngroup={ungroup}
          />
        )}
      </div>

      {/* Top-centre: tools */}
      <div className="toolbar-wrap">
        <div className="island toolbar" role="toolbar" aria-label="Tools">
          <button
            type="button"
            className={"tool lock" + (toolLocked ? " active" : "")}
            title="Keep selected tool active after drawing (Q)"
            aria-pressed={toolLocked}
            onClick={() => setToolLocked((l) => !l)}
          >
            {toolLocked ? Icons.lock : Icons.unlock}
          </button>
          <span className="toolbar-divider" />
          {TOOLS.map((t) => (
            <button
              key={t.type}
              type="button"
              className={"tool" + (tool === t.type ? " active" : "")}
              title={`${t.label} — ${t.key}`}
              aria-label={t.label}
              aria-pressed={tool === t.type}
              onClick={() => setTool(t.type)}
            >
              {Icons[t.type as keyof typeof Icons]}
              <span className="tool-key">{t.key}</span>
            </button>
          ))}
        </div>
        {tool !== "selection" && tool !== "hand" && (
          <div className="hint">
            {tool === "freedraw"
              ? "Click and drag to draw. Release when you're done."
              : tool === "text"
                ? "Click anywhere to add text. Esc to finish."
                : tool === "eraser"
                  ? "Drag over elements to erase them."
                  : tool === "line" || tool === "arrow"
                    ? "Drag to draw, or click to place points. Enter or Esc to finish."
                    : "Click and drag to draw. Hold Shift for a perfect shape."}
          </div>
        )}
      </div>

      {/* Bottom-left: zoom and history */}
      <div className="bottom-left">
        <div className="island group-btns">
          <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out (Ctrl -)" onClick={() => zoomBy(1 / 1.1)}>
            {Icons.minus}
          </button>
          <button
            type="button"
            className="zoom-label"
            title="Reset zoom (Ctrl 0)"
            onClick={() => setViewport(zoomAt(viewport, 1, [size.w / 2, size.h / 2]))}
          >
            {zoomPct}%
          </button>
          <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in (Ctrl +)" onClick={() => zoomBy(1.1)}>
            {Icons.plus}
          </button>
        </div>
        <div className="island group-btns">
          <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Ctrl Z)" onClick={undo}>
            {Icons.undo}
          </button>
          <button type="button" className="icon-btn" aria-label="Redo" title="Redo (Ctrl Shift Z)" onClick={redo}>
            {Icons.redo}
          </button>
        </div>
      </div>

      <div className="bottom-right">
        <button type="button" className="island icon-btn" aria-label="Help" title="Keyboard shortcuts (?)" onClick={() => setDialog("help")}>
          {Icons.help}
        </button>
      </div>

      {elements.length === 0 && !editing && (
        <div className="welcome" aria-hidden="true">
          <div className="welcome-title">Sketchboard</div>
          <p>Your drawings are saved in your browser.</p>
          <p>Pick a tool above and start drawing, or press <kbd>?</kbd> for shortcuts.</p>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {dialog === "export" && (
        <ExportDialog
          elements={elements}
          selected={selectedElements}
          viewBackground={viewBackground}
          onClose={() => setDialog(null)}
          onToast={showToast}
        />
      )}
      {dialog === "help" && <HelpDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

const pickStyle = (el: SketchElement): Partial<StyleProps> => ({
  strokeColor: el.strokeColor,
  backgroundColor: el.backgroundColor,
  fillStyle: el.fillStyle,
  strokeWidth: el.strokeWidth,
  strokeStyle: el.strokeStyle,
  roughness: el.roughness,
  opacity: el.opacity,
  roundness: el.roundness,
  fontSize: el.fontSize,
  fontFamily: el.fontFamily,
  textAlign: el.textAlign,
  ...(el.type === "arrow" ? { startArrowhead: el.startArrowhead, endArrowhead: el.endArrowhead } : {}),
});
