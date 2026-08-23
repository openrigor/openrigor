"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assignmentMetaLine } from "@/lib/teaching/sample-assignments";
import { getAssignmentByIdIncludingCustom } from "@/lib/teaching/assignment-store";
import { getAssignmentRegistry } from "@/lib/teaching/assignment-registry";
import { assignmentIdsForStudent } from "@/lib/teaching/student-assignment-list";
import { useUserContext } from "@/contexts/UserContext";
import type {
  AssignmentCompletionStatus,
  StudentAssignment,
} from "@/lib/teaching/types";
import { createSelfInitiatedAssignment } from "@/lib/teaching/assignment-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, LogOut, PlusCircle } from "lucide-react";
import { DOCS_URL } from "@/components/auth/login/login-branding";
import { useRouter } from "next/navigation";
import { canAccessStudentDashboard } from "@/lib/teaching/teacher-utils";
import { postLoginPath } from "@/lib/teaching/config";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { Thread } from "@langchain/langgraph-sdk";
import {
  WorkspaceSiteHeader,
  workspaceNavGhostClass,
} from "./workspace-site-header";

function statusFromThread(thread?: Thread): AssignmentCompletionStatus {
  if (!thread) return "not_started";
  const meta = thread.metadata as Record<string, unknown>;
  if (meta?.abandoned) return "abandoned";
  const pct =
    meta?.completionPercent != null ? Number(meta.completionPercent) : 0;
  if (pct >= 100) return "submitted";
  if (pct > 0) return "in_progress";
  return "not_started";
}

function statusLabel(status: AssignmentCompletionStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_progress":
      return "In progress";
    case "abandoned":
      return "Abandoned";
    default:
      return "Not started";
  }
}

function statusBadgeVariant(
  status: AssignmentCompletionStatus
): "default" | "secondary" | "outline" {
  switch (status) {
    case "submitted":
      return "default";
    case "in_progress":
      return "secondary";
    default:
      return "outline";
  }
}

interface AssignmentWithThread extends StudentAssignment {
  thread?: Thread;
}

