"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";

interface AbandonAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  assignmentTitle: string;
  isAbandoning: boolean;
}

export function AbandonAssignmentDialog({
  open,
  onOpenChange,
  onConfirm,
  assignmentTitle,
  isAbandoning,
}: AbandonAssignmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Abandon Assignment
          </DialogTitle>
          <DialogDescription>
            You&apos;re about to abandon &ldquo;{assignmentTitle}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 border-l-4 border-orange-200 bg-orange-50/50 rounded-r-lg">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              Are you sure? Your progress will be lost and you&apos;ll start
              fresh next time.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAbandoning}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isAbandoning}
            className="gap-2"
          >
            {isAbandoning ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Abandoning...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Abandon Assignment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
