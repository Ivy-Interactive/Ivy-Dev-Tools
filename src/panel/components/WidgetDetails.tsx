import { useEffect, useState } from "react";
import type { PickerWidgetInfo } from "../helpers/widgetPicker";
import { EditablePropValue } from "./EditablePropValue";
import { openInVSCode, openInRider } from "../helpers/openInVSCode";
import { fetchWidgetById } from "../helpers/fetchWidgetById";
import { usePanelStore } from "../store";
import { getWidgetSchema, getWidgetProps, type WidgetSchemaRoot } from "../helpers/widgetSchema";

export function WidgetDetails({ widget }: { widget: PickerWidgetInfo }) {
  const setSelectedWidget = usePanelStore((s) => s.setSelectedWidget);
  const modifiedProps = usePanelStore((s) => s.modifiedProps);
  const shortType = widget.type.startsWith("Ivy.") ? widget.type.slice(4) : widget.type;
  const [schema, setSchema] = useState<WidgetSchemaRoot | null>(null);

  useEffect(() => {
    getWidgetSchema().then(setSchema);
  }, []);

  // Merge schema props with instance props
  const schemaProps = schema ? getWidgetProps(schema, widget.type) : null;
  const instanceProps = widget.props ?? {};

  // Build merged prop list: all schema props + any instance-only props
  const allPropKeys = new Set<string>();
  if (schemaProps) {
    for (const key of Object.keys(schemaProps)) allPropKeys.add(key);
  }
  for (const key of Object.keys(instanceProps)) allPropKeys.add(key);

  const sortedPropKeys = [...allPropKeys].sort();

  return (
    <div className="widget-details">
      <div className="widget-details__header">
        <span className="widget-details__type">{shortType}</span>
        <span className="widget-details__id mono">{widget.id}</span>
      </div>

      {/* Props */}
      {sortedPropKeys.length > 0 && (
        <section className="widget-details__section">
          <div className="widget-details__section-title">Props</div>
          <table className="table">
            <tbody>
              {sortedPropKeys.map((key) => {
                const hasValue = key in instanceProps;
                const value = hasValue ? instanceProps[key] : undefined;
                const propDef = schemaProps?.[key];
                const isDefault = !hasValue;
                const isModified = modifiedProps.has(`${widget.id}:${key}`);

                return (
                  <tr key={key} className={isDefault ? "prop-row--default" : ""}>
                    <td className="prop-key">{key.charAt(0).toUpperCase() + key.slice(1)}{isModified && "*"}</td>
                    <td className="mono">
                      <EditablePropValue
                        widgetId={widget.id}
                        propKey={key}
                        value={value}
                        propSchema={propDef}
                        isDefault={isDefault}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Events */}
      {(() => {
        const schemaEvents = schema ? schema.widgets[widget.type]?.events ?? [] : [];
        const instanceEvents = new Set(widget.events ?? []);
        const allEvents = new Set([...schemaEvents, ...instanceEvents]);
        if (allEvents.size === 0) return null;
        return (
          <section className="widget-details__section">
            <div className="widget-details__section-title">Events</div>
            <div className="event-list">
              {[...allEvents].map((evt) => (
                <span key={evt} className={`event-tag mono ${instanceEvents.has(evt) ? "" : "event-tag--muted"}`}>{evt}</span>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Source location */}
      {(() => {
        const cs = widget.callSite?.filePath ? widget.callSite : null;
        const parentCs = !cs && widget.parentCallSite?.filePath ? widget.parentCallSite : null;
        const effectiveCs = cs ?? parentCs;
        const parentType = parentCs ? (widget.parentCallSiteWidgetType?.startsWith("Ivy.") ? widget.parentCallSiteWidgetType.slice(4) : widget.parentCallSiteWidgetType) : null;

        return (
          <section className="widget-details__section">
            <div className="widget-details__section-title">Source Location</div>
            {parentCs && (
              <div className="toolbar__hint--warning" style={{ fontSize: "10px", marginBottom: "var(--spacing-xs)" }}>
                Warn: No call site for this widget. Showing parent <strong>{parentType}</strong> instead.
              </div>
            )}
            {effectiveCs ? (
              <>
                <div className="mono text-secondary" style={{ fontSize: "var(--font-size-mono)", wordBreak: "break-all" }}>
                  {effectiveCs.filePath}{effectiveCs.lineNumber != null ? `:${effectiveCs.lineNumber}` : ""}
                </div>
                <div style={{ display: "flex", gap: "var(--spacing-sm)", marginTop: "var(--spacing-sm)" }}>
                  <button
                    className="toolbar__button toolbar__button--vscode"
                    onClick={() => openInVSCode(effectiveCs.filePath!, effectiveCs.lineNumber)}
                    title="Open this file in VS Code"
                  >VS Code</button>
                  <button
                    className="toolbar__button toolbar__button--rider"
                    onClick={() => openInRider(effectiveCs.filePath!, effectiveCs.lineNumber)}
                    title="Open this file in Rider"
                  >Rider</button>
                </div>
              </>
            ) : (
              <div className="text-secondary">No call site data available</div>
            )}
          </section>
        );
      })()}

      {/* Ancestors */}
      {widget.ancestors.length > 0 && (
        <section className="widget-details__section">
          <div className="widget-details__section-title">Ancestors</div>
          <div className="widget-ancestors">
            {widget.ancestors.map((a, i) => {
              const aShort = a.type.startsWith("Ivy.") ? a.type.slice(4) : a.type;
              return (
                <div
                  key={a.id || i}
                  className="widget-ancestor widget-ancestor--clickable"
                  onClick={async () => {
                    const info = await fetchWidgetById(a.id);
                    if (info) setSelectedWidget(info);
                  }}
                  title="Click to inspect this widget"
                >
                  <span className="widget-ancestor__depth">{i + 1}</span>
                  <span className="widget-ancestor__type">{aShort}</span>
                  <span className="widget-ancestor__id mono">{a.id}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
