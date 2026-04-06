/**
 * Known Ivy enum values, extracted from the Ivy Framework C# source.
 *
 * Since the backend doesn't send prop type metadata to the frontend,
 * we maintain a static map of enum types → possible values.
 *
 * The key is the prop name (camelCase, as it appears in widget props).
 * Multiple prop names can map to the same enum.
 */

const Align = [
  "TopLeft", "TopRight", "TopCenter",
  "BottomLeft", "BottomCenter", "BottomRight",
  "Left", "Right", "Center",
  "Stretch", "SpaceBetween", "SpaceAround", "SpaceEvenly",
] as const;

const ButtonVariant = [
  "Primary", "Destructive", "Outline", "Secondary",
  "Success", "Warning", "Info", "Ghost", "Link", "Inline", "Ai",
] as const;

const BadgeVariant = [
  "Primary", "Destructive", "Outline", "Secondary",
  "Success", "Warning", "Info",
] as const;

const Orientation = ["Horizontal", "Vertical"] as const;

const BorderRadius = ["None", "Rounded", "Full"] as const;

const BorderStyle = ["None", "Solid", "Dashed", "Dotted"] as const;

const Overflow = ["Auto", "Clip", "Ellipsis", "Visible", "Scroll"] as const;

const TextAlignment = ["Left", "Center", "Right", "Justify"] as const;

const LinkTarget = ["Blank", "Self"] as const;

const Density = ["Small", "Medium", "Large"] as const;

const Scroll = ["None", "Horizontal", "Vertical", "Both"] as const;

const AutoFlow = ["Row", "Column", "RowDense", "ColumnDense"] as const;

const Visibility = ["Visible", "Hidden", "Collapsed"] as const;

const FontWeight = [
  "Thin", "ExtraLight", "Light", "Normal", "Medium",
  "SemiBold", "Bold", "ExtraBold", "Black",
] as const;

const TextOverflow = ["Clip", "Ellipsis", "Wrap"] as const;

const Cursor = [
  "Auto", "Default", "Pointer", "Wait", "Text",
  "Move", "NotAllowed", "Crosshair", "Grab", "Grabbing",
] as const;

const Position = ["Static", "Relative", "Absolute", "Fixed", "Sticky"] as const;

// ── Prop name → enum values mapping ────────────────────────────────────
// Multiple prop names can share the same enum (e.g. alignContent, iconPosition → Align)

const PROP_ENUM_MAP: Record<string, readonly string[]> = {
  // Align
  alignContent: Align,
  alignItems: Align,
  alignSelf: Align,
  justifyContent: Align,
  justifyItems: Align,
  justifySelf: Align,
  iconPosition: Align,
  textAlign: TextAlignment,
  textAlignment: TextAlignment,

  // Orientation
  orientation: Orientation,

  // Border
  borderRadius: BorderRadius,
  borderStyle: BorderStyle,

  // Overflow
  overflow: Overflow,
  overflowX: Overflow,
  overflowY: Overflow,

  // Variants
  variant: ButtonVariant, // Most common, overridden per widget below
  target: LinkTarget,

  // Density
  density: Density,
  scale: Density,

  // Scroll
  scroll: Scroll,

  // Grid
  autoFlow: AutoFlow,

  // Visibility
  visibility: Visibility,

  // Font
  fontWeight: FontWeight,

  // Text
  textOverflow: TextOverflow,

  // Cursor
  cursor: Cursor,

  // Position
  position: Position,
};

// Widget-specific overrides (widget type → prop name → enum values)
const WIDGET_ENUM_OVERRIDES: Record<string, Record<string, readonly string[]>> = {
  "Ivy.Badge": { variant: BadgeVariant },
  "Ivy.Button": { variant: ButtonVariant },
};

/**
 * Get the enum values for a given widget type and prop name.
 * Returns undefined if the prop isn't a known enum.
 */
export function getEnumValues(
  widgetType: string,
  propName: string,
  currentValue: unknown
): readonly string[] | undefined {
  // Check widget-specific overrides first
  const overrides = WIDGET_ENUM_OVERRIDES[widgetType];
  if (overrides?.[propName]) return overrides[propName];

  // Check the global map
  if (PROP_ENUM_MAP[propName]) return PROP_ENUM_MAP[propName];

  // Heuristic: if the current value is a PascalCase string that could be an enum,
  // check if it matches any known enum set
  if (typeof currentValue === "string" && /^[A-Z][a-zA-Z]+$/.test(currentValue)) {
    for (const values of Object.values(PROP_ENUM_MAP)) {
      if ((values as readonly string[]).includes(currentValue)) {
        return values;
      }
    }
  }

  return undefined;
}
