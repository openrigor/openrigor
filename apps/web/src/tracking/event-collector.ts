// Collects events in memory, flushes to API in batches
// - Flushes every 5 seconds OR when buffer reaches 20 events
// - Flushes on page unload (fetch with keepalive — small payload only)
// - Keeps trying on failure with backoff (never permanently disables)

import { TrackingEvent } from "./types";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 2000;

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("Content-Type") ?? "";
  return ct.includes("application/json");
}

export class EventCollector {
  private buffer: TrackingEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private endpoint: string;
  private isFlushing = false;
  private failCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(endpoint: string = "/api/tracking/events") {
    this.endpoint = endpoint;
  }

  start() {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

    // Flush on page unload
    window.addEventListener("beforeunload", this.handleBeforeUnload);
  }

  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    // Fire-and-forget flush on stop (use keepalive for page unload)
    this.flushOnUnload();
  }

  addEvent(event: TrackingEvent) {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private handleBeforeUnload = () => {
    this.flushOnUnload();
  };

  private flushOnUnload() {
    if (this.buffer.length === 0) return;
    const events = [...this.buffer];
    this.buffer = [];
    try {
      // keepalive is needed for page unload, but has a 64KB body limit.
      // We only send a small batch here (last few events before unload).
      fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
        credentials: "include",
      });
    } catch {
      // Can't recover during unload — events are lost
    }
  }

  private scheduleRetry() {
    if (this.failCount >= MAX_RETRY_ATTEMPTS) {
      console.warn(
        `[tracking] ${MAX_RETRY_ATTEMPTS} consecutive flush failures — will retry on next timer tick`
      );
      // Reset fail count so the next interval tick tries again
      this.failCount = 0;
      return;
    }

    const delay = RETRY_BACKOFF_MS * Math.pow(2, this.failCount - 1);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flush();
    }, delay);
  }

  private async flush() {
    if (this.isFlushing || this.buffer.length === 0) return;
    this.isFlushing = true;

    const eventsToSend = [...this.buffer];
    this.buffer = [];

    try {
      // Regular fetch (no keepalive) — no 64KB body limit
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: eventsToSend }),
        credentials: "include",
      });

      if (res.ok && isJsonResponse(res)) {
        // Success
        this.failCount = 0;
        return;
      }

      // Non-OK or non-JSON response (e.g. auth redirect)
      console.warn(
        `[tracking] flush failed: status=${res.status} redirected=${res.redirected} ok=${res.ok}`
      );
      this.failCount += 1;
      this.buffer = [...eventsToSend, ...this.buffer];
      this.scheduleRetry();
    } catch (err) {
      // Failed to fetch — likely page navigating or network issue
      this.failCount += 1;
      this.buffer = [...eventsToSend, ...this.buffer];
      this.scheduleRetry();
    } finally {
      this.isFlushing = false;
    }
  }
}

// Singleton
let instance: EventCollector | null = null;
export function getEventCollector(): EventCollector {
  if (!instance) {
    instance = new EventCollector();
  }
  return instance;
}
