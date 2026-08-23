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
          <DialogTitle>Invite students</DialogTitle>
          <DialogDescription>
            Create a class and invite students by email.
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
            {formState.hasResult ? "Close" : "Cancel"}
          </Button>
          <Button
            type="submit"
            form="invite-students-form"
            disabled={formState.sending}
          >
            {formState.sending ? "Sending…" : "Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
