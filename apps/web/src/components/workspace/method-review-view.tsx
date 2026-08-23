"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackingMetrics } from "@/components/teaching/tracking-metrics";
import { ReadonlyMarkdownRendererSuspense } from "@/components/artifacts/readonly-markdown-renderer-lazy";
import { selectReviewCanvasMarkdown } from "@/lib/workspace/review-canvas";
import { WorkspaceSiteHeader } from "@/components/teaching/workspace-site-header";

type ReviewPayload = {
  participant: {
    assignment: { title: string };
  };
  thread: {
    id: string;
    messages: Array<{ type?: string; role?: string; content?: unknown }>;
    artifact?: { contents?: Array<{ type?: string; fullMarkdown?: string }> };
  } | null;
  trackingEnabled: boolean;
};

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text || "")
            : ""
      )
      .join("");
  }
  return "";
}

export function MethodReviewView() {
  const params = useParams<{ id: string; participantItemId: string }>();
  const router = useRouter();
  const [payload, setPayload] = useState<ReviewPayload>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setPayload(undefined);
    setError(undefined);
    fetch(
      `/api/workspace/items/${encodeURIComponent(params.id)}/review/${encodeURIComponent(params.participantItemId)}`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 401 || response.status === 403
              ? "You cannot review this participant."
              : "Could not load review"
          );
        }
        const nextPayload = (await response.json()) as ReviewPayload;
        if (!cancelled) setPayload(nextPayload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load review"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, params.participantItemId]);

  const canvasContent = selectReviewCanvasMarkdown(payload?.thread?.artifact);
  const messages = (payload?.thread?.messages || []).map((message) => ({
    role:
      message.type === "human" || message.role === "human"
        ? "human"
        : "assistant",
    content: messageText(message.content),
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      <WorkspaceSiteHeader workspaceLabel="Review" maxWidthClass="max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </WorkspaceSiteHeader>
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!payload && !error && (
          <p className="text-sm text-muted-foreground">Loading review…</p>
        )}
        {payload && (
          <>
            <h1 className="text-2xl font-semibold">
              {payload.participant.assignment.title}
            </h1>
            {payload.trackingEnabled && payload.thread && (
              <TrackingMetrics threadId={payload.thread.id} />
            )}
            {payload.thread ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="min-h-[560px]">
                  <CardHeader>
                    <CardTitle>Transcript</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {messages.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No messages yet.
                      </p>
                    )}
                    {messages.map((message, index) => (
                      <p key={index} className="text-sm whitespace-pre-wrap">
                        <span className="font-medium">{message.role}:</span>{" "}
                        {message.content}
                      </p>
                    ))}
                  </CardContent>
                </Card>
                <Card className="min-h-[560px]">
                  <CardHeader>
                    <CardTitle>Canvas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ReadonlyMarkdownRendererSuspense
                      markdown={canvasContent}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This participant has not started yet.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
