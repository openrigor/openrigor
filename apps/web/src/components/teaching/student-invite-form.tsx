"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function parseEmailList(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0 && email.includes("@"))
    )
  );
}

interface StudentInviteFormProps {
  className?: string;
  defaultClassName?: string;
  onInvited?: () => void;
}

export function StudentInviteForm({
  className,
  defaultClassName = "",
  onInvited,
}: StudentInviteFormProps) {
  const [emailsText, setEmailsText] = useState("");
  const [classNameValue, setClassNameValue] = useState(defaultClassName);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    invited: number;
    existing: number;
    failed: number;
    errors?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);

    const emails = parseEmailList(emailsText);
    const trimmedClassName = classNameValue.trim();

    if (!trimmedClassName) {
      setError("Class name is required");
      setSending(false);
      return;
    }

    if (emails.length === 0) {
      setError("Enter at least one valid email address");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/teacher/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: emailsText,
          className: trimmedClassName,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not send invitations");
        return;
      }

      setResult({
        invited: data.invited ?? 0,
        existing: data.existing ?? 0,
        failed: data.failed ?? 0,
      });
      setEmailsText("");
      onInvited?.();
    } catch {
      setError("Could not send invitations");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className ?? ""}`}>
      <div className="space-y-2">
        <Label htmlFor="invite-class-name">Class name</Label>
        <Input
          id="invite-class-name"
          value={classNameValue}
          onChange={(e) => setClassNameValue(e.target.value)}
          placeholder="English 10A"
          required
          disabled={sending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-emails">Student emails</Label>
        <Textarea
          id="invite-emails"
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder="student1@school.edu&#10;student2@school.edu"
          rows={6}
          required
          disabled={sending}
        />
        <p className="text-xs text-muted-foreground">
          Separate emails with commas, semicolons, or new lines.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-green-700">{result.invited} invited</p>
          {result.existing > 0 && (
            <p className="text-muted-foreground">
              {result.existing} already registered
            </p>
          )}
          {result.failed > 0 && (
            <p className="text-destructive">{result.failed} failed</p>
          )}
        </div>
      )}

      <Button type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send invites"}
      </Button>
    </form>
  );
}
