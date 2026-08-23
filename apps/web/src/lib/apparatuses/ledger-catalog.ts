export type LedgerMethodMetadata = {
  id: string;
  version: string;
  title: string;
  description?: string;
  evidenceTemplate?: { id: string; version: string };
};

export type LedgerCatalogStatus =
  | { status: "Ledger ready" }
  | {
      status: "Unavailable";
      reason:
        | "No evidence template"
        | "No accepted evidence"
        | "Missing method metadata";
    };

export function deriveLedgerCatalogStatus(
  methodMeta: LedgerMethodMetadata | undefined,
  acceptedCount: number
): LedgerCatalogStatus {
  if (!methodMeta?.id || !methodMeta.version || !methodMeta.title) {
    return { status: "Unavailable", reason: "Missing method metadata" };
  }
  if (
    !methodMeta.evidenceTemplate?.id ||
    !methodMeta.evidenceTemplate.version
  ) {
    return { status: "Unavailable", reason: "No evidence template" };
  }
  if (!Number.isFinite(acceptedCount) || acceptedCount <= 0) {
    return { status: "Unavailable", reason: "No accepted evidence" };
  }
  return { status: "Ledger ready" };
}

export type LedgerCatalogResult = {
  id: string;
  title: string;
  description: string;
  kind: "ledger";
  disabled?: boolean;
  status?: string;
  methodVersion: string;
  evidenceTemplate?: { id: string; version: string };
  acceptedEvidenceCount: number;
  reason?: string;
};

export function toLedgerCatalogResult(
  methodMeta: LedgerMethodMetadata | undefined,
  acceptedCount: number
): LedgerCatalogResult {
  const status = deriveLedgerCatalogStatus(methodMeta, acceptedCount);
  const title = methodMeta?.title || methodMeta?.id || "Unknown method";
  const description = methodMeta?.description || "Published research method";
  return {
    id: methodMeta?.id || "",
    title,
    description,
    kind: "ledger",
    methodVersion: methodMeta?.version || "",
    evidenceTemplate: methodMeta?.evidenceTemplate,
    acceptedEvidenceCount: Number.isFinite(acceptedCount) ? acceptedCount : 0,
    status: status.status,
    ...(status.status === "Unavailable" ? { reason: status.reason } : {}),
    disabled: status.status !== "Ledger ready",
  };
}
