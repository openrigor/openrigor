"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Keyboard,
  ClipboardPaste,
  Clock,
  Layers,
  MousePointerClick,
  EyeOff,
  Type,
  Scissors,
  Copy,
} from "lucide-react";

interface SessionMetrics {
  sessionId: string;
  startTime: number | null;
  endTime: number | null;
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
  canvasReplace: number;
  focusCount: number;
  blurCount: number;
  visibilityHidden: number;
}

interface AggregatedMetrics {
  threadId: string;
  sessionCount: number;
  totalTimeMs: number;
  firstActivity: number | null;
  lastActivity: number | null;
  totalKeystrokes: number;
  totalTypingBursts: number;
  totalBurstWords: number;
  avgBurstDurationMs: number;
  totalPasteEvents: number;
  totalPastedChars: number;
  totalCopyEvents: number;
  totalCutEvents: number;
  totalCanvasEdits: number;
  totalCanvasInsertions: number;
  totalCanvasDeletions: number;
  totalCanvasReplace: number;
  totalFocus: number;
  totalBlur: number;
  totalVisibilityHidden: number;
  sessions: SessionMetrics[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricBadge({
  icon: Icon,
  label,
  value,
  variant: _variant = "secondary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  variant?: "default" | "secondary" | "outline" | "destructive";
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  );
}

interface TrackingMetricsProps {
  threadId: string;
}

export function TrackingMetrics({ threadId }: TrackingMetricsProps) {
  const t = useTranslations("teaching");
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch(`/api/tracking/metrics?threadId=${threadId}`);
        if (!res.ok) throw new Error(t("failedToFetchMetrics"));
        const data = await res.json();
        setMetrics(data);
      } catch (err) {
        setError(t("couldNotLoadTrackingData"));
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, [threadId, t]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("engagementMetrics")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("engagementMetrics")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || t("noTrackingData")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (metrics.sessionCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("engagementMetrics")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("noTrackingSessions")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Compute derived insights
  const pasteRatio =
    metrics.totalKeystrokes > 0
      ? Math.round(
          (metrics.totalPastedChars /
            (metrics.totalKeystrokes + metrics.totalPastedChars)) *
            100
        )
      : 0;

  const avgWordsPerBurst =
    metrics.totalTypingBursts > 0
      ? Math.round(metrics.totalBurstWords / metrics.totalTypingBursts)
      : 0;

  return (
    <Card data-testid="teacher-review-metrics">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t("engagementMetrics")}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {metrics.firstActivity && (
              <span>
                {t("started", { date: formatDate(metrics.firstActivity) })}
              </span>
            )}
            {metrics.lastActivity &&
              metrics.firstActivity !== metrics.lastActivity && (
                <>
                  <span>→</span>
                  <span>
                    {t("last", { date: formatDate(metrics.lastActivity) })}
                  </span>
                </>
              )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricBadge
            icon={Clock}
            label={t("totalTime")}
            value={formatDuration(metrics.totalTimeMs)}
          />
          <MetricBadge
            icon={Layers}
            label={t("sessions")}
            value={metrics.sessionCount}
          />
          <MetricBadge
            icon={Keyboard}
            label={t("keystrokes")}
            value={metrics.totalKeystrokes.toLocaleString()}
          />
          <MetricBadge
            icon={Type}
            label={t("typingBursts")}
            value={metrics.totalTypingBursts}
          />
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricBadge
            icon={ClipboardPaste}
            label={t("pasteEvents")}
            value={metrics.totalPasteEvents}
            variant={metrics.totalPasteEvents > 5 ? "destructive" : "secondary"}
          />
          <MetricBadge
            icon={Copy}
            label={t("copyEvents")}
            value={metrics.totalCopyEvents}
          />
          <MetricBadge
            icon={Scissors}
            label={t("cutEvents")}
            value={metrics.totalCutEvents}
          />
          <MetricBadge
            icon={MousePointerClick}
            label={t("workspaceEdits")}
            value={metrics.totalCanvasEdits}
          />
        </div>

        {/* Insights row */}
        <div className="flex flex-wrap gap-2">
          {pasteRatio > 30 && (
            <Badge variant="destructive" className="text-xs">
              {t("highPasteRatio", { percent: pasteRatio })}
            </Badge>
          )}
          {metrics.totalVisibilityHidden > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <EyeOff className="h-3 w-3" />
              {t("tabHidden", { count: metrics.totalVisibilityHidden })}
            </Badge>
          )}
          {avgWordsPerBurst > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("wordsPerTypingBurst", { count: avgWordsPerBurst })}
            </Badge>
          )}
          {metrics.avgBurstDurationMs > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("averageBurst", {
                duration: formatDuration(metrics.avgBurstDurationMs),
              })}
            </Badge>
          )}
          {metrics.totalCanvasInsertions > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("insertionsAndDeletions", {
                insertions: metrics.totalCanvasInsertions,
                deletions: metrics.totalCanvasDeletions,
              })}
            </Badge>
          )}
        </div>

        {/* Session timeline */}
        {metrics.sessions.length > 1 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("sessionTimeline")}
            </h4>
            <div className="space-y-1.5">
              {metrics.sessions
                .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
                .map((session) => {
                  const maxDuration = Math.max(
                    ...metrics.sessions.map((s) => s.durationMs)
                  );
                  const barWidth =
                    maxDuration > 0
                      ? Math.max(5, (session.durationMs / maxDuration) * 100)
                      : 5;

                  return (
                    <div
                      key={session.sessionId}
                      className="flex items-center gap-3 text-xs"
                    >
                      <span className="w-28 shrink-0 text-muted-foreground truncate">
                        {session.startTime
                          ? formatDate(session.startTime)
                          : t("unknown")}
                      </span>
                      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-muted-foreground">
                        {formatDuration(session.durationMs)}
                      </span>
                      <span className="w-20 shrink-0 text-right text-muted-foreground">
                        {t("keys", { count: session.keystrokes })}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
