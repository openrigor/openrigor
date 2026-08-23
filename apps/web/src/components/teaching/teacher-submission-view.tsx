"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { getAssignmentByIdIncludingCustom } from "@/lib/teaching/assignment-store";
import { TeachingThreadMetadata } from "@/lib/teaching/types";
import { ArrowLeft } from "lucide-react";
import { TrackingMetrics } from "./tracking-metrics";
import { TeacherAssignmentBreadcrumb } from "./teacher-assignment-breadcrumb";
import { ReadonlyMarkdownRendererSuspense } from "@/components/artifacts/readonly-markdown-renderer-lazy";
import {
  CanvasReplayProvider,
  CanvasReplayControls,
  CanvasReplayChatContent,
  CanvasReplayCanvasContent,
} from "./canvas-replay";

interface TeacherSubmissionViewProps {
  assignmentId: string;
  threadId: string;
}

interface Message {
  role: "human" | "assistant";
  content: string;
  timestamp?: string;
}

/** Viewport-aware height: fills ~1080p main area below header, breadcrumb, and metrics. */
const REVIEW_PANEL_HEIGHT_CLASS = "h-[calc(100vh-24rem)] min-h-[560px]";
const REVIEW_CARD_HEADER_CLASS = "px-4 py-3";
const REVIEW_CARD_CONTENT_CLASS = "flex flex-1 flex-col min-h-0 p-4 pt-0";

export function TeacherSubmissionView({
  assignmentId,
  threadId,
}: TeacherSubmissionViewProps) {
  const router = useRouter();
  const { getThread } = useThreadContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [canvasContent, setCanvasContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [studentEmail, setStudentEmail] = useState<string>("Unknown Student");
  const [assignment, setAssignment] = useState<any>(null);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const staticChatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = staticChatScrollRef.current;
    if (!el || replayEnabled) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length, replayEnabled]);

  useEffect(() => {
    async function loadAssignmentAndSubmission() {
      try {
        // Load assignment first
        const assignmentData =
          await getAssignmentByIdIncludingCustom(assignmentId);
        setAssignment(assignmentData);

        if (!assignmentData) return;

        const threadData = await getThread(threadId);
        if (!threadData) {
          console.error("Thread not found");
          return;
        }

        // Get student email
        const metadata =
          threadData.metadata as unknown as TeachingThreadMetadata;
        if (metadata.supabase_user_id) {
          const studentsResponse = await fetch("/api/teacher/students");
          const studentsData = await studentsResponse.json();
          const student = studentsData.students?.find(
            (s: any) => s.id === metadata.supabase_user_id
          );
          if (student) {
            setStudentEmail(student.email);
          }
        }

        // Extract messages from thread values
        const values = threadData.values as Record<string, unknown>;
        if (values && values.messages) {
          const threadMessages: Message[] = (values.messages as any[]).map(
            (msg: any) => ({
              role: (msg.type === "human" ? "human" : "assistant") as
                | "human"
                | "assistant",
              content: msg.content,
              timestamp: msg.timestamp,
            })
          );
          setMessages(threadMessages);
        }

        // Extract canvas content from thread values
        if (values && values.artifact) {
          const art = values.artifact as Record<string, any>;
          // ArtifactV3 structure: { currentIndex, contents: [{ type, fullMarkdown }] }
          const active = art.contents?.find(
            (c: any) => c.index === (art.currentIndex ?? 1)
          );
          setCanvasContent(active?.fullMarkdown || "");
        }
      } catch (error) {
        console.error("Failed to load assignment and submission:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAssignmentAndSubmission();
  }, [assignmentId, threadId, getThread]);

  const handleBack = () => {
    router.push(`/teacher/assignment/${assignmentId}`);
  };

  if (!assignment) {
    return (
      <div className="container max-w-6xl px-4 py-10">
        <div className="text-center">
          <TeacherAssignmentBreadcrumb currentLabel="Assignment not found" />
          <h1 className="text-2xl font-bold mb-4">Assignment Not Found</h1>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Assignment
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container max-w-6xl px-4 py-10">
        <div className="space-y-4">
          <TeacherAssignmentBreadcrumb currentLabel="Loading…" />
          <Button onClick={handleBack} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Assignment
          </Button>
          <div className="text-sm text-muted-foreground">
            Loading submission...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <TeacherAssignmentBreadcrumb
            assignmentTitle={assignment.title}
            currentLabel={`Submission from ${studentEmail}`}
          />
          <div className="flex items-center gap-2">
            {assignment.apparatusConfiguration?.tracking !== false && (
              <Button
                type="button"
                variant={replayEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setReplayEnabled((enabled) => !enabled)}
              >
                Replay session
              </Button>
            )}
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assignment
            </Button>
          </div>
        </div>

        {assignment.apparatusConfiguration?.tracking !== false && (
          <div className="[&_[data-testid=teacher-review-metrics]>div]:!p-4 [&_[data-testid=teacher-review-metrics]>div:last-child]:!pt-0">
            <TrackingMetrics threadId={threadId} />
          </div>
        )}

        <CanvasReplayProvider threadId={threadId} enabled={replayEnabled}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat Transcript */}
            <Card
              className={`${REVIEW_PANEL_HEIGHT_CLASS} flex flex-col lg:col-span-1`}
              data-testid="teacher-review-chat-panel"
            >
              <CardHeader className={REVIEW_CARD_HEADER_CLASS}>
                <CardTitle className="text-lg">Chat Transcript</CardTitle>
              </CardHeader>
              <CardContent className={REVIEW_CARD_CONTENT_CLASS}>
                {replayEnabled ? (
                  <>
                    <div className="shrink-0">
                      <CanvasReplayControls />
                    </div>
                    <CanvasReplayChatContent />
                  </>
                ) : (
                  <div
                    ref={staticChatScrollRef}
                    className="flex-1 min-h-0 overflow-y-auto pr-2"
                  >
                    <div className="space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          No messages yet.
                        </div>
                      ) : (
                        messages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${
                              message.role === "human"
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                message.role === "human"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="whitespace-pre-wrap break-words">
                                {message.content}
                              </div>
                              {message.timestamp && (
                                <div className="text-xs opacity-70 mt-1">
                                  {new Date(
                                    message.timestamp
                                  ).toLocaleTimeString()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document content */}
            <Card
              className={`${REVIEW_PANEL_HEIGHT_CLASS} flex flex-col lg:col-span-2`}
              data-testid="teacher-review-canvas-panel"
            >
              <CardHeader className={REVIEW_CARD_HEADER_CLASS}>
                <CardTitle className="text-lg">Document content</CardTitle>
              </CardHeader>
              <CardContent className={REVIEW_CARD_CONTENT_CLASS}>
                {replayEnabled ? (
                  <div className="flex flex-1 min-h-0 flex-col">
                    <CanvasReplayCanvasContent />
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                    {canvasContent ? (
                      <ReadonlyMarkdownRendererSuspense
                        markdown={canvasContent}
                      />
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No canvas content yet.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CanvasReplayProvider>
      </div>
    </div>
  );
}
