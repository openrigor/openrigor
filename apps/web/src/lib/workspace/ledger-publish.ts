import { createHash } from "node:crypto";
import type { LedgerConfig, LedgerSnapshotData } from "@opencanvas/shared";
import type { EvidenceSnapshot } from "./evidence";
import { validateEvidenceSubmission } from "./evidence";
import { FormValidationError } from "./form-validation";
import { ledgerEvidenceFilePath } from "./ledger-paths";
import {
  ledgerScopeTitle,
  renderLedgerSnapshotBody,
} from "@/components/workspace/ledger-snapshot-markdown";

export { ledgerScopeTitle };

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderLedgerBody(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  return renderLedgerSnapshotBody(snapshot, config);
}

export function ledgerRenderHash(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  return sha256(renderLedgerBody(snapshot, config));
}

export function renderLedgerMarkdown(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  const body = renderLedgerBody(snapshot, config);
  const renderHash = snapshot.renderHash || sha256(body);
  return [
    "---",
    "type: Evidence Ledger",
    `id: ${yamlScalar(snapshot.ledgerId)}`,
    "lang: en",
    "origin: native",
    "status: stable",
    `title: ${yamlScalar(ledgerScopeTitle(snapshot, config))}`,
    "description: Source-linked descriptive ledger for one Method and declared evidence scope.",
    `method: { id: ${yamlScalar(snapshot.methodId)}, version: ${yamlScalar(snapshot.methodVersion)} }`,
    `evidence_template: { id: ${yamlScalar(snapshot.templateId)}, version: ${yamlScalar(snapshot.templateVersion)} }`,
    `scope: ${yamlScalar(snapshot.predicate)}`,
    `source_commit: ${yamlScalar(snapshot.sourceCommit)}`,
    `input_fingerprint: ${yamlScalar(snapshot.inputFingerprint)}`,
    `render_hash: ${yamlScalar(renderHash)}`,
    `resolver_version: ${yamlScalar(snapshot.resolverVersion)}`,
    `generated: { by: ${yamlScalar(`evaluchat-ledger-service/${snapshot.resolverVersion}`)}, at: ${yamlScalar(snapshot.generatedAt)} }`,
    "---",
    "",
    body,
  ].join("\n");
}

/**
 * Reuse the evidence-submission validator for the public-safety
 * declarations. A ledger has no mutable evidence narrative; its sealed
 * manifest supplies the immutable provenance values.
 */
export function validateLedgerPublicationDeclarations(
  snapshot: LedgerSnapshotData,
  rawValues: unknown
) {
  const evidenceSnapshot: EvidenceSnapshot = {
    kind: "evidence",
    templateId: "evidence-template",
    templateVersion: snapshot.templateVersion,
    sourcePath: ledgerEvidenceFilePath(snapshot.ledgerId, snapshot.methodId),
    guidance: "",
    layoutMarkdown: "",
    fields: {
      publication_authorisation: {
        id: "publication_authorisation",
        label: "Public authorisation",
        type: "select",
        required: true,
        options: [
          "confirmed-authorised-to-publish",
          "not-confirmed-do-not-submit",
        ],
      },
      anonymisation_status: {
        id: "anonymisation_status",
        label: "Anonymisation",
        type: "select",
        required: true,
        options: [
          "confirmed-no-student-identifiers-or-raw-student-material",
          "needs-human-privacy-review",
        ],
      },
      public_data_declaration: {
        id: "public_data_declaration",
        label: "Public data declaration",
        type: "select",
        required: true,
        options: ["confirmed-public-data", "not-confirmed-do-not-submit"],
      },
    },
    frozenValues: {},
    methodId: snapshot.methodId,
    methodVersion: snapshot.methodVersion,
    workspaceItemId: snapshot.ledgerId,
    runId: snapshot.inputFingerprint,
  };
  const validated = validateEvidenceSubmission(evidenceSnapshot, rawValues);
  if (validated.values.public_data_declaration !== "confirmed-public-data") {
    throw new FormValidationError([
      {
        fieldId: "public_data_declaration",
        message:
          "A confirmed public data declaration is required before publication.",
      },
    ]);
  }
  return validated;
}
