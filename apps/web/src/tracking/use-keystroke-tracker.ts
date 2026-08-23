"use client";

import { useEffect } from "react";
import type { TrackingAggregator } from "./aggregator";

interface KeystrokeTrackerOptions {
  aggregator: TrackingAggregator;
  enabled?: boolean;
}

export function useKeystrokeTracker(options: KeystrokeTrackerOptions) {
  useEffect(() => {
    if (options.enabled === false) return;

    const getTarget = (e: KeyboardEvent): string => {
      const el = e.target as HTMLElement;
      if (!el || typeof el.closest !== "function") return "other";
      if (el.closest('[data-tracking-id="chat-input"]')) return "chat-input";
      if (el.closest('[data-tracking-id="canvas-editor"]'))
        return "canvas-editor";
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT")
        return "text-field";
      return "other";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip modifier-only keys
      if (
        [
          "Shift",
          "Control",
          "Alt",
          "Meta",
          "CapsLock",
          "Tab",
          "Escape",
        ].includes(e.key)
      ) {
        return;
      }

      const target = getTarget(e);
      options.aggregator.trackKeystroke(target);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [options.aggregator, options.enabled]);
}
