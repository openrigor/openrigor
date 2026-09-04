"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { closeCustomAssignment } from "@/lib/teaching/assignment-store";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

type CloseAssignmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  assignmentTitle: string;
  onClosed?: () => void;
};

export function CloseAssignmentDialog({
  open,
  onOpenChange,
  assignmentId,
  assignmentTitle,
  onClosed,
}: CloseAssignmentDialogProps) {
  const t = useTranslations("teaching");
  const commonT = useTranslations("common");
  const { toast } = useToast();
  const [usefulness, setUsefulness] = useState("4");
  const [wouldPay, setWouldPay] = useState("3");
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUsefulness("4");
    setWouldPay("3");
    setFreeText("");
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    const usefulnessN = Number(usefulness);
    if (!Number.isFinite(usefulnessN) || usefulnessN < 1 || usefulnessN > 5) {
      toast({
        title: t("surveyIncomplete"),
        description: t("rateUsefulnessError"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const surveyRes = await fetch("/api/teaching/closeout-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          usefulness: usefulnessN,
          wouldPayForPremium: Number(wouldPay) || 3,
          freeText: freeText.trim() || undefined,
        }),
      });
      if (!surveyRes.ok) {
        const body = (await surveyRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? t("surveySaveFailed"));
      }

      await closeCustomAssignment(assignmentId);
      toast({
        title: t("assignmentClosed"),
        description: t("assignmentClosedDescription", {
          title: assignmentTitle,
        }),
      });
      onOpenChange(false);
      reset();
      onClosed?.();
    } catch (error) {
      console.error("Failed to close assignment:", error);
      toast({
        title: t("closeFailed"),
        description:
          error instanceof Error ? error.message : t("couldNotCloseAssignment"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        data-testid="close-assignment-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("closeAssignment")}</DialogTitle>
          <DialogDescription>
            {t("closingAssignmentDescription", { title: assignmentTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="closeout-usefulness">
              {t("usefulnessQuestion")}
            </Label>
            <select
              id="closeout-usefulness"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={usefulness}
              onChange={(e) => setUsefulness(e.target.value)}
              data-testid="closeout-usefulness"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closeout-would-pay">
              {t("futureAiProfileQuestion")}
            </Label>
            <select
              id="closeout-would-pay"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={wouldPay}
              onChange={(e) => setWouldPay(e.target.value)}
              data-testid="closeout-would-pay"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closeout-free-text">
              {t("anythingElseOptional")}
            </Label>
            <Textarea
              id="closeout-free-text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={t("closeoutPlaceholder")}
              rows={3}
              data-testid="closeout-free-text"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {commonT("cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            data-testid="confirm-close-assignment"
          >
            {submitting ? t("closing") : t("submitAndClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
