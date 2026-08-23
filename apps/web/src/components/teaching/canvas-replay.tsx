"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { ReadonlyMarkdownRendererSuspense } from "@/components/artifacts/readonly-markdown-renderer-lazy";
import { clearTrackChangesRanges } from "@/components/artifacts/TrackChangesExtension";
import { computeDiffRanges, type DiffRange } from "@/lib/diffing";
import { createClient } from "@/hooks/utils";
import type { Config, ThreadState } from "@langchain/langgraph-sdk";
import {
  historyToFrames,
  type ReplayFrame,
  type ReplayHistoryCheckpoint,
  type ReplayHistoryMessage,
} from "@opencanvas/shared/utils/replay-frames";
import { Button } from "@/components/ui/button";
import { diffMarkdown, type DiffSegment } from "@/lib/replay-diff";
import { cn } from "@/lib/utils";

const HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGES = 10;
const MAX_FRAME_DELAY_MS = 10_000;
const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;

type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

interface CanvasReplayContextValue {
  loading: boolean;
  error: string | null;
  truncated: boolean;
  frames: ReplayFrame[];
  currentFrameIndex: number;
  setCurrentFrameIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  speed: PlaybackSpeed;
  setSpeed: (speed: PlaybackSpeed) => void;
  currentFrame: ReplayFrame | undefined;
  visibleMessages: ReplayHistoryMessage[];
  messageFirstFrameIndex: Map<string, number>;
}

const CanvasReplayContext = createContext<CanvasReplayContextValue | null>(
  null
);

function messageKey(message: ReplayHistoryMessage, fallback: string): string {
  if (typeof message.id === "string" && message.id.length > 0) {
    return message.id;
  }
  return fallback;
}

function buildMessageFirstFrameIndex(
  frames: ReplayFrame[]
): Map<string, number> {
  const map = new Map<string, number>();

  frames.forEach((frame, frameIndex) => {
    frame.messages.forEach((message, messageIndex) => {
      const key = messageKey(
        message,
        `frame-${frameIndex}-msg-${messageIndex}`
      );
      if (!map.has(key)) {
        map.set(key, frameIndex);
      }
    });
  });

  return map;
}

function formatFrameTimestamp(
  createdAtMs: number,
  previousCreatedAtMs: number | undefined
): string {
  const date = new Date(createdAtMs);
  if (!previousCreatedAtMs) {
    return date.toLocaleString();
  }

  const previousDate = new Date(previousCreatedAtMs);
  if (date.toDateString() !== previousDate.toDateString()) {
    return date.toLocaleString();
  }

  return date.toLocaleTimeString();
}

