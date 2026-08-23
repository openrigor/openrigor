"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { TrackingAggregator } from "./aggregator";
import { useKeystrokeTracker } from "./use-keystroke-tracker";
import { useClipboardTracker } from "./use-clipboard-tracker";
import { useFocusTracker } from "./use-focus-tracker";
import { useRrwebRecorder } from "./use-rrweb-recorder";

interface SessionRecorderProps {
  threadId: string;
  userId?: string;
  enabled?: boolean;
  children: React.ReactNode;
}

export function SessionRecorder({
  threadId,
  userId,
  enabled = true,
  children,
}: SessionRecorderProps) {
  const sessionId = useMemo(() => uuidv4(), []);

  // Create aggregator synchronously so it's available for tracker hooks
  const [aggregator] = useState(
    () => new TrackingAggregator(sessionId, threadId, userId)
  );

  // Start/stop the aggregator's periodic summary timer
  useEffect(() => {
    if (!enabled) return;
    aggregator.start();
    // Expose for debugging / E2E tests
    (window as any).__trackingAggregator = aggregator;
    return () => {
      aggregator.stop();
      delete (window as any).__trackingAggregator;
    };
  }, [enabled, aggregator]);

  // Update aggregator threadId when it becomes available
  useEffect(() => {
    if (threadId) {
      aggregator.setThreadId(threadId);
    }
  }, [threadId, aggregator]);

  // Activate all trackers — they feed the aggregator, not the EventCollector
  useKeystrokeTracker({ aggregator, enabled });
  useClipboardTracker({ aggregator, enabled });
  useFocusTracker({ aggregator, enabled });

  // rrweb records locally only (memory, not API)
  useRrwebRecorder({ sessionId, threadId, enabled });

  return <>{children}</>;
}
