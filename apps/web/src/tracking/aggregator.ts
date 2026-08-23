// Client-side metric aggregation — computes running totals and sends
// compact session_summary events instead of individual keystroke/rrweb events.
//
// Architecture:
//   Trackers → Aggregator (in-memory counters) → session_summary → API (direct POST)
//   rrweb → local memory only (not sent to API)

interface BurstRecord {
  startTime: number;
  keyCount: number;
  target: string;
}

interface SessionSummaryPayload {
  type: "session_summary";
  timestamp: number;
  sessionId: string;
  threadId: string;
  userId?: string;
  durationMs: number;
  keystrokes: number;
  typingBursts: number;
  totalBurstWords: number;
  avgBurstDurationMs: number;
  pasteEvents: number;
  pastedChars: number;
  copyEvents: number;
  cutEvents: number;
  canvasEdits: number;
  canvasInsertions: number;
  canvasDeletions: number;
  canvasReplaces: number;
  focusCount: number;
  blurCount: number;
  visibilityHiddenCount: number;
  editKeeps: number;
  editUndos: number;
  editCharsAccepted: number;
  editCharsRejected: number;
}

const BURST_THRESHOLD_MS = 200;
const SUMMARY_INTERVAL_MS = 30_000; // 30 seconds
const TRACKING_ENDPOINT = "/api/tracking/events";

export class TrackingAggregator {
  readonly sessionId: string;
  readonly userId?: string;
  private startTime: number;

  // Counters
  private keystrokes = 0;
  private typingBursts = 0;
  private totalBurstWords = 0;
  private burstDurationSum = 0;
  private pasteEvents = 0;
  private pastedChars = 0;
  private copyEvents = 0;
  private cutEvents = 0;
  private canvasEdits = 0;
  private canvasInsertions = 0;
  private canvasDeletions = 0;
  private canvasReplaces = 0;
  private focusCount = 0;
  private blurCount = 0;
  private visibilityHiddenCount = 0;
  private editKeeps = 0;
  private editUndos = 0;
  private editCharsAccepted = 0;
  private editCharsRejected = 0;

  // Burst tracking
  private currentBurst: BurstRecord | null = null;
  private lastKeystrokeTime = 0;
  private burstTimer: ReturnType<typeof setTimeout> | null = null;

  // Periodic summary
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  // Allow threadId updates (initial value may be "unknown" before thread creation)
  private _threadId: string;
  get threadId(): string {
    return this._threadId;
  }

  constructor(sessionId: string, threadId: string, userId?: string) {
    this.sessionId = sessionId;
    this._threadId = threadId;
    this.userId = userId;
    this.startTime = Date.now();
  }

  /** Update threadId when the real thread becomes available */
  setThreadId(threadId: string) {
    if (threadId && threadId !== "unknown") {
      this._threadId = threadId;
    }
  }

  start() {
    this.startTime = Date.now();
    this.stopped = false;
    this.summaryTimer = setInterval(
      () => this.emitSummary(),
      SUMMARY_INTERVAL_MS
    );
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;

    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
    if (this.burstTimer) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
    this.flushBurst();

    // Send final summary directly with keepalive (page may be unloading)
    const summary = this.buildSummary();
    if (this.hasActivity(summary)) {
      this.sendDirect(summary);
    }
  }

  // --- Trackers call these methods ---

  trackKeystroke(target: string) {
    this.keystrokes++;
    const now = Date.now();

    // Burst detection
    if (
      this.currentBurst &&
      now - this.lastKeystrokeTime > BURST_THRESHOLD_MS
    ) {
      this.flushBurst();
    }

    if (!this.currentBurst) {
      this.currentBurst = { startTime: now, keyCount: 0, target };
    }
    this.currentBurst.keyCount++;
    this.lastKeystrokeTime = now;

    // Reset burst timeout
    if (this.burstTimer) clearTimeout(this.burstTimer);
    this.burstTimer = setTimeout(
      () => this.flushBurst(),
      BURST_THRESHOLD_MS * 2
    );
  }

