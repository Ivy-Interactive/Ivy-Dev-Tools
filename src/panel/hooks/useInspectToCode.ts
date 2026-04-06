import { useState, useCallback, useRef, useEffect } from "react";
import { pageEval } from "../helpers/pageEval";
import {
  INJECT_WIDGET_PICKER,
  START_PICKER,
  STOP_PICKER,
  CHECK_RESULT,
  IS_ACTIVE,
  type PickerResult,
} from "../helpers/widgetPicker";

function openInVSCode(filePath: string, lineNumber?: number) {
  // Normalize backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, "/");
  let uri = `vscode://file/${normalized}`;
  if (lineNumber) uri += `:${lineNumber}`;

  // Open from the panel context — this reliably triggers protocol handlers
  window.open(uri);
}

export function useInspectToCode() {
  const [active, setActive] = useState(false);
  const [lastResult, setLastResult] = useState<PickerResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const start = useCallback(async () => {
    setLastResult(null);
    await pageEval(INJECT_WIDGET_PICKER);
    await pageEval(START_PICKER("vscode"));
    setActive(true);

    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const result = await pageEval<PickerResult | null>(CHECK_RESULT);
        if (result) {
          setLastResult(result);
          setActive(false);
          stopPolling();

          // Open VS Code from the panel context
          if (result.action === "vscode" && result.widget?.callSite?.filePath) {
            openInVSCode(
              result.widget.callSite.filePath,
              result.widget.callSite.lineNumber
            );
          }
          return;
        }
        const stillActive = await pageEval<boolean>(IS_ACTIVE);
        if (!stillActive) { setActive(false); stopPolling(); }
      } catch {
        setActive(false); stopPolling();
      }
    }, 200);
  }, [stopPolling]);

  const stop = useCallback(async () => {
    await pageEval(STOP_PICKER);
    setActive(false); stopPolling();
  }, [stopPolling]);

  const toggle = useCallback(() => {
    if (active) stop(); else start();
  }, [active, start, stop]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { active, toggle, lastResult };
}
