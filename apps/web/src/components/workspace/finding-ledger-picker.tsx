"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MergedLedger } from "@/lib/workspace/ledger-reference";

export function FindingLedgerPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (ledger: MergedLedger) => void;
}) {
  const [ledgers, setLedgers] = useState<MergedLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    setLedgers([]);
    fetch("/api/workspace/published-ledgers", { credentials: "include" })
      .then(async (response) => {
        if (response.status === 503) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!response.ok) throw new Error("Could not list published ledgers");
        const body = (await response.json()) as { ledgers?: MergedLedger[] };
        if (!cancelled) setLedgers(body.ledgers || []);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        data-testid="finding-ledger-picker"
      >
        <DialogHeader>
          <DialogTitle>Cite a published evidence ledger</DialogTitle>
          <DialogDescription>
            Inserts a read-only reference card and an evidence_ledgers entry.
            Research questions are selected independently.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading published ledgers…
          </p>
        )}
        {!loading && unavailable && (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="ledger-picker-unavailable"
          >
            Ledger picker unavailable
          </p>
        )}
        {!loading && !unavailable && ledgers.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No merged evidence ledgers are published yet.
          </p>
        )}
        {!loading && !unavailable && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {ledgers.map((ledger) => (
              <button
                key={ledger.id}
                type="button"
                className="w-full rounded-lg border p-4 text-left transition hover:bg-muted/50"
                onClick={() => {
                  onSelect(ledger);
                  onOpenChange(false);
                }}
              >
                <div className="font-medium">{ledger.title}</div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {ledger.id} · {ledger.method.id}@{ledger.method.version} ·{" "}
                  {ledger.evidence_template.id}@
                  {ledger.evidence_template.version}
                </p>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
