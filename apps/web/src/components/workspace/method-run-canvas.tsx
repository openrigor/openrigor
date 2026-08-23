"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MethodWorkspaceItem } from "@/lib/workspace/types";
import {
  methodParticipantOpenHref,
  workspaceItemTitle,
} from "@/lib/workspace/display";
import { publicMethodPageUrl } from "@/lib/workspace/method-links";
import { useUserContext } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";

export function MethodRunCanvas({ item }: { item: MethodWorkspaceItem }) {
  const router = useRouter();
  const { user } = useUserContext();
  const { toast } = useToast();
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const run = item.run;
  const assignment = run?.assignment;
  const participants = run?.participants ?? [];
  const ready = participants.filter(
    (participant) => participant.submissionStatus === "submitted"
  );
  const awaiting = participants.filter(
    (participant) => participant.submissionStatus !== "submitted"
  );
  const ownParticipant = participants.find(
    (participant) => participant.userId === user?.id
  );
  const ownAssignmentHref =
    ownParticipant &&
    methodParticipantOpenHref(item.id, ownParticipant, user?.id);
  const methodHref = publicMethodPageUrl(item.methodSource.id);
  const methodTitle =
    item.methodSource.title || run?.methodId || item.methodSource.id;

  async function openEvidence() {
    setIsEvidenceLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/evidence`,
        { method: "POST", credentials: "include" }
      );
      const body = (await response.json()) as {
        threadId?: string;
        error?: string;
      };
      if (!response.ok || !body.threadId) {
        throw new Error(body.error || "Could not open evidence");
      }
      const params = new URLSearchParams({
        evidence: body.threadId,
        threadId: body.threadId,
      });
      router.push(`/workspace/items/${item.id}?${params.toString()}`);
    } catch (error) {
      toast({
        title: "Could not open evidence",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEvidenceLoading(false);
    }
  }

  async function abandonItem() {
    setIsAbandoning(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Could not abandon workspace item");
      router.push("/workspace");
    } catch (error) {
      toast({
        title: "Could not abandon item",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAbandoning(false);
    }
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50">
      <WorkspaceItemBanner item={item} onAbandon={() => setAbandonOpen(true)} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">
              {assignment?.title || workspaceItemTitle(item)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {participants.length} invited · {ready.length} submitted
            </p>
          </div>
          {ownAssignmentHref && (
            <Button asChild>
              <Link href={ownAssignmentHref} data-testid="open-own-assignment">
                Open assignment
              </Link>
            </Button>
          )}
          {item.submission?.status === "submitted" && run && (
            <Button
              onClick={() => void openEvidence()}
              disabled={isEvidenceLoading}
              data-testid="open-evidence"
            >
              {isEvidenceLoading ? "Opening…" : "Evidence"}
            </Button>
          )}
        </div>
        <Card data-testid="assignment-method-details">
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Method:</span>{" "}
              <a
                href={methodHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {methodTitle}
              </a>
            </p>
            {item.methodSource.description && (
              <p className="text-muted-foreground">
                {item.methodSource.description}
              </p>
            )}
            {assignment && (
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Course</dt>
                  <dd>{assignment.course || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd>{assignment.dueDate || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Word target</dt>
                  <dd>{assignment.wordTarget || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Group</dt>
                  <dd>{assignment.group || "—"}</dd>
                </div>
              </dl>
            )}
            {assignment?.prompt && (
              <div>
                <p className="font-medium">Prompt</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {assignment.prompt}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ready for review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ready.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No submissions yet.
              </p>
            )}
            {ready.map((participant) => {
              const href = methodParticipantOpenHref(
                item.id,
                participant,
                user?.id
              );
              return (
                <div
                  key={participant.email}
                  className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{participant.email}</p>
                    <Badge variant="secondary">Submitted</Badge>
                  </div>
                  {href && (
                    <Button asChild size="sm">
                      <Link href={href}>
                        {participant.userId === user?.id ? "Open" : "Review"}
                      </Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Awaiting response</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {awaiting.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Everyone has submitted.
              </p>
            )}
            {awaiting.map((participant) => {
              const href = methodParticipantOpenHref(
                item.id,
                participant,
                user?.id
              );
              return (
                <div
                  key={participant.email}
                  className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{participant.email}</p>
                    <Badge variant="outline">
                      {participant.invitationStatus === "sent"
                        ? "Invite sent"
                        : participant.submissionStatus === "in_progress"
                          ? "In progress"
                          : "Not started"}
                    </Badge>
                  </div>
                  {href && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>
                        {participant.userId === user?.id
                          ? "Open assignment"
                          : "Open"}
                      </Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
      <WorkspaceItemDeleteDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        onConfirm={() => void abandonItem()}
        itemTitle={assignment?.title || workspaceItemTitle(item)}
        isDeleting={isAbandoning}
        confirmLabel="Abandon"
      />
    </div>
  );
}
