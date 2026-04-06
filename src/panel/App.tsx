import { Toolbar } from "./components/Toolbar";
import { WidgetDetails } from "./components/WidgetDetails";
import { useIvyDetection } from "./hooks/useIvyConnection";
import { usePanelStore } from "./store";

export function App() {
  useIvyDetection();

  const ivyStatus = usePanelStore((s) => s.ivyStatus);
  const selectedWidget = usePanelStore((s) => s.selectedWidget);
  const isIvy = ivyStatus?.isIvy ?? false;

  if (!isIvy) {
    return (
      <div className="panel">
        <div className="toolbar">
          <span className="toolbar__title">Ivy Dev Tools</span>
          <span className="badge badge--idle">No Ivy App</span>
        </div>
        <div className="content">
          <div className="not-ivy">
            <div className="not-ivy__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <div className="not-ivy__title">Not an Ivy Application</div>
            <div className="not-ivy__description">
              Navigate to a page running an Ivy application to use these tools.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <Toolbar />
      <div className="content">
        <div className="content__main">
          {selectedWidget ? (
            <WidgetDetails widget={selectedWidget} />
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon">
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.4">
                  <path d="M3 1L13.5 6.5L8.5 8.5L6.5 13.5L3 1Z" />
                </svg>
              </div>
              <div>Use the Inspect button to select an Ivy widget</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
