// All tracking events are stored as JSONL per session

export type TrackingEventType =
  | "session_summary"
  | "rrweb"
  | "keystroke"
  | "paste"
  | "copy"
  | "cut"
  | "focus"
  | "blur"
  | "visibility"
  | "typing_burst"
  | "canvas_edit"
  | "session_start"
  | "session_end";

export interface BaseTrackingEvent {
  type: TrackingEventType;
  timestamp: number;
  sessionId: string;
  threadId: string;
  userId?: string;
}

export interface KeystrokeEvent extends BaseTrackingEvent {
  type: "keystroke";
  key: string;
  target: string;
  isModifier: boolean;
  metaKeys: {
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    shift: boolean;
  };
}

export interface PasteEvent extends BaseTrackingEvent {
  type: "paste";
  target: string;
  textLength: number;
  textPreview: string;
}

export interface CopyEvent extends BaseTrackingEvent {
  type: "copy";
  target: string;
  selectedTextLength: number;
}

export interface CutEvent extends BaseTrackingEvent {
  type: "cut";
  target: string;
  selectedTextLength: number;
}

export interface FocusBlurEvent extends BaseTrackingEvent {
  type: "focus" | "blur";
}

export interface VisibilityEvent extends BaseTrackingEvent {
  type: "visibility";
  state: "visible" | "hidden";
}

export interface TypingBurstEvent extends BaseTrackingEvent {
  type: "typing_burst";
  target: string;
  burstLength: number;
  burstDurationMs: number;
  avgIntervalMs: number;
  wordsApprox: number;
}

export interface CanvasEditEvent extends BaseTrackingEvent {
  type: "canvas_edit";
  changeType: "insert" | "delete" | "replace";
  positionStart: number;
  positionEnd: number;
  lengthDelta: number;
  source: "user-typing" | "user-paste" | "unknown";
}

export interface SessionEvent extends BaseTrackingEvent {
  type: "session_start" | "session_end";
  userAgent: string;
  screenResolution: string;
}

export type TrackingEvent =
  | KeystrokeEvent
  | PasteEvent
  | CopyEvent
  | CutEvent
  | FocusBlurEvent
  | VisibilityEvent
  | TypingBurstEvent
  | CanvasEditEvent
  | SessionEvent
  | {
      type: "rrweb";
      timestamp: number;
      sessionId: string;
      threadId: string;
      data: any;
    };
