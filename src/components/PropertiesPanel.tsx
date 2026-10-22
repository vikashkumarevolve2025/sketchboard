import type { ReactNode } from "react";
import type { Arrowhead, ElementType, StyleProps } from "../types";
import { Icons } from "./icons";

// Open Color palette (MIT) shades, similar in spirit to Excalidraw's defaults.
export const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
export const BACKGROUND_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];

interface Props {
  style: StyleProps;
  types: Set<ElementType>;
  hasSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  onChange: (patch: Partial<StyleProps>) => void;
  onLayer: (op: "front" | "forward" | "backward" | "back") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="prop-section">
    <legend>{title}</legend>
    <div className="prop-row">{children}</div>
  </fieldset>
);

function Option<T>({
  value,
  current,
  onSelect,
  title,
  children,
}: {
  value: NoInfer<T>;
  current: T;
  onSelect: (v: T) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={"opt" + (value === current ? " active" : "")}
      title={title}
      aria-pressed={value === current}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  );
}

const ColorPicker = ({
  colors,
  value,
  onSelect,
  label,
}: {
  colors: string[];
  value: string;
  onSelect: (c: string) => void;
  label: string;
}) => (
  <>
    {colors.map((c) => (
      <button
        key={c}
        type="button"
        title={c}
        aria-label={`${label} ${c}`}
        className={"swatch" + (c === value ? " active" : "") + (c === "transparent" ? " transparent" : "")}
        style={{ background: c === "transparent" ? undefined : c }}
        onClick={() => onSelect(c)}
      />
    ))}
    <span className="swatch-divider" />
    <label
      className={"swatch custom" + (colors.includes(value) ? "" : " active")}
      title="Custom colour"
      style={{ background: value === "transparent" ? undefined : value }}
    >
      <input
        type="color"
        value={value === "transparent" ? "#ffffff" : value}
        onChange={(e) => onSelect(e.target.value)}
      />
    </label>
  </>
);

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round">
    {children}
  </svg>
);

const ARROWHEADS: { value: Arrowhead; label: string; icon: ReactNode }[] = [
  { value: null, label: "None", icon: <Svg><path d="M3 10h14" strokeWidth={1.5} /></Svg> },
  { value: "arrow", label: "Arrow", icon: <Svg><path d="M3 10h14M12 5l5 5-5 5" strokeWidth={1.5} /></Svg> },
  { value: "triangle", label: "Triangle", icon: <Svg><path d="M3 10h10" strokeWidth={1.5} /><path d="M12 5l5 5-5 5z" fill="currentColor" /></Svg> },
  { value: "dot", label: "Dot", icon: <Svg><path d="M3 10h10" strokeWidth={1.5} /><circle cx="14" cy="10" r="3" fill="currentColor" /></Svg> },
  { value: "bar", label: "Bar", icon: <Svg><path d="M3 10h14M17 5v10" strokeWidth={1.5} /></Svg> },
];

