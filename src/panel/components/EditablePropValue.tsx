import { useState, useRef, useCallback, useEffect } from "react";
import { setWidgetProp } from "../helpers/widgetEdit";
import { usePanelStore } from "../store";
import type { ResolvedProp } from "../helpers/widgetSchema";

const COLOR_MAP: Record<string, string> = {
  Black: "#000000", White: "#ffffff",
  Slate: "#64748b", Gray: "#6b7280", Zinc: "#71717a", Neutral: "#737373", Stone: "#78716c",
  Red: "#ef4444", Orange: "#f97316", Amber: "#f59e0b", Yellow: "#eab308",
  Lime: "#84cc16", Green: "#22c55e", Emerald: "#10b981", Teal: "#14b8a6",
  Cyan: "#06b6d4", Sky: "#0ea5e9", Blue: "#3b82f6", Indigo: "#6366f1",
  Violet: "#8b5cf6", Purple: "#a855f7", Fuchsia: "#d946ef", Pink: "#ec4899", Rose: "#f43f5e",
  Primary: "var(--selection-color)", Secondary: "#6b7280", Destructive: "#ef4444",
  Success: "#22c55e", Warning: "#f59e0b", Info: "#3b82f6", Muted: "#9ca3af",
  IvyGreen: "#16a34a",
};

function ColorSwatch({ color }: { color: string }) {
  const css = COLOR_MAP[color];
  if (!css) return null;
  return (
    <span
      className="color-swatch"
      style={{ background: css, borderColor: color === "White" ? "#ccc" : css }}
    />
  );
}

function isColorsEnum(values: string[]): boolean {
  return values.includes("Slate") && values.includes("Fuchsia") && values.includes("IvyGreen");
}

interface Props {
  widgetId: string;
  propKey: string;
  value: unknown;
  propSchema?: ResolvedProp;
  isDefault?: boolean;
}

/**
 * Always-editable prop value (VB property grid style).
 * Uses schema for enum detection and default value display.
 */