export function StudentAssignmentsLanding() {
  const { getActiveThread, getUserThreads } = useThreadContext();
  const { user, loading: userLoading } = useUserContext();
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentWithThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selfInitOpen, setSelfInitOpen] = useState(false);
  const [selfInitTitle, setSelfInitTitle] = useState("");
  const [selfInitPrompt, setSelfInitPrompt] = useState("");
  const [selfInitSubmitting, setSelfInitSubmitting] = useState(false);
  const [selfInitError, setSelfInitError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !canAccessStudentDashboard(user)) {
      router.replace(postLoginPath(user));
    }
  }, [user, router]);

  useEffect(() => {
    // Don't start loading until auth is resolved
    if (userLoading) return;
    if (user && !canAccessStudentDashboard(user)) return;
    let cancelled = false;

    async function loadAssignments() {
      try {
        setError(null);
        await getUserThreads();
        const results: AssignmentWithThread[] = [];

        // Only assignments in the registry for this student (seeds included
        // only if a teacher explicitly assigned them — never auto-injected).
        const allAssignments: StudentAssignment[] = [];

        if (user?.id) {
          let registry = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              registry = await getAssignmentRegistry();
              break;
            } catch (e) {
              if (attempt === 2) {
                console.error(
                  "[StudentAssignments] Registry fetch failed after 3 attempts:",
                  e
                );
                if (!cancelled)
                  setError(
                    "Could not load your assignment list. Try refreshing the page."
                  );
              }
            }
          }

          if (registry) {
            for (const assignmentId of assignmentIdsForStudent(
              registry,
              user.id
            )) {
              const assignment =
                await getAssignmentByIdIncludingCustom(assignmentId);
              if (
                assignment &&
                !allAssignments.some((a) => a.id === assignment.id)
              ) {
                allAssignments.push(assignment);
              }
            }
          }
        }

        for (const assignment of allAssignments) {
          const thread = await getActiveThread(assignment.id);
          const completionPercent =
            (thread?.metadata as Record<string, unknown>)?.completionPercent !=
            null
              ? Number(
                  (thread?.metadata as Record<string, unknown>)
                    ?.completionPercent
                )
              : 0;

          results.push({
            ...assignment,
            completionPercent,
            status: statusFromThread(thread),
            thread,
          });
        }

        if (!cancelled) {
          setAssignments(results);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAssignments();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userLoading]);

  const handleSelfInitiate = async () => {
    if (!selfInitTitle.trim() || !selfInitPrompt.trim()) {
      setSelfInitError("Give your assignment a title and a prompt.");
      return;
    }
    setSelfInitSubmitting(true);
    setSelfInitError(null);
    try {
      const created = await createSelfInitiatedAssignment({
        title: selfInitTitle.trim(),
        prompt: selfInitPrompt.trim(),
        agentInstructions:
          "Act as an AI co-creator and Socratic coach. Help the student develop their own work through questions, challenges and reflection — and prepare them to explain and defend their decisions in an oral defence. Do not ghostwrite the answer.",
      });
      if (!created) {
        throw new Error("No assignment returned");
      }
      setSelfInitOpen(false);
      setSelfInitTitle("");
      setSelfInitPrompt("");
      router.push(`/student/assignment/${created.id}`);
    } catch (e) {
      console.error("[SelfInitiate] failed:", e);
      setSelfInitError(
        e instanceof Error ? e.message : "Something went wrong. Try again."
      );
    } finally {
      setSelfInitSubmitting(false);
    }
  };

  const activeCount = useMemo(
    () =>
      assignments.filter(
        (a) => a.status !== "submitted" && a.status !== "abandoned"
      ).length,
    [assignments]
  );

  // After all hooks — early return must not precede useEffect/useMemo (Rules of Hooks).
  if (user && !canAccessStudentDashboard(user)) return null;

  const headerActions = (
    <>
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={workspaceNavGhostClass}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Docs
      </a>
      <Link href="/auth/signout" className={workspaceNavGhostClass}>
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </Link>
    </>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <WorkspaceSiteHeader workspaceLabel="Student workspace">
          {headerActions}
        </WorkspaceSiteHeader>
        <main className="container mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading assignments…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <WorkspaceSiteHeader workspaceLabel="Student workspace">
        {headerActions}
      </WorkspaceSiteHeader>

      <main className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your assignments
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignments.length === 0
              ? "No assignments yet. Your teacher will assign work here."
              : activeCount === 0
                ? "You're caught up for now."
                : `${activeCount} assignment${activeCount === 1 ? "" : "s"} to work on.`}
          </p>
        </div>

        <div className="mb-8 flex justify-center">
          <Button variant="outline" onClick={() => setSelfInitOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            Start your own assignment
          </Button>
        </div>
        <div className="mb-8 text-center text-xs text-muted-foreground">
          Create your own assignment-style workspace and prepare it with an AI
          coach — right through to explaining and defending your work.
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
            {error}
          </div>
        )}

        <ul className="flex flex-col items-center gap-4">
          {assignments.map((assignment) => {
            let buttonText: string;
            if (!assignment.thread) {
              buttonText = "Start assignment";
            } else {
              const meta = assignment.thread.metadata as Record<
                string,
                unknown
              >;
              if (meta?.completionPercent === 100) {
                buttonText = "Review submission";
              } else {
                buttonText = "Continue assignment";
              }
            }

            const meta = assignment.thread?.metadata as Record<string, unknown>;
            const isSubmitted = meta?.completionPercent === 100;
            const href = assignment.thread
              ? `/student/assignment/${assignment.id}?threadId=${assignment.thread.thread_id}${isSubmitted ? "&readonly=1" : ""}`
              : `/student/assignment/${assignment.id}`;

            return (
              <li key={assignment.id} className="w-full max-w-2xl">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardDescription className="text-xs font-medium uppercase tracking-wide">
                          {assignmentMetaLine(assignment)}
                        </CardDescription>
                        <CardTitle className="text-lg">
                          {assignment.title}
                        </CardTitle>
                      </div>
                      <Badge variant={statusBadgeVariant(assignment.status)}>
                        {statusLabel(assignment.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {assignment.prompt}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Completion</span>
                        <span>{assignment.completionPercent}%</span>
                      </div>
                      <Progress value={assignment.completionPercent} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={href}>{buttonText}</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      </main>

      <Dialog open={selfInitOpen} onOpenChange={setSelfInitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start your own assignment</DialogTitle>
            <DialogDescription>
              Create an assignment-style workspace and work on it with an AI
              coach — build the work yourself, then prepare to explain and
              defend it in an oral defence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="self-title">Title</Label>
              <Input
                id="self-title"
                value={selfInitTitle}
                onChange={(e) => setSelfInitTitle(e.target.value)}
                placeholder="e.g. Why AI shouldn't replace the essay"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="self-prompt">Assignment prompt</Label>
              <Textarea
                id="self-prompt"
                value={selfInitPrompt}
                onChange={(e) => setSelfInitPrompt(e.target.value)}
                placeholder="Describe what you want to work on or prepare for…"
                rows={4}
              />
            </div>
            {selfInitError && (
              <p className="text-sm text-red-600">{selfInitError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelfInitOpen(false)}
              disabled={selfInitSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSelfInitiate} disabled={selfInitSubmitting}>
              {selfInitSubmitting ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
