"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { publicationAccessError } from "@/lib/workspace/ledger-publication";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";
import {
  LedgerPublicationDeclarations,
  ledgerDeclarationRequestValues,
  useLedgerPublicationDeclarations,
} from "./ledger-publication-declarations";

type Publication = NonNullable<LedgerSnapshotWorkspaceItem["publication"]>;

export function LedgerPublishDialog({
  item,
  open,
  onOpenChange,
  onPublished,
  rePublish = false,
}: {
  item: LedgerSnapshotWorkspaceItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (publication: Publication) => void;
  rePublish?: boolean;
}) {
  const {
    declarations,
    setDeclarations,
    declarationsConfirmed,
    resetDeclarations,
  } = useLedgerPublicationDeclarations();
  const [error, setError] = useState<string>();
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (!open) return;
    resetDeclarations();
    setError(undefined);
  }, [open, rePublish, resetDeclarations]);

  async function publish() {
    setIsPublishing(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...(rePublish ? { rePublish: true } : {}),
            values: ledgerDeclarationRequestValues(declarations),
          }),
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        publication?: Publication;
        error?: string;
        reason?: string;
        issues?: Array<{ message?: string }>;
      };
      if (!response.ok || !body.publication) {
        const validationError = body.issues
          ?.map((issue) => issue.message)
          .filter(Boolean)
          .join(" ");
        throw new Error(
          validationError ||
            body.error ||
            publicationAccessError(body.reason) ||
            "Could not publish the ledger snapshot."
        );
      }
      onPublished(body.publication);
      onOpenChange(false);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Could not publish the ledger snapshot."
      );
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isPublishing) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        data-testid="ledger-publish-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {rePublish ? "Republish sealed Ledger Snapshot" : "Create draft PR"}
          </DialogTitle>
          <DialogDescription>
            Create one draft PR under your connected GitHub identity. It will
            not merge automatically.
          </DialogDescription>
        </DialogHeader>
        <LedgerPublicationDeclarations
          values={declarations}
          onChange={setDeclarations}
          variant="checkbox"
          legend="Publication-safety declarations"
        />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void publish()}
            disabled={!declarationsConfirmed || isPublishing}
            data-testid="ledger-confirm-publish"
          >
            {isPublishing ? "Creating draft PR…" : "Create draft PR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
