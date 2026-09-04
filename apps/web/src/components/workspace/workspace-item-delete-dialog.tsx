"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function WorkspaceItemDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  itemTitle,
  isDeleting,
  confirmLabel = "Delete item",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  itemTitle: string;
  isDeleting: boolean;
  confirmLabel?: "Delete item" | "Abandon";
}) {
  const t = useTranslations("workspace");
  const isAbandon = confirmLabel === "Abandon";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {isAbandon ? t("abandonItem") : t("deleteItem")}
          </DialogTitle>
          <DialogDescription>
            {t("permanentlyRemove", { itemTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-r-lg border-l-4 border-orange-200 bg-orange-50/50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <p className="text-sm text-orange-800">
            {t("deleteDocumentWarning")}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("deleting")}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {isAbandon ? t("abandon") : t("deleteItem")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
