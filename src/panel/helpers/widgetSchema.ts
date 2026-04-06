import { pageEval } from "./pageEval";

export interface PropSchema {
  type?: string;
  $ref?: string;
  default?: unknown;
  nullable?: boolean;
  enum?: string[];
  items?: PropSchema;
  properties?: Record<string, PropSchema>;
  description?: string;
}

export interface WidgetSchema {
  type: "object";
  properties: Record<string, PropSchema>;
  events?: string[];
}

export interface WidgetSchemaRoot {
  widgets: Record<string, WidgetSchema>;
  $defs?: Record<string, PropSchema>;
}

let cachedSchema: WidgetSchemaRoot | null = null;

/**
 * Fetch the widget schema from the running Ivy app.
 * Caches the result for the lifetime of the panel.
 */
export async function getWidgetSchema(): Promise<WidgetSchemaRoot | null> {
  if (cachedSchema) return cachedSchema;

  try {
    // Get the origin of the inspected page
    const origin = await pageEval<string>("window.location.origin");
    const resp = await fetch(`${origin}/ivy/dev-tools/widget-schema`);
    if (!resp.ok) return null;
    cachedSchema = await resp.json();
    return cachedSchema;
  } catch {
    return null;
  }
}

/**
 * Reset the cached schema (e.g., on page reload).
 */
export function resetSchemaCache() {
  cachedSchema = null;
}

/**
 * Resolve a $ref to its definition.
 */
export function resolveRef(schema: WidgetSchemaRoot, ref: string): PropSchema | null {
  // Format: "#/$defs/TypeName"
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  if (!match || !schema.$defs) return null;
  return schema.$defs[match[1]] ?? null;
}

/**
 * Get the full prop schema for a widget type, including resolved refs.
 */
export function getWidgetProps(schema: WidgetSchemaRoot, widgetType: string): Record<string, ResolvedProp> | null {
  const widgetDef = schema.widgets[widgetType];
  if (!widgetDef?.properties) return null;

  const result: Record<string, ResolvedProp> = {};
  for (const [key, propSchema] of Object.entries(widgetDef.properties)) {
    result[key] = resolveProp(schema, propSchema);
  }
  return result;
}

export interface ResolvedProp {
  type: string;
  default?: unknown;
  nullable?: boolean;
  enum?: string[];
  description?: string;
  items?: ResolvedProp;
  properties?: Record<string, ResolvedProp>;
}

function resolveProp(schema: WidgetSchemaRoot, prop: PropSchema, seen?: Set<string>): ResolvedProp {
  // Follow $ref with cycle detection
  if (prop.$ref) {
    if (seen?.has(prop.$ref)) {
      // Circular reference — stop recursing
      return { type: "object", default: prop.default, nullable: prop.nullable };
    }
    const resolved = resolveRef(schema, prop.$ref);
    if (resolved) {
      const nextSeen = new Set(seen);
      nextSeen.add(prop.$ref);
      const result = {
        ...resolveProp(schema, resolved, nextSeen),
        default: prop.default ?? resolved.default,
      };
      if (prop.nullable) result.nullable = true;
      return result;
    }
  }

  const result: ResolvedProp = {
    type: prop.type ?? "unknown",
    default: prop.default,
    nullable: prop.nullable,
    description: prop.description,
  };

  if (prop.enum) {
    result.type = "enum";
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = resolveProp(schema, prop.items, seen);
  }

  if (prop.properties) {
    result.properties = {};
    for (const [k, v] of Object.entries(prop.properties)) {
      result.properties[k] = resolveProp(schema, v, seen);
    }
  }

  return result;
}
