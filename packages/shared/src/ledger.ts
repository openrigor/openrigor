/**
 * Package-neutral contracts for the persisted Evidence Ledger workspace data.
 * Resolver-specific manifest detail stays in the web package; this module holds
 * the stable values that need to cross a package boundary.
 */

export type EvidenceLedgerBucket =
  | "Included"
  | "Outside declared scope"
  | "Unknown"
  | "Unavailable"
  | "Resolver exclusion";

export type LedgerScopeFilter =
  | {
      fieldId: string;
      control: "multi-select";
      values: string[];
    }
  | {
      fieldId: string;
      control: "range";
      min?: string | number;
      max?: string | number;
    };

export interface LedgerConfig {
  methodId: string;
  methodVersion: string;
  templateId: string;
  templateVersion: string;
  filters: LedgerScopeFilter[];
}

/**
 * A sealed snapshot's shared header. `manifest` is intentionally opaque here:
 * its source-linked resolver representation belongs to the web resolver.
 */
export interface LedgerSnapshotData {
  ledgerId: string;
  methodId: string;
  methodVersion: string;
  templateId: string;
  templateVersion: string;
  filters: LedgerScopeFilter[];
  manifest: unknown;
  inputFingerprint: string;
  renderHash: string;
  buckets: Record<EvidenceLedgerBucket, number>;
  predicate: string;
  generatedAt: string;
  resolverVersion: string;
  sourceCommit: string;
}

export interface LedgerPublicationRef {
  status: "draft" | "merged";
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  mergedAt?: string;
}