export function EditablePropValue({ widgetId, propKey, value, propSchema, isDefault }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedWidget = usePanelStore((s) => s.selectedWidget);
  const setSelectedWidget = usePanelStore((s) => s.setSelectedWidget);
  const markPropModified = usePanelStore((s) => s.markPropModified);

  // Use schema enum values if available, otherwise fall back to heuristic
  const enumValues = propSchema?.enum ?? null;
  const isEnum = !!enumValues;

  const displayValue = isDefault ? propSchema?.default : value;
  const isEditable = isEnum || typeof displayValue !== "object" || displayValue === null || displayValue === undefined;

  const [localValue, setLocalValue] = useState(() => formatForEdit(displayValue));
  const [saving, setSaving] = useState(false);

  // Sync local value when the prop changes externally
  useEffect(() => {
    setLocalValue(formatForEdit(isDefault ? propSchema?.default : value));
  }, [value, isDefault, propSchema]);

  const commit = useCallback(async (val: string) => {
    if (val === formatForEdit(displayValue)) return;
    setSaving(true);
    const result = await setWidgetProp(widgetId, propKey, val);
    setSaving(false);

    if (result.ok && selectedWidget) {
      const newProps = { ...selectedWidget.props, [propKey]: parseDisplay(val) };
      setSelectedWidget({ ...selectedWidget, props: newProps });
      markPropModified(widgetId, propKey);
    }
  }, [widgetId, propKey, displayValue, selectedWidget, setSelectedWidget, markPropModified]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(localValue);
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setLocalValue(formatForEdit(displayValue));
      (e.target as HTMLElement).blur();
    }
  }, [commit, localValue, displayValue]);

  // Align → Figma-style visual grid
  const isAlignEnum = isEnum && isAlignEnumValues(enumValues);
  if (isAlignEnum) {
    const currentStr = formatForEdit(displayValue);
    return (
      <AlignControl
        value={currentStr}
        nullable={propSchema?.nullable ?? false}
        isDefault={isDefault ?? false}
        saving={saving}
        onCommit={(val) => { setLocalValue(val); commit(val); }}
      />
    );
  }

  // Size → type + value + optional min/max (only when NOT an enum)
  const isSizeProp = !isEnum && (propSchema?.description?.includes("Flexible sizing") ||
    (typeof displayValue === "string" && /^[A-Z][a-zA-Z]+(:\d|,|$)/.test(displayValue)));
  if (isSizeProp) {
    return (
      <SizeEditor
        value={typeof displayValue === "string" ? displayValue : null}
        nullable={propSchema?.nullable ?? true}
        isDefault={isDefault ?? false}
        saving={saving}
        onCommit={commit}
      />
    );
  }

  // Thickness → 4-field editor (left, top, right, bottom) (only when NOT an enum)
  const isThickness = !isEnum && (propSchema?.description?.includes("Thickness") ||
    (typeof displayValue === "string" && /^\d+,\d+,\d+,\d+$/.test(displayValue)));
  if (isThickness) {
    return (
      <ThicknessEditor
        value={typeof displayValue === "string" ? displayValue : null}
        nullable={propSchema?.nullable ?? false}
        isDefault={isDefault ?? false}
        saving={saving}
        onCommit={commit}
      />
    );
  }

  // Boolean → checkbox (non-nullable) or select (nullable)
  const isBool = typeof displayValue === "boolean" || propSchema?.type === "boolean";
  const isNullableBool = isBool && (propSchema?.nullable || displayValue === null || displayValue === undefined);
  if (isBool) {
    if (isNullableBool) {
      const currentStr = displayValue == null ? "null" : String(displayValue);
      return (
        <select
          className={`prop-grid-select mono prop-bool ${isDefault ? "prop-value--default" : ""}`}
          value={currentStr}
          onChange={(e) => {
            const val = e.target.value;
            setLocalValue(val);
            commit(val);
          }}
          disabled={saving}
        >
          <option value="true">true</option>
          <option value="false">false</option>
          <option value="null">null</option>
        </select>
      );
    }
    const checked = displayValue === true;
    return (
      <label className={`prop-grid-checkbox ${isDefault ? "prop-value--default" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            const val = String(e.target.checked);
            setLocalValue(val);
            commit(val);
          }}
          disabled={saving}
        />
        <span className="prop-bool">{String(checked)}</span>
      </label>
    );
  }

  // Enum → searchable combobox for large enums, simple select for small
  if (isEnum) {
    const currentStr = formatForEdit(displayValue);
    const isLargeEnum = enumValues.length > 20;

    if (isLargeEnum) {
      const isColors = isColorsEnum(enumValues);
      return (
        <SearchableEnum
          values={enumValues}
          current={currentStr}
          nullable={propSchema?.nullable ?? false}
          isDefault={isDefault ?? false}
          saving={saving}
          onCommit={(val) => { setLocalValue(val); commit(val); }}
          renderItem={isColors ? (v) => (<><ColorSwatch color={v} />{v}</>) : undefined}
        />
      );
    }

    return (
      <select
        className={`prop-grid-select mono ${isDefault ? "prop-value--default" : ""}`}
        value={currentStr}
        onChange={(e) => {
          const val = e.target.value;
          setLocalValue(val);
          commit(val);
        }}
        disabled={saving}
      >
        {propSchema?.nullable && <option value="null">null</option>}
        {enumValues.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
        {currentStr !== "null" && !enumValues.includes(currentStr) && (
          <option value={currentStr}>{currentStr}</option>
        )}
      </select>
    );
  }

  // Non-editable (objects, arrays, functions) → read-only display
  if (!isEditable) {
    return (
      <span className={`prop-grid-readonly ${isDefault ? "prop-value--default" : ""}`}>
        <PropValueDisplay value={displayValue} />
      </span>
    );
  }

  // Editable primitive → always an <input>
  return (
    <input
      ref={inputRef}
      className={`prop-grid-input mono ${propColorClass(displayValue)} ${isDefault ? "prop-value--default" : ""}`}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => commit(localValue)}
      disabled={saving}
      spellCheck={false}
      placeholder={isDefault && propSchema?.type ? `(${propSchema.type})` : undefined}
    />
  );
}

function SearchableEnum({
  values,
  current,
  nullable,
  isDefault,
  saving,
  onCommit,
  renderItem,
}: {
  values: string[];
  current: string;
  nullable: boolean;
  isDefault: boolean;
  saving: boolean;
  onCommit: (val: string) => void;
  renderItem?: (value: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // -1 = null option (when nullable), 0+ = filtered enum items
  const [highlightIndex, setHighlightIndex] = useState(0);

  const filtered = search
    ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : values;

  const minIndex = nullable ? -1 : 0;

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    // Account for null option: DOM child 0 = null (if nullable), then filtered items
    const domIndex = nullable ? highlightIndex + 1 : highlightIndex;
    const item = listRef.current.children[domIndex] as HTMLElement | undefined;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open, nullable]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (val: string) => {
    onCommit(val);
    setOpen(false);
    setSearch("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const maxIndex = Math.min(filtered.length, 100) - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, maxIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, minIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex === -1) select("null");
      else if (filtered[highlightIndex]) select(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setSearch("");
    }
  };

  const render = renderItem ?? ((v: string) => v);

  const openDropdown = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  if (!open) {
    return (
      <button
        className={`enum-search__trigger mono ${isDefault ? "prop-value--default" : ""}`}
        onClick={openDropdown}
        disabled={saving}
      >
        {current ? render(current) : <span className="prop-null">null</span>}
        <span className="prop-enum-indicator">&#9662;</span>
      </button>
    );
  }

  return (
    <div className="enum-search" ref={containerRef}>
      <input
        ref={inputRef}
        className="enum-search__input mono"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        spellCheck={false}
      />
      <div className="enum-search__list" ref={listRef}>
        {nullable && (
          <div
            className={`enum-search__item mono prop-null ${highlightIndex === -1 ? "enum-search__item--active" : ""}`}
            onMouseDown={() => select("null")}
            onMouseEnter={() => setHighlightIndex(-1)}
          >
            null
          </div>
        )}
        {filtered.slice(0, 100).map((v, i) => (
          <div
            key={v}
            className={`enum-search__item mono ${v === current ? "enum-search__item--selected" : ""} ${i === highlightIndex ? "enum-search__item--active" : ""}`}
            onMouseDown={() => select(v)}
            onMouseEnter={() => setHighlightIndex(i)}
          >
            {render(v)}
          </div>
        ))}
        {filtered.length > 100 && (
          <div className="enum-search__item mono prop-null">
            …{filtered.length - 100} more
          </div>
        )}
        {filtered.length === 0 && (
          <div className="enum-search__item mono prop-null">No matches</div>
        )}
      </div>
    </div>
  );
}

function isAlignEnumValues(values: string[]): boolean {
  return values.includes("TopLeft") && values.includes("Center") && values.includes("BottomRight");
}

// Position grid cells: [row][col] → value
const ALIGN_GRID: (string | null)[][] = [
  ["TopLeft",    "TopCenter",    "TopRight"],
  ["Left",       "Center",       "Right"],
  ["BottomLeft", "BottomCenter", "BottomRight"],
];

const ALIGN_DISTRIBUTION: { value: string; label: string }[] = [
  { value: "Stretch", label: "Stretch" },
  { value: "SpaceBetween", label: "Space Between" },
  { value: "SpaceAround", label: "Space Around" },
  { value: "SpaceEvenly", label: "Space Evenly" },
];

function DistIcon({ type }: { type: string }) {
  const s = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: 1.3 };
  switch (type) {
    case "Stretch": return (
      <svg {...s}><line x1="1" y1="1" x2="1" y2="13" /><line x1="13" y1="1" x2="13" y2="13" /><rect x="4" y="3" width="6" height="8" rx="0.5" /></svg>
    );
    case "SpaceBetween": return (
      <svg {...s}><line x1="1" y1="1" x2="1" y2="13" /><line x1="13" y1="1" x2="13" y2="13" /><rect x="2.5" y="4" width="3" height="6" rx="0.5" /><rect x="8.5" y="4" width="3" height="6" rx="0.5" /></svg>
    );
    case "SpaceAround": return (
      <svg {...s}><rect x="1.5" y="4" width="3" height="6" rx="0.5" /><rect x="9.5" y="4" width="3" height="6" rx="0.5" /></svg>
    );
    case "SpaceEvenly": return (
      <svg {...s}><rect x="1" y="4" width="3" height="6" rx="0.5" /><rect x="5.5" y="4" width="3" height="6" rx="0.5" /><rect x="10" y="4" width="3" height="6" rx="0.5" /></svg>
    );
    default: return null;
  }
}

function AlignControl({
  value,
  nullable,
  isDefault,
  saving,
  onCommit,
}: {
  value: string;
  nullable: boolean;
  isDefault: boolean;
  saving: boolean;
  onCommit: (val: string) => void;
}) {
  return (
    <div className={`align-control ${isDefault ? "prop-value--default" : ""}`}>
      {/* 3x3 position grid */}
      <div className="align-grid">
        {ALIGN_GRID.map((row, ri) =>
          row.map((cell, ci) => (
            <button
              key={`${ri}-${ci}`}
              className={`align-grid__cell ${cell === value ? "align-grid__cell--active" : ""}`}
              onClick={() => cell && onCommit(cell)}
              disabled={saving || !cell}
              title={cell ?? ""}
            >
              <span className="align-grid__dot" />
            </button>
          ))
        )}
      </div>

      {/* Distribution buttons */}
      <div className="align-dist">
        {ALIGN_DISTRIBUTION.map((d) => (
          <button
            key={d.value}
            className={`align-dist__btn ${d.value === value ? "align-dist__btn--active" : ""}`}
            onClick={() => onCommit(d.value)}
            disabled={saving}
            title={d.label}
          >
            <DistIcon type={d.value} />
          </button>
        ))}
      </div>

      {/* Current value label */}
      <span className="align-control__label mono">{value || "null"}</span>

      {nullable && value && (
        <button
          className="thickness-editor__clear-btn"
          onClick={() => onCommit("null")}
          title="Clear to null"
        >&times;</button>
      )}
    </div>
  );
}

// Size types that require a numeric value
const SIZE_VALUE_TYPES = new Set(["Px", "Rem", "Units", "Fraction", "Grow", "Shrink"]);
const SIZE_ALL_TYPES = ["Px", "Rem", "Units", "Fraction", "Full", "Fit", "Screen", "MinContent", "MaxContent", "Auto", "Grow", "Shrink"];

interface ParsedSize {
  type: string;
  value: string;
}

function parseSize(s: string): ParsedSize {
  const [type, ...rest] = s.split(":");
  return { type, value: rest.join(":") || "" };
}

function formatSize(type: string, value: string): string {
  if (!SIZE_VALUE_TYPES.has(type) || !value) return type;
  return `${type}:${value}`;
}

function parseSizeFull(raw: string): { main: ParsedSize; min: ParsedSize | null; max: ParsedSize | null } {
  const parts = raw.split(",");
  const main = parseSize(parts[0] || "Auto");
  const min = parts[1] ? parseSize(parts[1]) : null;
  const max = parts[2] ? parseSize(parts[2]) : null;
  return { main, min, max };
}

function serializeSizeFull(main: ParsedSize, min: ParsedSize | null, max: ParsedSize | null): string {
  let s = formatSize(main.type, main.value);
  if (min || max) {
    s += "," + (min ? formatSize(min.type, min.value) : "");
    if (max) {
      s += "," + formatSize(max.type, max.value);
    }
  }
  return s;
}

function SizePartEditor({
  label,
  parsed,
  onChange,
  onClear,
  saving,
}: {
  label?: string;
  parsed: ParsedSize;
  onChange: (p: ParsedSize) => void;
  onClear?: () => void;
  saving: boolean;
}) {
  const needsValue = SIZE_VALUE_TYPES.has(parsed.type);
  return (
    <div className="size-part">
      {label && <span className="size-part__label">{label}</span>}
      <select
        className="size-part__type mono"
        value={parsed.type}
        onChange={(e) => onChange({ type: e.target.value, value: needsValue ? parsed.value : "" })}
        disabled={saving}
      >
        {SIZE_ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {needsValue && (
        <input
          type="number"
          className="size-part__value mono"
          value={parsed.value}
          onChange={(e) => onChange({ ...parsed, value: e.target.value })}
          disabled={saving}
          step={parsed.type === "Fraction" ? "0.01" : "1"}
        />
      )}
      {onClear && (
        <button className="thickness-editor__clear-btn" onClick={onClear} title="Remove">&times;</button>
      )}
    </div>
  );
}

function SizeEditor({
  value,
  nullable,
  isDefault,
  saving,
  onCommit,
}: {
  value: string | null;
  nullable: boolean;
  isDefault: boolean;
  saving: boolean;
  onCommit: (val: string) => void;
}) {
  if (value === null || value === undefined || value === "") {
    if (nullable) {
      return (
        <div className={`size-editor ${isDefault ? "prop-value--default" : ""}`}>
          <span className="prop-null">null</span>
          <button className="thickness-editor__set-btn" onClick={() => onCommit("Auto")} title="Set value">Set</button>
        </div>
      );
    }
    return <span className="prop-null">null</span>;
  }

  const { main, min, max } = parseSizeFull(value);

  const update = (newMain: ParsedSize, newMin: ParsedSize | null, newMax: ParsedSize | null) => {
    onCommit(serializeSizeFull(newMain, newMin, newMax));
  };

  return (
    <div className={`size-editor ${isDefault ? "prop-value--default" : ""}`}>
      <SizePartEditor
        parsed={main}
        onChange={(p) => update(p, min, max)}
        saving={saving}
      />
      {(min || max) && (
        <div className="size-editor__constraints">
          {min && (
            <SizePartEditor
              label="Min"
              parsed={min}
              onChange={(p) => update(main, p, max)}
              onClear={() => update(main, null, max)}
              saving={saving}
            />
          )}
          {max && (
            <SizePartEditor
              label="Max"
              parsed={max}
              onChange={(p) => update(main, min, p)}
              onClear={() => update(main, min, null)}
              saving={saving}
            />
          )}
        </div>
      )}
      {!min && (
        <button
          className="size-editor__add-btn"
          onClick={() => update(main, { type: "Px", value: "0" }, max)}
          title="Add min constraint"
        >+Min</button>
      )}
      {!max && (
        <button
          className="size-editor__add-btn"
          onClick={() => update(main, min, { type: "Px", value: "0" })}
          title="Add max constraint"
        >+Max</button>
      )}
      {nullable && (
        <button className="thickness-editor__clear-btn" onClick={() => onCommit("null")} title="Clear to null">&times;</button>
      )}
    </div>
  );
}

function ThicknessEditor({
  value,
  nullable,
  isDefault,
  saving,
  onCommit,
}: {
  value: string | null;
  nullable: boolean;
  isDefault: boolean;
  saving: boolean;
  onCommit: (val: string) => void;
}) {
  const parts = value ? value.split(",").map(Number) : [0, 0, 0, 0];
  const [left, top, right, bottom] = parts.length === 4 ? parts : [0, 0, 0, 0];
  const isNull = value === null || value === undefined;
  const labels = ["L", "T", "R", "B"] as const;
  const values = [left, top, right, bottom];

  const update = (index: number, newVal: number) => {
    const next = [...values];
    next[index] = isNaN(newVal) ? 0 : newVal;
    onCommit(next.join(","));
  };

  if (isNull && nullable) {
    return (
      <div className={`thickness-editor ${isDefault ? "prop-value--default" : ""}`}>
        <span className="prop-null">null</span>
        <button
          className="thickness-editor__set-btn"
          onClick={() => onCommit("0,0,0,0")}
          title="Set value"
        >
          Set
        </button>
      </div>
    );
  }

  return (
    <div className={`thickness-editor ${isDefault ? "prop-value--default" : ""}`}>
      {labels.map((label, i) => (
        <div key={label} className="thickness-editor__field">
          <span className="thickness-editor__label">{label}</span>
          <input
            type="number"
            className="thickness-editor__input mono"
            value={values[i]}
            onChange={(e) => update(i, parseInt(e.target.value, 10))}
            disabled={saving}
          />
        </div>
      ))}
      {nullable && (
        <button
          className="thickness-editor__clear-btn"
          onClick={() => onCommit("null")}
          title="Clear to null"
        >
          &times;
        </button>
      )}
    </div>
  );
}

function PropValueDisplay({ value }: { value: unknown }) {
  if (value === null) return <span className="prop-null">null</span>;
  if (value === undefined) return <span className="prop-null">undefined</span>;
  if (typeof value === "string") {
    if (value === "[function]") return <span className="prop-fn">ƒ()</span>;
    if (value.startsWith("[") && value.endsWith("]")) return <span className="prop-ref">{value}</span>;
    return <span className="prop-string">"{value}"</span>;
  }
  if (Array.isArray(value)) return <span className="prop-ref">[{value.length} items]</span>;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return <span className="prop-ref">{`{${entries.length} keys}`}</span>;
  }
  return <span>{String(value)}</span>;
}

function propColorClass(value: unknown): string {
  if (value === null || value === undefined) return "prop-null";
  if (typeof value === "boolean") return "prop-bool";
  if (typeof value === "number") return "prop-number";
  if (typeof value === "string") {
    if (value === "[function]") return "prop-fn";
    return "prop-string";
  }
  return "";
}

function formatForEdit(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function parseDisplay(raw: string): unknown {
  const t = raw.trim();
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return raw;
}
