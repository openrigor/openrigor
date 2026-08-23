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
import { Badge } from "@/components/ui/badge";
import { Send, FileText, MessageSquare, AlertTriangle } from "lucide-react";

interface SubmitAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  assignmentTitle: string;
  wordCount: number;
  wordTarget?: number;
  messageCount: number;
  isSubmitting: boolean;
}

export function SubmitAssignmentDialog({
  open,
  onOpenChange,
  onConfirm,
  assignmentTitle,
  wordCount,
  wordTarget,
  messageCount,
  isSubmitting,
}: SubmitAssignmentDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Submit Assignment
          </DialogTitle>
          <DialogDescription>
            You&apos;re about to submit &ldquo;{assignmentTitle}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Word count:</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {wordCount}
                {wordTarget ? ` / ${wordTarget}` : ""} words
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Chat exchanges:</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {messageCount} messages with your coach
              </Badge>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 border-l-4 border-orange-200 bg-orange-50/50 rounded-r-lg">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800">
              Once submitted, you can no longer edit your work.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Assignment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