  trackPaste(charCount: number) {
    this.pasteEvents++;
    this.pastedChars += charCount;
  }

  trackCopy() {
    this.copyEvents++;
  }

  trackCut() {
    this.cutEvents++;
  }

  trackCanvasEdit(changeType: "insert" | "delete" | "replace") {
    this.canvasEdits++;
    if (changeType === "insert") this.canvasInsertions++;
    else if (changeType === "delete") this.canvasDeletions++;
    else if (changeType === "replace") this.canvasReplaces++;
  }

  trackFocus() {
    this.focusCount++;
  }

  trackBlur() {
    this.blurCount++;
  }

  trackVisibilityHidden() {
    this.visibilityHiddenCount++;
  }

  trackEditAction(action: "keep" | "undo", characterCountDelta: number) {
    if (action === "keep") {
      this.editKeeps++;
      this.editCharsAccepted += Math.abs(characterCountDelta);
    } else {
      this.editUndos++;
      this.editCharsRejected += Math.abs(characterCountDelta);
    }
  }

  // --- Internal ---

  private flushBurst() {
    if (!this.currentBurst || this.currentBurst.keyCount < 2) {
      this.currentBurst = null;
      return;
    }

    const duration = this.lastKeystrokeTime - this.currentBurst.startTime;
    this.typingBursts++;
    this.totalBurstWords += Math.round(this.currentBurst.keyCount / 5);
    this.burstDurationSum += duration;

    this.currentBurst = null;
    if (this.burstTimer) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }

  private buildSummary(): SessionSummaryPayload {
    return {
      type: "session_summary",
      timestamp: Date.now(),
      sessionId: this.sessionId,
      threadId: this.threadId,
      userId: this.userId,
      durationMs: Date.now() - this.startTime,
      keystrokes: this.keystrokes,
      typingBursts: this.typingBursts,
      totalBurstWords: this.totalBurstWords,
      avgBurstDurationMs:
        this.typingBursts > 0
          ? Math.round(this.burstDurationSum / this.typingBursts)
          : 0,
      pasteEvents: this.pasteEvents,
      pastedChars: this.pastedChars,
      copyEvents: this.copyEvents,
      cutEvents: this.cutEvents,
      canvasEdits: this.canvasEdits,
      canvasInsertions: this.canvasInsertions,
      canvasDeletions: this.canvasDeletions,
      canvasReplaces: this.canvasReplaces,
      focusCount: this.focusCount,
      blurCount: this.blurCount,
      visibilityHiddenCount: this.visibilityHiddenCount,
      editKeeps: this.editKeeps,
      editUndos: this.editUndos,
      editCharsAccepted: this.editCharsAccepted,
      editCharsRejected: this.editCharsRejected,
    };
  }

  private hasActivity(summary: SessionSummaryPayload): boolean {
    return (
      summary.keystrokes > 0 ||
      summary.pasteEvents > 0 ||
      summary.copyEvents > 0 ||
      summary.cutEvents > 0 ||
      summary.canvasEdits > 0 ||
      summary.focusCount > 0 ||
      summary.blurCount > 0 ||
      summary.visibilityHiddenCount > 0 ||
      summary.editKeeps > 0 ||
      summary.editUndos > 0
    );
  }

  /** Periodic summary — posts directly to API (no keepalive needed) */
  private async emitSummary() {
    const summary = this.buildSummary();
    if (!this.hasActivity(summary)) return;

    try {
      const res = await fetch(TRACKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [summary] }),
        credentials: "include",
      });
      if (!res.ok) {
        console.warn(`[tracking] periodic summary failed: ${res.status}`);
      }
    } catch (err) {
      console.warn("[tracking] periodic summary fetch error:", err);
    }
  }

  /** Final summary on stop — sends directly with keepalive for page unload */
  private sendDirect(summary: SessionSummaryPayload) {
    try {
      fetch(TRACKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [summary] }),
        keepalive: true,
        credentials: "include",
      });
    } catch {
      // Can't recover during unload
    }
  }
}
