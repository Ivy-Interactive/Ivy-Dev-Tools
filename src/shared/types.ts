/** Mirrors Ivy's CallSite from the framework */
export interface CallSite {
  path?: string;
  filePath?: string;
  lineNumber?: number;
  memberName?: string;
  declaringType?: string;
}

export interface WidgetInfo {
  id: string;
  type: string;
  bounds: { top: number; left: number; width: number; height: number };
  callSite?: CallSite;
  ancestors: { id: string; type: string }[];
}

export interface IvyDetectionResult {
  isIvy: boolean;
  devToolsEnabled: boolean;
  widgetCount: number;
}
