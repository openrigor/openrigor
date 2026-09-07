"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("teaching");
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
      setError(t("classNameRequired"));
      setSending(false);
      return;
    }

    if (emails.length === 0) {
      setError(t("validEmailRequired"));
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
        setError(data.error ?? t("couldNotSendInvitations"));
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
      setError(t("couldNotSendInvitations"));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className ?? ""}`}>
      <div className="space-y-2">
        <Label htmlFor="invite-class-name">{t("className")}</Label>
        <Input
          id="invite-class-name"
          value={classNameValue}
          onChange={(e) => setClassNameValue(e.target.value)}
          placeholder={t("classNamePlaceholder")}
          required
          disabled={sending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-emails">{t("studentEmails")}</Label>
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
          {t("emailSeparationHint")}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-green-700">
            {t("invitedCount", { count: result.invited })}
          </p>
          {result.existing > 0 && (
            <p className="text-muted-foreground">
              {t("alreadyRegisteredCount", { count: result.existing })}
            </p>
          )}
          {result.failed > 0 && (
            <p className="text-destructive">
              {t("failedCount", { count: result.failed })}
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={sending}>
        {sending ? t("sending") : t("sendInvites")}
      </Button>
    </form>
  );
}
