"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { StudentClassData } from "@/lib/teaching/types";
import { ClassRoster } from "./class-roster";

interface InviteStudentsPanelProps {
  onInvited?: () => void;
  formId?: string;
  showInlineActions?: boolean;
  onStateChange?: (state: { sending: boolean; hasResult: boolean }) => void;
}

interface InviteResult {
  invited: number;
  existing: number;
  failed: number;
  invalid: number;
  emailed?: number;
  errors?: { email: string; reason: string }[];
  manualLinks?: { email: string; actionLink: string; reason?: string }[];
}

function countInvalidEmails(text: string): number {
  const entries = text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.filter((entry) => !entry.includes("@")).length;
}

export function InviteStudentsPanel({
  onInvited,
  formId,
  showInlineActions = true,
  onStateChange,
}: InviteStudentsPanelProps) {
  const { toast } = useToast();
  const [emails, setEmails] = useState("");
  const [className, setClassName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [invitedClass, setInvitedClass] = useState<StudentClassData | null>(
    null
  );

  useEffect(() => {
    onStateChange?.({ sending, hasResult: result !== null });
  }, [sending, result, onStateChange]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setResult(null);
    setInvitedClass(null);

    try {
      const res = await fetch("/api/teacher/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, className: className.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Invitations failed",
          description: data.error ?? "Could not send invitations",
          variant: "destructive",
        });
        return;
      }

      const summary: InviteResult = {
        invited: data.invited ?? 0,
        existing: data.existing ?? 0,
        failed: data.failed ?? 0,
        invalid: data.invalid ?? countInvalidEmails(emails),
        emailed: data.emailed ?? data.invited ?? 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
        manualLinks: Array.isArray(data.manualLinks) ? data.manualLinks : [],
      };

      setResult(summary);
      if (data.class) {
        setInvitedClass(data.class as StudentClassData);
      }

      const failParts = [
        summary.failed > 0 ? `${summary.failed} failed` : null,
        summary.invalid > 0 ? `${summary.invalid} invalid` : null,
        summary.manualLinks && summary.manualLinks.length > 0
          ? `${summary.manualLinks.length} need manual link (${summary.manualLinks[0].reason ?? "email not sent"})`
          : null,
      ].filter(Boolean);

      toast({
        title: "Invitations processed",
        description: `${summary.invited} invited (${summary.emailed ?? 0} emailed), ${summary.existing} already registered${failParts.length ? `, ${failParts.join(", ")}` : ""}`,
        variant: summary.failed > 0 ? "destructive" : "default",
      });
      onInvited?.();
    } catch {
      toast({
        title: "Invitations failed",
        description: "Could not send invitations",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="class-name">Class name</Label>
        <Input
          id="class-name"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          placeholder="English 10A"
          required
          disabled={sending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="student-emails">Student emails</Label>
        <Textarea
          id="student-emails"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"student1@school.edu\nstudent2@school.edu"}
          rows={6}
          required
          disabled={sending}
        />
        <p className="text-xs text-muted-foreground">
          Enter email addresses, separated by comma, newline, or semicolon.
        </p>
      </div>

      {result && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          <p className="text-green-700">
            {result.invited} invited
            {typeof result.emailed === "number"
              ? ` (${result.emailed} emailed)`
              : ""}
          </p>
          {result.existing > 0 && (
            <p className="text-muted-foreground">
              {result.existing} already registered
            </p>
          )}
          {result.invalid > 0 && (
            <p className="text-destructive">{result.invalid} invalid</p>
          )}
          {result.failed > 0 && (
            <div className="text-destructive space-y-1">
              <p>{result.failed} failed</p>
              {result.errors?.map((entry) => (
                <p key={entry.email} className="text-xs">
                  {entry.email}: {entry.reason}
                </p>
              ))}
            </div>
          )}
          {result.manualLinks && result.manualLinks.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-amber-700">
                Email not sent — share these links manually:
              </p>
              {result.manualLinks.map((entry) => (
                <p key={entry.email} className="text-xs break-all">
                  <span className="font-medium">{entry.email}</span>
                  {entry.reason ? ` (${entry.reason})` : ""}:{" "}
                  <a
                    href={entry.actionLink}
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    accept link
                  </a>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {invitedClass && (
        <ClassRoster
          classId={invitedClass.id}
          className={invitedClass.name}
          students={invitedClass.students}
        />
      )}

      {showInlineActions && (
        <div className="flex justify-end">
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Invite"}
          </Button>
        </div>
      )}
    </form>
  );
}