function messageContent(message: ReplayHistoryMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (content == null) {
    return "";
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

function messageRole(message: ReplayHistoryMessage): "human" | "assistant" {
  return message.type === "human" ? "human" : "assistant";
}

function getEditBadges(frame: ReplayFrame): string[] {
  const badges: string[] = [];

  if (frame.messagesSummarized) {
    badges.push("Earlier messages summarized");
  }

  if (frame.author === "student") {
    badges.push("Student saved");
  } else if (frame.author === "ai") {
    badges.push("AI rewrote");
  } else if (frame.author === "ambiguous") {
    badges.push("Edit applied (author ambiguous)");
  }

  return badges;
}

async function fetchCheckpointHistory(threadId: string): Promise<{
  history: ReplayHistoryCheckpoint[];
  truncated: boolean;
}> {
  const client = createClient();
  const history: ReplayHistoryCheckpoint[] = [];
  let before: Config | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const pageResults = await client.threads.getHistory(threadId, {
      limit: HISTORY_PAGE_SIZE,
      before,
    });

    if (!pageResults.length) {
      break;
    }

    history.push(
      ...pageResults.map((entry) => entry as unknown as ReplayHistoryCheckpoint)
    );

    const oldestInPage = pageResults[pageResults.length - 1] as ThreadState;
    const oldestCheckpointId = oldestInPage.checkpoint?.checkpoint_id;
    if (!oldestCheckpointId) {
      break;
    }

    // LangGraph history API expects `before` as a checkpoint_id string, not a Config object.
    before = oldestCheckpointId as unknown as Config;

    if (pageResults.length < HISTORY_PAGE_SIZE) {
      break;
    }

    if (page === MAX_HISTORY_PAGES - 1) {
      truncated = true;
    }
  }

  return { history, truncated };
}

export function CanvasReplayProvider({
  threadId,
  enabled,
  children,
}: {
  threadId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  useEffect(() => {
    if (!enabled) {
      setIsPlaying(false);
      clearTrackChangesRanges();
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      setTruncated(false);
      setFrames([]);
      setCurrentFrameIndex(0);
      setIsPlaying(false);

      try {
        const { history, truncated: historyTruncated } =
          await fetchCheckpointHistory(threadId);

        if (cancelled) {
          return;
        }

        const builtFrames = history.length > 0 ? historyToFrames(history) : [];
        setFrames(builtFrames);
        setTruncated(historyTruncated);
        setCurrentFrameIndex(0);
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to load replay history:", loadError);
          setError("Failed to load replay history");
          setFrames([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
      clearTrackChangesRanges();
    };
  }, [enabled, threadId]);

  const messageFirstFrameIndex = useMemo(
    () => buildMessageFirstFrameIndex(frames),
    [frames]
  );

  const currentFrame = frames[currentFrameIndex];

  const visibleMessages = useMemo(() => {
    if (!currentFrame) {
      return [];
    }

    return currentFrame.messages.filter((message, messageIndex) => {
      const key = messageKey(
        message,
        `frame-${currentFrameIndex}-msg-${messageIndex}`
      );
      const firstFrameIndex = messageFirstFrameIndex.get(key);
      return (
        firstFrameIndex !== undefined && firstFrameIndex <= currentFrameIndex
      );
    });
  }, [currentFrame, currentFrameIndex, messageFirstFrameIndex]);

  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) {
      return;
    }

    if (currentFrameIndex >= frames.length - 1) {
      setIsPlaying(false);
      return;
    }

    const current = frames[currentFrameIndex];
    const next = frames[currentFrameIndex + 1];
    const deltaMs = Math.max(0, next.createdAt - current.createdAt);
    const cappedDelayMs = Math.min(deltaMs, MAX_FRAME_DELAY_MS);
    const delayMs = cappedDelayMs / speed;

    playbackTimerRef.current = setTimeout(() => {
      setCurrentFrameIndex((index) => Math.min(index + 1, frames.length - 1));
    }, delayMs);

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, currentFrameIndex, frames, speed]);

  useEffect(() => {
    if (currentFrameIndex >= frames.length - 1 && frames.length > 0) {
      setIsPlaying(false);
    }
  }, [currentFrameIndex, frames.length]);

  const contextValue: CanvasReplayContextValue = {
    loading,
    error,
    truncated,
    frames,
    currentFrameIndex,
    setCurrentFrameIndex,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    currentFrame,
    visibleMessages,
    messageFirstFrameIndex,
  };

  return (
    <CanvasReplayContext.Provider value={contextValue}>
      {children}
    </CanvasReplayContext.Provider>
  );
}

function useCanvasReplay(): CanvasReplayContextValue {
  const context = useContext(CanvasReplayContext);
  if (!context) {
    throw new Error("useCanvasReplay must be used within CanvasReplayProvider");
  }
  return context;
}

function ReplayEmptyState({ message }: { message: string }) {
  return (
    <div className="text-center text-muted-foreground py-8">{message}</div>
  );
}

export function CanvasReplayControls() {
  const {
    loading,
    error,
    truncated,
    frames,
    currentFrameIndex,
    setCurrentFrameIndex,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    currentFrame,
  } = useCanvasReplay();

  const previousFrame = frames[currentFrameIndex - 1];
  const badges = currentFrame ? getEditBadges(currentFrame) : [];
  const hasCharDelta =
    currentFrame &&
    (currentFrame.charsAdded > 0 || currentFrame.charsRemoved > 0);

  const handleScrub = useCallback(
    (value: number) => {
      setIsPlaying(false);
      setCurrentFrameIndex(value);
    },
    [setCurrentFrameIndex, setIsPlaying]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading replay history...
      </div>
    );
  }

  if (error || frames.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 pb-3 border-b">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={frames.length <= 1}
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        <label className="text-sm text-muted-foreground" htmlFor="replay-speed">
          Speed
        </label>
        <select
          id="replay-speed"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={speed}
          onChange={(event) => {
            setIsPlaying(false);
            setSpeed(Number(event.target.value) as PlaybackSpeed);
          }}
        >
          {PLAYBACK_SPEEDS.map((playbackSpeed) => (
            <option key={playbackSpeed} value={playbackSpeed}>
              {playbackSpeed}×
            </option>
          ))}
        </select>

        <div className="text-sm text-muted-foreground min-w-[10rem]">
          Frame {currentFrameIndex + 1} of {frames.length}
          {currentFrame && (
            <>
              {" · "}
              {formatFrameTimestamp(
                currentFrame.createdAt,
                previousFrame?.createdAt
              )}
            </>
          )}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(frames.length - 1, 0)}
        step={1}
        value={currentFrameIndex}
        onChange={(event) => handleScrub(Number(event.target.value))}
        className="w-full"
        aria-label="Replay timeline"
      />

      {truncated && (
        <p className="text-xs text-amber-600">
          History truncated — only the most recent checkpoints are shown.
        </p>
      )}

      {(badges.length > 0 || hasCharDelta) && (
        <div className="space-y-1">
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
          {hasCharDelta && currentFrame && (
            <p className="text-xs text-muted-foreground">
              ＋{currentFrame.charsAdded} chars / −{currentFrame.charsRemoved}{" "}
              chars
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type CanvasReplayViewMode = "canvas" | "changes";

function CanvasReplayViewToggle({
  mode,
  onModeChange,
}: {
  mode: CanvasReplayViewMode;
  onModeChange: (mode: CanvasReplayViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-input p-0.5 text-sm"
      role="group"
      aria-label="Workspace replay view"
    >
      <button
        type="button"
        className={cn(
          "rounded px-2.5 py-1 transition-colors",
          mode === "canvas"
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onModeChange("canvas")}
        aria-pressed={mode === "canvas"}
      >
        Workspace
      </button>
      <button
        type="button"
        className={cn(
          "rounded px-2.5 py-1 transition-colors",
          mode === "changes"
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onModeChange("changes")}
        aria-pressed={mode === "changes"}
      >
        Changes
      </button>
    </div>
  );
}

function segmentLines(segment: DiffSegment): string[] {
  if (segment.value.length === 0) {
    return [];
  }

  const parts = segment.value.split("\n");
  if (segment.value.endsWith("\n")) {
    return parts.slice(0, -1);
  }

  return parts;
}

function CanvasReplayChangesContent({
  previousText,
  currentText,
}: {
  previousText: string;
  currentText: string;
}) {
  const { segments, truncated } = useMemo(
    () => diffMarkdown(previousText, currentText),
    [previousText, currentText]
  );

  if (segments.length === 0) {
    return <ReplayEmptyState message="No changes from the previous frame." />;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-red-200 bg-red-100"
            aria-hidden="true"
          />
          Removed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-green-200 bg-green-100"
            aria-hidden="true"
          />
          Added
        </span>
      </div>

      {truncated && (
        <p className="text-xs text-amber-600">
          Diff truncated — showing the first 200 changed lines.
        </p>
      )}

      <div className="rounded-md border overflow-x-auto">
        {segments.flatMap((segment, segmentIndex) =>
          segmentLines(segment).map((line, lineIndex) => (
            <div
              key={`${segmentIndex}-${lineIndex}`}
              className={cn(
                "font-mono text-sm whitespace-pre-wrap break-words px-2 py-0.5",
                segment.added && "bg-green-100 text-green-900",
                segment.removed && "bg-red-100 text-red-900"
              )}
            >
              {line.length > 0 ? line : " "}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CanvasReplayChatContent() {
  const { loading, error, frames, visibleMessages, currentFrameIndex } =
    useCanvasReplay();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [currentFrameIndex, visibleMessages.length]);

  if (loading) {
    return null;
  }

  if (error || frames.length === 0) {
    return <ReplayEmptyState message="No replay data for this thread" />;
  }

  if (visibleMessages.length === 0) {
    return <ReplayEmptyState message="No messages yet." />;
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-2">
      <div className="space-y-4">
        {visibleMessages.map((message, index) => {
          const role = messageRole(message);
          return (
            <div
              key={messageKey(message, `visible-${index}`)}
              className={`flex ${
                role === "human" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  role === "human"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {messageContent(message)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CanvasReplayCanvasContent() {
  const { loading, error, frames, currentFrame, currentFrameIndex } =
    useCanvasReplay();
  const [viewMode, setViewMode] = useState<CanvasReplayViewMode>("canvas");
  const [highlightRanges, setHighlightRanges] = useState<DiffRange[]>([]);
  const [scrollToOffset, setScrollToOffset] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialFrameRef = useRef(true);
  const previousFrameIndexRef = useRef(0);

  const previousFrame = frames[currentFrameIndex - 1];

  useEffect(() => {
    if (isInitialFrameRef.current) {
      isInitialFrameRef.current = false;
      previousFrameIndexRef.current = currentFrameIndex;
      setHighlightRanges([]);
      setScrollToOffset(null);
      clearTrackChangesRanges();
      return;
    }

    if (previousFrameIndexRef.current === currentFrameIndex) {
      return;
    }
    previousFrameIndexRef.current = currentFrameIndex;

    if (currentFrameIndex === 0) {
      setHighlightRanges([]);
      setScrollToOffset(null);
      clearTrackChangesRanges();
      return;
    }

    const prev = frames[currentFrameIndex - 1];
    const curr = frames[currentFrameIndex];
    if (!prev || !curr || curr.artifactType === "code") {
      setHighlightRanges([]);
      setScrollToOffset(null);
      clearTrackChangesRanges();
      return;
    }

    const prevMarkdown = prev.artifactMarkdown ?? "";
    const currMarkdown = curr.artifactMarkdown ?? "";
    if (prevMarkdown === currMarkdown) {
      setHighlightRanges([]);
      setScrollToOffset(null);
      clearTrackChangesRanges();
      return;
    }

    const ranges = computeDiffRanges(prevMarkdown, currMarkdown);
    setHighlightRanges(ranges);
    setScrollToOffset(ranges.length > 0 ? ranges[0].start : null);
  }, [currentFrameIndex, frames]);

  const previousText = useMemo(() => {
    if (!previousFrame) {
      return "";
    }
    if (previousFrame.artifactType === "code") {
      return previousFrame.artifactCode;
    }
    return previousFrame.artifactMarkdown;
  }, [previousFrame]);

  const currentText = useMemo(() => {
    if (!currentFrame) {
      return "";
    }
    if (currentFrame.artifactType === "code") {
      return currentFrame.artifactCode;
    }
    return currentFrame.artifactMarkdown;
  }, [currentFrame]);

  if (loading) {
    return null;
  }

  if (error || frames.length === 0) {
    return <ReplayEmptyState message="No replay data for this thread" />;
  }

  if (!currentFrame) {
    return <ReplayEmptyState message="No canvas content yet." />;
  }

  const canvasBody =
    currentFrame.artifactType === "code" && currentFrame.artifactCode ? (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Code artifact</p>
        <pre className="rounded-md bg-muted p-3 text-sm overflow-x-auto">
          <code>{currentFrame.artifactCode}</code>
        </pre>
      </div>
    ) : currentFrame.artifactMarkdown ? (
      <ReadonlyMarkdownRendererSuspense
        markdown={currentFrame.artifactMarkdown}
        highlightRanges={highlightRanges}
        scrollToOffset={scrollToOffset}
        scrollContainerRef={scrollContainerRef}
      />
    ) : (
      <ReplayEmptyState message="No canvas content yet." />
    );

  return (
    <div className="h-full flex flex-col gap-3 pr-2">
      <CanvasReplayViewToggle mode={viewMode} onModeChange={setViewMode} />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {viewMode === "changes" ? (
          previousFrame ? (
            <CanvasReplayChangesContent
              previousText={previousText}
              currentText={currentText}
            />
          ) : (
            <ReplayEmptyState message="No previous frame to compare." />
          )
        ) : (
          canvasBody
        )}
      </div>
    </div>
  );
}
