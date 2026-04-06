import { usePanelStore } from "../store";
import { useInspect } from "../hooks/useIvyConnection";

export function Toolbar() {
  const ivyStatus = usePanelStore((s) => s.ivyStatus);
  const tendrilDetected = usePanelStore((s) => s.tendrilDetected);
  const { inspecting, toggleInspect } = useInspect();

  const isIvy = ivyStatus?.isIvy ?? false;

  return (
    <div className="toolbar">
      <span className="toolbar__title">Ivy Dev Tools</span>
      {tendrilDetected && <span className="toolbar__hint" style={{ color: "var(--success-color, #22c55e)" }}>Tendril Detected</span>}

      <div className="toolbar__separator" />

      <button
        className={`toolbar__button ${inspecting ? "toolbar__button--active" : ""}`}
        onClick={toggleInspect}
        disabled={!isIvy}
        title="Select an Ivy widget to inspect (Esc to cancel)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 1L13.5 6.5L8.5 8.5L6.5 13.5L3 1Z" />
        </svg>
        <span style={{ marginLeft: 4 }}>
          {inspecting ? "Select Widget…" : "Select Widget"}
        </span>
      </button>
    </div>
  );
}
