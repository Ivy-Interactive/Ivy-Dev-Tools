import { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IvyDetectionResult } from "@shared/types";
import { usePanelStore } from "../store";
import { pageEval } from "../helpers/pageEval";
import {
  INJECT_WIDGET_PICKER,
  START_PICKER,
  STOP_PICKER,
  CHECK_RESULT,
  IS_ACTIVE,
  type PickerResult,
} from "../helpers/widgetPicker";

// ── Detection via inspectedWindow.eval ─────────────────────────────────

const DETECT_IVY_CODE = `
(function() {
  var meta = document.querySelector('meta[name="ivy-enable-dev-tools"]');
  var devToolsEnabled = meta ? meta.getAttribute("content") === "true" : false;
  var hasIvyMeta = !!document.querySelector('meta[name^="ivy-"]');
  var widgetCount = document.querySelectorAll("ivy-widget").length;
  return {
    isIvy: hasIvyMeta || widgetCount > 0,
    devToolsEnabled: devToolsEnabled,
    widgetCount: widgetCount
  };
})()
`;

export function useIvyDetection() {
  const setIvyStatus = usePanelStore((s) => s.setIvyStatus);
  const setSelectedWidget = usePanelStore((s) => s.setSelectedWidget);
  const clearModifiedProps = usePanelStore((s) => s.clearModifiedProps);
  const setTendrilDetected = usePanelStore((s) => s.setTendrilDetected);
  const tendrilChecked = useRef(false);
  const wasIvy = useRef(false);

  const query = useQuery<IvyDetectionResult>({
    queryKey: ["ivy-detection"],
    queryFn: () => pageEval<IvyDetectionResult>(DETECT_IVY_CODE),
    refetchInterval: 3000,
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (query.data) {
      setIvyStatus(query.data);

      // Page reload: Ivy disappeared → clear selection and modified props
      if (wasIvy.current && !query.data.isIvy) {
        setSelectedWidget(null);
        clearModifiedProps();
      }
      wasIvy.current = query.data.isIvy;

      // Check Tendril once when Ivy is detected
      if (query.data.isIvy && query.data.devToolsEnabled && !tendrilChecked.current) {
        tendrilChecked.current = true;
        pageEval<string>("window.location.origin")
          .then((origin) => fetch(`${origin}/ivy/dev-tools/env-info`))
          .then((resp) => resp.ok ? resp.json() : null)
          .then((data) => {
            if (data?.tendrilDetected) setTendrilDetected(true);
          })
          .catch(() => {});
      }
    }
  }, [query.data, setIvyStatus, setSelectedWidget, clearModifiedProps, setTendrilDetected]);

  return query;
}

// ── Widget inspection via shared picker (pageEval, no content script) ──

export function useInspect() {
  const inspecting = usePanelStore((s) => s.inspecting);
  const setInspecting = usePanelStore((s) => s.setInspecting);
  const setSelectedWidget = usePanelStore((s) => s.setSelectedWidget);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startInspect = useCallback(async () => {
    setInspecting(true);
    setSelectedWidget(null);
    await pageEval(INJECT_WIDGET_PICKER);
    await pageEval(START_PICKER("inspect"));

    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const result = await pageEval<PickerResult | null>(CHECK_RESULT);
        if (result) {
          if (result.action === "inspect" && result.widget) {
            setSelectedWidget(result.widget);
          }
          setInspecting(false);
          stopPolling();
          return;
        }
        const stillActive = await pageEval<boolean>(IS_ACTIVE);
        if (!stillActive) { setInspecting(false); stopPolling(); }
      } catch {
        setInspecting(false); stopPolling();
      }
    }, 200);
  }, [setInspecting, setSelectedWidget, stopPolling]);

  const stopInspect = useCallback(async () => {
    await pageEval(STOP_PICKER);
    setInspecting(false);
    stopPolling();
  }, [setInspecting, stopPolling]);

  const toggleInspect = useCallback(() => {
    if (inspecting) stopInspect();
    else startInspect();
  }, [inspecting, startInspect, stopInspect]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { inspecting, toggleInspect, startInspect, stopInspect };
}
