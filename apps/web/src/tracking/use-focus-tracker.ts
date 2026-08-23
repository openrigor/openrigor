"use client";

import { useEffect } from "react";
import type { TrackingAggregator } from "./aggregator";

interface FocusTrackerOptions {
  aggregator: TrackingAggregator;
  enabled?: boolean;
}

export function useFocusTracker(options: FocusTrackerOptions) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handleFocus = () => {
      options.aggregator.trackFocus();
    };

    const handleBlur = () => {
      options.aggregator.trackBlur();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        options.aggregator.trackVisibilityHidden();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [options.aggregator, options.enabled]);
}
