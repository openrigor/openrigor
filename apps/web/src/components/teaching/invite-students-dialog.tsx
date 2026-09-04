"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InviteStudentsPanel } from "./invite-students-panel";
import { useTranslations } from "next-intl";

interface InviteStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void;
}

export function InviteStudentsDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteStudentsDialogProps) {
  const t = useTranslations("teaching");
  const commonT = useTranslations("common");
  const [formState, setFormState] = useState({
    sending: false,
    hasResult: false,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("inviteStudents")}</DialogTitle>
          <DialogDescription>
            {t("createClassInviteStudentsByEmail")}
          </DialogDescription>
        </DialogHeader>
        <InviteStudentsPanel
          key={open ? "open" : "closed"}
          formId="invite-students-form"
          showInlineActions={false}
          onStateChange={setFormState}
          onInvited={onInvited}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={formState.sending}
          >
            {formState.hasResult ? t("close") : commonT("cancel")}
          </Button>
          <Button
            type="submit"
            form="invite-students-form"
            disabled={formState.sending}
          >
            {formState.sending ? t("sending") : t("invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
