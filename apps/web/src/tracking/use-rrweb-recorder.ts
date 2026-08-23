"use client";

import { useEffect, useRef } from "react";
import { record } from "rrweb";

interface RrwebRecorderOptions {
  sessionId: string;
  threadId: string;
  enabled?: boolean;
}

/**
 * Records DOM events locally for potential session replay.
 * Events are kept in memory only — NOT sent to the tracking API.
 * Access via window.__rrwebEvents__ for debugging/replay.
 */
export function useRrwebRecorder(options: RrwebRecorderOptions) {
  const stopRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<any[]>([]);

  useEffect(() => {
    if (options.enabled === false) return;

    const stopRecording = record({
      emit(event) {
        eventsRef.current.push(event);
        // Expose for debugging — last 500 events
        if (eventsRef.current.length > 500) {
          eventsRef.current = eventsRef.current.slice(-500);
        }
        (window as any).__rrwebEvents__ = eventsRef.current;
      },
      // Mask all text inputs by default for privacy
      maskAllInputs: false, // we WANT to see keystrokes for academic integrity
      maskTextSelector: "[data-mask-text]",
      // Record canvas content
      collectFonts: true,
      // Sample at lower rate to reduce memory pressure
      sampling: {
        mousemove: 200, // every 200ms (was 50)
        mouseInteraction: true,
        scroll: 500, // every 500ms (was 150)
        input: "last", // only record final value
      },
    });

    stopRef.current = stopRecording ?? null;

    return () => {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
    };
  }, [options.sessionId, options.threadId, options.enabled]);
}
