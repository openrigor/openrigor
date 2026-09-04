"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Invitation } from "@/lib/teaching/types";
import { useTranslations } from "next-intl";

function statusBadgeVariant(
  status: Invitation["status"]
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "accepted":
      return "default";
    case "expired":
      return "destructive";
    default:
      return "outline";
  }
}

function formatStatus(
  status: Invitation["status"],
  translate?: (key: string) => string
): string {
  return (
    translate?.(`status.${status}`) ??
    status.charAt(0).toUpperCase() + status.slice(1)
  );
}

interface InviteByEmailPanelProps {
  /** API path for GET list + POST invite */
  apiPath: string;
  emailLabel: string;
  emailPlaceholder?: string;
  emptyListMessage: string;
  successVerb?: string;
  onInvited?: () => void;
}

export function InviteByEmailPanel({
  apiPath,
  emailLabel,
  emailPlaceholder = "colleague@school.edu",
  emptyListMessage,
  successVerb,
  onInvited,
}: InviteByEmailPanelProps) {
  const t = useTranslations("admin");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  const loadInvitations = useCallback(async () => {
    setLoadingInvitations(true);

    try {
      const res = await fetch(apiPath);
      const data = await res.json();

      if (res.ok) {
        setInvitations(data.invitations ?? []);
      }
    } catch {
      // Non-fatal — form still works without the list.
    } finally {
      setLoadingInvitations(false);
    }
  }, [apiPath]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setFeedback(null);

    const trimmedEmail = email.trim();

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error ?? t("couldNotSendInvitation"),
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `${successVerb ?? t("invitationSentTo")} ${trimmedEmail}`,
      });
      setEmail("");
      await loadInvitations();
      onInvited?.();
    } catch {
      setFeedback({
        type: "error",
        message: t("couldNotSendInvitation"),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-email">{emailLabel}</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={emailPlaceholder}
            required
            disabled={sending}
          />
        </div>

        {feedback && (
          <p
            className={`text-sm ${feedback.type === "success" ? "text-green-600" : "text-destructive"}`}
            role="alert"
          >
            {feedback.message}
          </p>
        )}

        <Button type="submit" disabled={sending}>
          {sending ? t("sending") : t("invite")}
        </Button>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("recentInvitations")}</h3>
        {loadingInvitations ? (
          <p className="text-sm text-muted-foreground">
            {t("loadingInvitations")}
          </p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyListMessage}</p>
        ) : (
          <div className="divide-y rounded-md border">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {invitation.email}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("sentDate", {
                      date: new Date(
                        invitation.created_at
                      ).toLocaleDateString(),
                    })}
                  </div>
                </div>
                <Badge variant={statusBadgeVariant(invitation.status)}>
                  {formatStatus(invitation.status, t)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface InviteTeacherDialogProps {
  onInvited?: () => void;
}

/** Org admin → teacher invites (API: /api/admin/teachers/invitations). */
export function InviteTeacherDialog({ onInvited }: InviteTeacherDialogProps) {
  const t = useTranslations("admin");
  return (
    <InviteByEmailPanel
      apiPath="/api/admin/teachers/invitations"
      emailLabel={t("teacherEmail")}
      emailPlaceholder="teacher@school.edu"
      emptyListMessage={t("noTeacherInvitations")}
      onInvited={onInvited}
    />
  );
}

interface InviteAdminDialogProps {
  onInvited?: () => void;
}

/** Owner → org admin invites (API: /api/owner/invitations). */
export function InviteAdminDialog({ onInvited }: InviteAdminDialogProps) {
  const t = useTranslations("admin");
  return (
    <InviteByEmailPanel
      apiPath="/api/owner/invitations"
      emailLabel={t("adminEmail")}
      emailPlaceholder="admin@school.edu"
      emptyListMessage={t("noAdminInvitations")}
      onInvited={onInvited}
    />
  );
}
