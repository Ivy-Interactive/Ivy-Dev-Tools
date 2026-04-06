import { create } from "zustand";
import type { IvyDetectionResult } from "@shared/types";
import type { PickerWidgetInfo } from "./helpers/widgetPicker";

export interface PanelState {
  ivyStatus: IvyDetectionResult | null;
  setIvyStatus: (status: IvyDetectionResult | null) => void;

  inspecting: boolean;
  setInspecting: (v: boolean) => void;
  selectedWidget: PickerWidgetInfo | null;
  setSelectedWidget: (w: PickerWidgetInfo | null) => void;

  /** Tracks which props have been edited in the current session (widgetId:propKey) */
  modifiedProps: Set<string>;
  markPropModified: (widgetId: string, propKey: string) => void;
  clearModifiedProps: () => void;

  tendrilDetected: boolean;
  setTendrilDetected: (v: boolean) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  ivyStatus: null,
  setIvyStatus: (status) => set({ ivyStatus: status }),

  inspecting: false,
  setInspecting: (v) => set({ inspecting: v }),
  selectedWidget: null,
  setSelectedWidget: (w) => set({ selectedWidget: w, modifiedProps: new Set() }),

  modifiedProps: new Set(),
  markPropModified: (widgetId, propKey) =>
    set((s) => {
      const next = new Set(s.modifiedProps);
      next.add(`${widgetId}:${propKey}`);
      return { modifiedProps: next };
    }),
  clearModifiedProps: () => set({ modifiedProps: new Set() }),

  tendrilDetected: false,
  setTendrilDetected: (v) => set({ tendrilDetected: v }),
}));
