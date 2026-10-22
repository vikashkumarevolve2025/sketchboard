import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SketchElement } from "../types";
import { exportToCanvas, exportToSvg } from "../render";
import { downloadBlob } from "../storage";
import { Icons } from "./icons";

const Modal = ({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className={"modal island" + (wide ? " wide" : "")}
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            {Icons.close}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
};

export const ExportDialog = ({
  elements,
  selected,
  viewBackground,
  onClose,
  onToast,
}: {
  elements: readonly SketchElement[];
  selected: readonly SketchElement[];
  viewBackground: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) => {
  const [onlySelected, setOnlySelected] = useState(selected.length > 0);
  const [withBackground, setWithBackground] = useState(true);
  const [scale, setScale] = useState(2);
  const previewRef = useRef<HTMLDivElement>(null);
  const target = onlySelected && selected.length ? selected : elements;
  const background = withBackground ? viewBackground : null;

  const previewCanvas = useMemo(
    () => (target.length ? exportToCanvas(target, { background, scale: 1 }) : null),
    [target, background],
  );

  useEffect(() => {
    const host = previewRef.current;
    if (!host) return;
    host.innerHTML = "";
    if (previewCanvas) host.appendChild(previewCanvas);
  }, [previewCanvas]);

  const name = `sketch-${new Date().toISOString().slice(0, 10)}`;

  const pngBlob = () =>
    new Promise<Blob | null>((resolve) =>
      exportToCanvas(target, { background, scale }).toBlob(resolve, "image/png"),
    );

  const savePng = async () => {
    const blob = await pngBlob();
    if (blob) downloadBlob(blob, `${name}.png`);
  };

  const saveSvg = async () => {
    const svg = await exportToSvg(target, { background });
    downloadBlob(
      new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }),
      `${name}.svg`,
    );
  };

  const copyPng = async () => {
    try {
      const blob = await pngBlob();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      onToast("Copied PNG to clipboard");
    } catch {
      onToast("Your browser blocked clipboard access");
    }
  };

  return (
    <Modal title="Export image" onClose={onClose} wide>
      <div className="export-body">
        <div className="export-preview checkerboard" ref={previewRef}>
          {!target.length && <p className="muted">Nothing to export yet.</p>}
        </div>
        <div className="export-options">
          {selected.length > 0 && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
              />
              Only selected
            </label>
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={withBackground}
              onChange={(e) => setWithBackground(e.target.checked)}
            />
            Background
          </label>
          <div className="scale-row">
            Scale
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                className={"opt" + (scale === s ? " active" : "")}
                onClick={() => setScale(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="export-buttons">
            <button type="button" className="primary" disabled={!target.length} onClick={savePng}>
              PNG
            </button>
            <button type="button" className="primary" disabled={!target.length} onClick={saveSvg}>
              SVG
            </button>
            <button type="button" className="secondary" disabled={!target.length} onClick={copyPng}>
              Copy PNG
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Tools",
    [
      ["Hand (pan)", "H"],
      ["Selection", "V or 1"],
      ["Rectangle", "R or 2"],
      ["Diamond", "D or 3"],
      ["Ellipse", "O or 4"],
      ["Arrow", "A or 5"],
      ["Line", "L or 6"],
      ["Draw", "P or 7"],
      ["Text", "T or 8"],
      ["Eraser", "E or 0"],
      ["Keep tool active", "Q"],
    ],
  ],
  [
    "Canvas",
    [
      ["Pan", "Space + drag, wheel"],
      ["Zoom", "Ctrl + wheel, Ctrl + / -"],
      ["Reset zoom", "Ctrl + 0"],
      ["Zoom to fit", "Shift + 1"],
      ["Zoom to selection", "Shift + 2"],
      ["Toggle grid", "Ctrl + '"],
      ["Dark mode", "Alt + Shift + D"],
      ["Save to file", "Ctrl + S"],
      ["Open file", "Ctrl + O"],
      ["Export image", "Ctrl + Shift + E"],
    ],
  ],
  [
    "Editing",
    [
      ["Undo / Redo", "Ctrl + Z / Ctrl + Shift + Z"],
      ["Copy / Cut / Paste", "Ctrl + C / X / V"],
      ["Duplicate", "Ctrl + D, Alt + drag"],
      ["Select all", "Ctrl + A"],
      ["Delete", "Delete"],
      ["Group / Ungroup", "Ctrl + G / Ctrl + Shift + G"],
      ["Bring forward / to front", "Ctrl + ] / Ctrl + Shift + ]"],
      ["Send backward / to back", "Ctrl + [ / Ctrl + Shift + ["],
      ["Nudge", "Arrow keys (Shift for 10px)"],
      ["Constrain shape / angle", "Hold Shift"],
      ["Edit text", "Double-click or Enter"],
      ["Finish multi-point line", "Enter, Esc or double-click"],
    ],
  ],
];

export const HelpDialog = ({ onClose }: { onClose: () => void }) => (
  <Modal title="Keyboard shortcuts" onClose={onClose} wide>
    <div className="help-grid">
      {SHORTCUTS.map(([section, rows]) => (
        <section key={section}>
          <h3>{section}</h3>
          <dl>
            {rows.map(([label, keys]) => (
              <div key={label} className="help-row">
                <dt>{label}</dt>
                <dd>
                  <kbd>{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
    <p className="muted small">
      On a Mac, use ⌘ instead of Ctrl. Your drawing is saved in this browser automatically.
    </p>
  </Modal>
);