export const PropertiesPanel = ({
  style,
  types,
  hasSelection,
  canGroup,
  canUngroup,
  onChange,
  onLayer,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
}: Props) => {
  const has = (...ts: ElementType[]) => ts.some((t) => types.has(t));
  const fillable = has("rectangle", "ellipse", "diamond");
  const strokeable = has("rectangle", "ellipse", "diamond", "line", "arrow", "freedraw");
  const roughShapes = has("rectangle", "ellipse", "diamond", "line", "arrow");

  return (
    <div className="island properties" onPointerDown={(e) => e.stopPropagation()}>
      <Section title="Stroke">
        <ColorPicker
          label="Stroke"
          colors={STROKE_COLORS}
          value={style.strokeColor}
          onSelect={(strokeColor) => onChange({ strokeColor })}
        />
      </Section>

      {fillable && (
        <Section title="Background">
          <ColorPicker
            label="Background"
            colors={BACKGROUND_COLORS}
            value={style.backgroundColor}
            onSelect={(backgroundColor) => onChange({ backgroundColor })}
          />
        </Section>
      )}

      {fillable && style.backgroundColor !== "transparent" && (
        <Section title="Fill">
          <Option value="hachure" current={style.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} title="Hachure">
            <Svg><rect x="3" y="3" width="14" height="14" rx="2" strokeWidth={1.25} /><path d="M3 11l8-8M5 17l12-12M11 17l6-6" strokeWidth={1.25} /></Svg>
          </Option>
          <Option value="cross-hatch" current={style.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} title="Cross-hatch">
            <Svg><rect x="3" y="3" width="14" height="14" rx="2" strokeWidth={1.25} /><path d="M3 11l8-8M5 17l12-12M11 17l6-6M9 3l8 8M3 5l12 12M3 11l6 6" strokeWidth={1.25} /></Svg>
          </Option>
          <Option value="solid" current={style.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} title="Solid">
            <Svg><rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" /></Svg>
          </Option>
        </Section>
      )}

      {strokeable && (
        <Section title="Stroke width">
          {[1, 2, 4].map((w) => (
            <Option key={w} value={w} current={style.strokeWidth} onSelect={(strokeWidth) => onChange({ strokeWidth })} title={["Thin", "Bold", "Extra bold"][[1, 2, 4].indexOf(w)]}>
              <Svg><path d="M3 10h14" strokeWidth={w * 1.25} /></Svg>
            </Option>
          ))}
        </Section>
      )}

      {roughShapes && (
        <Section title="Stroke style">
          <Option value="solid" current={style.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} title="Solid">
            <Svg><path d="M3 10h14" strokeWidth={2} /></Svg>
          </Option>
          <Option value="dashed" current={style.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} title="Dashed">
            <Svg><path d="M3 10h14" strokeWidth={2} strokeDasharray="4 3" /></Svg>
          </Option>
          <Option value="dotted" current={style.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} title="Dotted">
            <Svg><path d="M3 10h14" strokeWidth={2} strokeDasharray="0.5 4" /></Svg>
          </Option>
        </Section>
      )}

      {roughShapes && (
        <Section title="Sloppiness">
          <Option value={0} current={style.roughness} onSelect={(roughness) => onChange({ roughness })} title="Architect">
            <Svg><path d="M3 14c4-6 10-6 14-8" strokeWidth={1.5} /></Svg>
          </Option>
          <Option value={1} current={style.roughness} onSelect={(roughness) => onChange({ roughness })} title="Artist">
            <Svg><path d="M3 14c4-6 10-6 14-8M3 15c5-7 9-6 14-9" strokeWidth={1.25} /></Svg>
          </Option>
          <Option value={2} current={style.roughness} onSelect={(roughness) => onChange({ roughness })} title="Cartoonist">
            <Svg><path d="M3 14c2-1 3-5 6-6s5 1 8-3M3 16c3-3 4-6 7-6s4-1 7-5" strokeWidth={1.25} /></Svg>
          </Option>
        </Section>
      )}

      {has("rectangle", "diamond", "line", "arrow") && (
        <Section title="Edges">
          <Option value="sharp" current={style.roundness} onSelect={(roundness) => onChange({ roundness })} title="Sharp">
            <Svg><path d="M4 16V4h12" strokeWidth={1.5} /></Svg>
          </Option>
          <Option value="round" current={style.roundness} onSelect={(roundness) => onChange({ roundness })} title="Round">
            <Svg><path d="M4 16V9a5 5 0 0 1 5-5h7" strokeWidth={1.5} /></Svg>
          </Option>
        </Section>
      )}

      {has("arrow") && (
        <Section title="Arrowheads">
          <select
            aria-label="Start arrowhead"
            value={style.startArrowhead ?? ""}
            onChange={(e) => onChange({ startArrowhead: (e.target.value || null) as Arrowhead })}
          >
            {ARROWHEADS.map((a) => (
              <option key={a.label} value={a.value ?? ""}>Start: {a.label}</option>
            ))}
          </select>
          <select
            aria-label="End arrowhead"
            value={style.endArrowhead ?? ""}
            onChange={(e) => onChange({ endArrowhead: (e.target.value || null) as Arrowhead })}
          >
            {ARROWHEADS.map((a) => (
              <option key={a.label} value={a.value ?? ""}>End: {a.label}</option>
            ))}
          </select>
        </Section>
      )}

      {has("text") && (
        <>
          <Section title="Font size">
            {([16, 20, 28, 36] as const).map((s, i) => (
              <Option key={s} value={s} current={style.fontSize} onSelect={(fontSize) => onChange({ fontSize })} title={["Small", "Medium", "Large", "Very large"][i]}>
                <span className="opt-label">{["S", "M", "L", "XL"][i]}</span>
              </Option>
            ))}
          </Section>
          <Section title="Font family">
            <Option value={1} current={style.fontFamily} onSelect={(fontFamily) => onChange({ fontFamily })} title="Hand-drawn">
              <span className="opt-label" style={{ fontFamily: "Virgil" }}>Aa</span>
            </Option>
            <Option value={2} current={style.fontFamily} onSelect={(fontFamily) => onChange({ fontFamily })} title="Normal">
              <span className="opt-label" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>Aa</span>
            </Option>
            <Option value={3} current={style.fontFamily} onSelect={(fontFamily) => onChange({ fontFamily })} title="Code">
              <span className="opt-label" style={{ fontFamily: "Cascadia, monospace" }}>{"</>"}</span>
            </Option>
          </Section>
          <Section title="Text align">
            {(["left", "center", "right"] as const).map((a) => (
              <Option key={a} value={a} current={style.textAlign} onSelect={(textAlign) => onChange({ textAlign })} title={a[0].toUpperCase() + a.slice(1)}>
                <Svg>
                  <path
                    d={a === "left" ? "M3 5h14M3 10h9M3 15h12" : a === "center" ? "M3 5h14M5.5 10h9M4 15h12" : "M3 5h14M8 10h9M5 15h12"}
                    strokeWidth={1.5}
                  />
                </Svg>
              </Option>
            ))}
          </Section>
        </>
      )}

      <Section title="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={style.opacity}
          aria-label="Opacity"
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </Section>

      {hasSelection && (
        <>
          <Section title="Layers">
            <button type="button" className="opt" title="Send to back (Ctrl+Shift+[)" onClick={() => onLayer("back")}>{Icons.sendBack}</button>
            <button type="button" className="opt" title="Send backward (Ctrl+[)" onClick={() => onLayer("backward")}>{Icons.sendBackward}</button>
            <button type="button" className="opt" title="Bring forward (Ctrl+])" onClick={() => onLayer("forward")}>{Icons.bringForward}</button>
            <button type="button" className="opt" title="Bring to front (Ctrl+Shift+])" onClick={() => onLayer("front")}>{Icons.bringFront}</button>
          </Section>
          <Section title="Actions">
            <button type="button" className="opt" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>{Icons.duplicate}</button>
            <button type="button" className="opt" title="Delete (Del)" onClick={onDelete}>{Icons.trash}</button>
            {canGroup && (
              <button type="button" className="opt" title="Group (Ctrl+G)" onClick={onGroup}>{Icons.group}</button>
            )}
            {canUngroup && (
              <button type="button" className="opt" title="Ungroup (Ctrl+Shift+G)" onClick={onUngroup}>{Icons.ungroup}</button>
            )}
          </Section>
        </>
      )}
    </div>
  );
};
