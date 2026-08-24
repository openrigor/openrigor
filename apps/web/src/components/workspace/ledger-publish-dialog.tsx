"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const privateDestination = item.source.privateRepository !== undefined;

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
          <DialogTitle className="flex items-center gap-2">
            {privateDestination
              ? "Commit private Ledger Snapshot"
              : rePublish
                ? "Republish sealed Ledger Snapshot"
                : "Create draft PR"}
            {privateDestination && <Badge variant="secondary">Private</Badge>}
          </DialogTitle>
          <DialogDescription>
            {privateDestination
              ? "Commit the sealed ledger and manifest to the Method's private repository under your connected GitHub identity."
              : "Create one draft PR under your connected GitHub identity. It will not merge automatically."}
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
            {isPublishing
              ? privateDestination
                ? "Committing privately…"
                : "Creating draft PR…"
              : privateDestination
                ? "Commit privately"
                : "Create draft PR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
