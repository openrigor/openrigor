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
import {
  ledgerPublishRequestBody,
  publicationAccessError,
} from "@/lib/workspace/ledger-publication";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";

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
  const [authorised, setAuthorised] = useState(false);
  const [anonymised, setAnonymised] = useState(false);
  const [publicData, setPublicData] = useState(false);
  const [error, setError] = useState<string>();
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAuthorised(false);
    setAnonymised(false);
    setPublicData(false);
    setError(undefined);
  }, [open, rePublish]);

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
          body: JSON.stringify(
            ledgerPublishRequestBody({
              authorised,
              anonymised,
              publicData,
              rePublish,
            })
          ),
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

  const declarationsComplete = authorised && anonymised && publicData;

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
        <fieldset className="min-w-0 space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Public-safety declarations
          </legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={authorised}
              onChange={(event) => setAuthorised(event.target.checked)}
              data-testid="ledger-publication-authorisation"
            />
            I am authorised to publish this evidence ledger.
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={anonymised}
              onChange={(event) => setAnonymised(event.target.checked)}
              data-testid="ledger-anonymisation-status"
            />
            It contains no student identifiers or raw student material.
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={publicData}
              onChange={(event) => setPublicData(event.target.checked)}
              data-testid="ledger-public-data-declaration"
            />
            I confirm the rendered file is public data for evaluchat/research.
          </label>
        </fieldset>
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
            disabled={!declarationsComplete || isPublishing}
            data-testid="ledger-confirm-publish"
          >
            {isPublishing ? "Creating draft PR…" : "Create draft PR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
