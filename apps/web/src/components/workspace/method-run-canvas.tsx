"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { MethodCitation } from "./method-citation";

export function MethodRunCanvas({ item }: { item: MethodWorkspaceItem }) {
  const t = useTranslations("workspace");
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
        throw new Error(body.error || t("couldNotOpenEvidence"));
      }
      const params = new URLSearchParams({
        evidence: body.threadId,
        threadId: body.threadId,
      });
      router.push(`/workspace/items/${item.id}?${params.toString()}`);
    } catch (error) {
      toast({
        title: t("couldNotOpenEvidence"),
        description:
          error instanceof Error ? error.message : t("pleaseTryAgain"),
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
      if (!response.ok) throw new Error(t("couldNotAbandonWorkspaceItem"));
      router.push("/workspace");
    } catch (error) {
      toast({
        title: t("couldNotAbandonItem"),
        description:
          error instanceof Error ? error.message : t("pleaseTryAgain"),
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
                {t("openAssignment")}
              </Link>
            </Button>
          )}
          {item.submission?.status === "submitted" && run && (
            <Button
              onClick={() => void openEvidence()}
              disabled={isEvidenceLoading}
              data-testid="open-evidence"
            >
              {isEvidenceLoading ? t("opening") : t("evidence")}
            </Button>
          )}
        </div>
        <Card data-testid="assignment-method-details">
          <CardHeader>
            <CardTitle>{t("assignment")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{t("methodLabel")}:</span>{" "}
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
            <MethodCitation
              method={{
                name: item.methodSource.title,
                version: item.methodSource.version,
                profiles: item.methodSource.profiles,
                publication_date: item.methodSource.publication_date,
              }}
            />
            {assignment && (
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("course")}</dt>
                  <dd>{assignment.course || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("due")}</dt>
                  <dd>{assignment.dueDate || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("wordTarget")}</dt>
                  <dd>{assignment.wordTarget || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("group")}</dt>
                  <dd>{assignment.group || "—"}</dd>
                </div>
              </dl>
            )}
            {assignment?.prompt && (
              <div>
                <p className="font-medium">{t("prompt")}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {assignment.prompt}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("readyForReview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ready.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("noSubmissionsYet")}
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
                    <Badge variant="secondary">{t("submitted")}</Badge>
                  </div>
                  {href && (
                    <Button asChild size="sm">
                      <Link href={href}>
                        {participant.userId === user?.id
                          ? t("open")
                          : t("review")}
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
            <CardTitle>{t("awaitingResponse")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {awaiting.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("everyoneSubmitted")}
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
                        ? t("inviteSent")
                        : participant.submissionStatus === "in_progress"
                          ? t("inProgress")
                          : t("notStarted")}
                    </Badge>
                  </div>
                  {href && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>
                        {participant.userId === user?.id
                          ? t("openAssignment")
                          : t("open")}
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
