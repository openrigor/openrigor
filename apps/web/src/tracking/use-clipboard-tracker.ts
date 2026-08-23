"use client";

import { useEffect } from "react";
import type { TrackingAggregator } from "./aggregator";

interface ClipboardTrackerOptions {
  aggregator: TrackingAggregator;
  enabled?: boolean;
}

export function useClipboardTracker(options: ClipboardTrackerOptions) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      options.aggregator.trackPaste(text.length);
    };

    const handleCopy = () => {
      options.aggregator.trackCopy();
    };

    const handleCut = () => {
      options.aggregator.trackCut();
    };

    document.addEventListener("paste", handlePaste);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);

    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
    };
  }, [options.aggregator, options.enabled]);
}
