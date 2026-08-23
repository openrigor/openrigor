"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Invitation } from "@/lib/teaching/types";

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

function formatStatus(status: Invitation["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
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
  successVerb = "Invitation sent to",
  onInvited,
}: InviteByEmailPanelProps) {
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
          message: data.error ?? "Could not send invitation",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `${successVerb} ${trimmedEmail}`,
      });
      setEmail("");
      await loadInvitations();
      onInvited?.();
    } catch {
      setFeedback({
        type: "error",
        message: "Could not send invitation",
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
          {sending ? "Sending…" : "Invite"}
        </Button>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Recent invitations</h3>
        {loadingInvitations ? (
          <p className="text-sm text-muted-foreground">Loading invitations…</p>
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
                    Sent {new Date(invitation.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant={statusBadgeVariant(invitation.status)}>
                  {formatStatus(invitation.status)}
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
  return (
    <InviteByEmailPanel
      apiPath="/api/admin/teachers/invitations"
      emailLabel="Teacher email"
      emailPlaceholder="teacher@school.edu"
      emptyListMessage="No teacher invitations sent yet."
      onInvited={onInvited}
    />
  );
}

interface InviteAdminDialogProps {
  onInvited?: () => void;
}

/** Owner → org admin invites (API: /api/owner/invitations). */
export function InviteAdminDialog({ onInvited }: InviteAdminDialogProps) {
  return (
    <InviteByEmailPanel
      apiPath="/api/owner/invitations"
      emailLabel="Admin email"
      emailPlaceholder="admin@school.edu"
      emptyListMessage="No admin invitations sent yet."
      onInvited={onInvited}
    />
  );
}
