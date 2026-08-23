import type { ApparatusEvidenceTemplate } from "@/lib/apparatuses/catalog";
import { getApparatusById } from "@/lib/apparatuses/registry";
import { FormValidationError, validateFormValues } from "./form-validation";
import type {
  FormFieldDefinition,
  FormValue,
  MethodWorkspaceItem,
} from "./types";

export const EVIDENCE_PRODUCER = "canvas-evidence-runtime/0.1";
export const NOT_RECORDED = "not recorded — unavailable in runtime snapshot";

export type EvidenceValue = string | number | null;

export type EvidenceSnapshot = {
  kind: "evidence";
  templateId: "evidence-template";
  templateVersion: string;
  defaultStage?: string;
  sourcePath: string;
  guidance: string;
  layoutMarkdown: string;
  fields: Record<string, FormFieldDefinition>;
  frozenValues: Record<string, EvidenceValue>;
  methodId: string;
  methodVersion: string;
  workspaceItemId: string;
  runId: string;
};

export class EvidenceUnavailableError extends Error {
  constructor() {
    super("Evidence is unavailable for this method");
    this.name = "EvidenceUnavailableError";
  }
}

export class EvidenceRunNotConcludedError extends Error {
  constructor() {
    super("Evidence requires a concluded method run");
    this.name = "EvidenceRunNotConcludedError";
  }
}

type FrozenRunSnapshot = {
  frozen_run: {
    method: { id: string; version: string };
    workspace_item_guid: string;
    profile: { id: string };
    levers: string;
    canvas: { version: string };
    started_at: string;
    concluded_at: string;
    participant_count: number;
    analytics: Record<string, string>;
    provenance: { transcript_retention: string };
  };
  collection: {
    eligible_owner_count: number;
    invited_owner_count: number;
    responded_owner_count: number;
    opened_at: string;
    submitted_at: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Convert the catalog's snake_case evidence contract to the UI form shape. */
export function normalizeEvidenceTemplate(
  template: ApparatusEvidenceTemplate
): Omit<
  EvidenceSnapshot,
  "frozenValues" | "methodId" | "methodVersion" | "workspaceItemId" | "runId"
> {
  const fields: Record<string, FormFieldDefinition> = {};
  for (const [id, rawDefinition] of Object.entries(template.fields)) {
    const definition = rawDefinition;
    const type = definition.type;
    if (
      type !== "text" &&
      type !== "textarea" &&
      type !== "select" &&
      type !== "number" &&
      type !== "date"
    ) {
      throw new Error(`Invalid evidence field type for ${id}`);
    }

    const label = optionalString(definition.label) ?? id;
    const field: FormFieldDefinition = {
      id,
      label,
      type,
      required: definition.required === true,
      ...(definition.read_only === true ? { readOnly: true } : {}),
      ...(optionalString(definition.source)
        ? { source: definition.source as string }
        : {}),
    };
    const maxLength = optionalNumber(definition.max_length);
    const displayChars = optionalNumber(definition.display_chars);
    const displayLines = optionalNumber(definition.display_lines);
    const min = optionalNumber(definition.min);
    const max = optionalNumber(definition.max);
    const minDate = optionalString(definition.min_date);
    const maxDate = optionalString(definition.max_date);
    if (maxLength !== undefined) field.maxLength = maxLength;
    if (displayChars !== undefined) field.displayChars = displayChars;
    if (displayLines !== undefined) field.displayLines = displayLines;
    if (min !== undefined) field.min = min;
    if (max !== undefined) field.max = max;
    if (minDate !== undefined) field.minDate = minDate;
    if (maxDate !== undefined) field.maxDate = maxDate;
    if (Array.isArray(definition.options)) {
      field.options = definition.options.filter(
        (option): option is string => typeof option === "string"
      );
    }
    if (definition.ledger_dimension) {
      field.ledgerDimension = definition.ledger_dimension;
    }
    if (definition.missing_semantics !== undefined) {
      field.missingSemantics = definition.missing_semantics;
    }
    fields[id] = field;
  }

  return {
    kind: "evidence",
    templateId: "evidence-template",
    templateVersion: template.version,
    ...(template.defaultStage ? { defaultStage: template.defaultStage } : {}),
    sourcePath: template.sourcePath,
    guidance: template.guidance,
    layoutMarkdown: template.layoutMarkdown,
    fields,
  };
}

function notRecordedFor(field: FormFieldDefinition): EvidenceValue {
  return field.type === "number" ? null : NOT_RECORDED;
}

function concludedAt(item: MethodWorkspaceItem): string {
  return item.submission?.submittedAt ?? NOT_RECORDED;
}

/** Resolve only values present in the concluded run; unavailable telemetry stays unavailable. */
export function resolveFrozenRunValues(
  item: MethodWorkspaceItem
): FrozenRunSnapshot {
  const run = item.run;
  if (!run) throw new Error("Evidence requires a method run");
  const participants = Array.isArray(run.participants) ? run.participants : [];
  const invited = participants.filter(
    (participant) =>
      participant.invitationStatus === "sent" ||
      participant.invitationStatus === "accepted"
  ).length;
  const responded = participants.filter(
    (participant) => participant.submissionStatus === "submitted"
  ).length;
  const methodId = run.methodId || item.methodSource.id;
  const methodVersion = run.methodVersion || item.methodSource.version;

  return {
    frozen_run: {
      method: { id: methodId, version: methodVersion },
      workspace_item_guid: item.id,
      profile: { id: run.profileId },
      levers: JSON.stringify(run.apparatusConfiguration),
      canvas: {
        version: item.templateSnapshot.catalogRevision || NOT_RECORDED,
      },
      started_at: run.launchedAt || NOT_RECORDED,
      concluded_at: concludedAt(item),
      participant_count: participants.length,
      analytics: {
        dialogic_contribution_summary: NOT_RECORDED,
        drafting_gate_outcome: NOT_RECORDED,
        process_signal_summary: NOT_RECORDED,
        assignment_outcome_summary: NOT_RECORDED,
      },
      provenance: { transcript_retention: NOT_RECORDED },
    },
    collection: {
      eligible_owner_count: participants.length,
      invited_owner_count: invited,
      responded_owner_count: responded,
      opened_at: run.launchedAt || NOT_RECORDED,
      submitted_at: concludedAt(item),
    },
  };
}

function valueAtPath(root: unknown, path: string): EvidenceValue | undefined {
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }
  if (typeof current === "string" || typeof current === "number") {
    return current;
  }
  if (current === null) return null;
  return undefined;
}

export function resolveEvidenceFieldValues(
  fields: Record<string, FormFieldDefinition>,
  frozenRun: FrozenRunSnapshot
): Record<string, EvidenceValue> {
  const values: Record<string, EvidenceValue> = {};
  for (const [fieldId, field] of Object.entries(fields)) {
    if (!field.readOnly) continue;
    const resolved = field.source
      ? valueAtPath(frozenRun, field.source)
      : undefined;
    values[fieldId] = resolved === undefined ? notRecordedFor(field) : resolved;
  }
  return values;
}

export function buildEvidenceSnapshot(
  item: MethodWorkspaceItem
): EvidenceSnapshot {
  if (!item.run || item.submission?.status !== "submitted") {
    throw new EvidenceRunNotConcludedError();
  }
  const catalogEntry = getApparatusById(item.methodSource.id);
  const template = catalogEntry?.evidence_template;
  if (!template) {
    throw new EvidenceUnavailableError();
  }
  const normalized = normalizeEvidenceTemplate(template);
  const frozenRun = resolveFrozenRunValues(item);
  return {
    ...normalized,
    frozenValues: resolveEvidenceFieldValues(normalized.fields, frozenRun),
    methodId: frozenRun.frozen_run.method.id,
    methodVersion: frozenRun.frozen_run.method.version,
    workspaceItemId: item.id,
    runId: item.run.id,
  };
}

export type EvidenceThreadMarker = {
  method_id: string;
  method_version: string;
  template_version: string;
  frozen_values: Record<string, EvidenceValue>;
};

/** Rebuild the catalog layout while retaining the values stamped at creation. */
export function buildEvidenceSnapshotFromMarker(
  item: MethodWorkspaceItem,
  marker: unknown
): EvidenceSnapshot {
  if (
    !isRecord(marker) ||
    typeof marker.method_id !== "string" ||
    typeof marker.method_version !== "string" ||
    typeof marker.template_version !== "string" ||
    !isRecord(marker.frozen_values)
  ) {
    throw new EvidenceUnavailableError();
  }
  const catalogEntry = getApparatusById(item.methodSource.id);
  const template = catalogEntry?.evidence_template;
  if (!template) throw new EvidenceUnavailableError();
  const frozenValues: Record<string, EvidenceValue> = {};
  for (const [fieldId, value] of Object.entries(marker.frozen_values)) {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      value !== null
    ) {
      throw new EvidenceUnavailableError();
    }
    frozenValues[fieldId] = value;
  }
  const normalized = normalizeEvidenceTemplate(template);
  return {
    ...normalized,
    templateVersion: marker.template_version,
    frozenValues,
    // The method version is the one stamped at thread creation (resolved from
    // the concluded run snapshot then), NOT the current methodSource.version —
    // the latter can drift if a new method version ships after the run.
    methodId: marker.method_id,
    methodVersion: marker.method_version,
    workspaceItemId: item.id,
    runId: item.run?.id ?? "unknown",
  };
}

export type ValidatedEvidenceSubmission = {
  values: Record<string, EvidenceValue | FormValue>;
  stage: string;
};

/** Validate editable owner declarations while replacing every frozen field. */
export function validateEvidenceSubmission(
  snapshot: EvidenceSnapshot,
  rawValues: unknown
): ValidatedEvidenceSubmission {
  if (!isRecord(rawValues)) {
    throw new FormValidationError([
      { fieldId: "_form", message: "Submit values as an object." },
    ]);
  }

  const editableFields = Object.fromEntries(
    Object.entries(snapshot.fields).filter(([, field]) => !field.readOnly)
  );
  const editableRaw = Object.fromEntries(
    Object.entries(rawValues).filter(([fieldId]) => editableFields[fieldId])
  );
  const issues: { fieldId: string; message: string }[] = [];
  let editableValues: Record<string, FormValue> = {};
  try {
    editableValues = validateFormValues(editableFields, editableRaw);
  } catch (error) {
    if (!(error instanceof FormValidationError)) throw error;
    issues.push(...error.issues);
  }

  const values: Record<string, EvidenceValue | FormValue> = {
    ...editableValues,
  };
  for (const [fieldId, field] of Object.entries(snapshot.fields)) {
    if (field.readOnly) {
      values[fieldId] = snapshot.frozenValues[fieldId] ?? notRecordedFor(field);
    }
  }

  const publication = values.publication_authorisation;
  if (publication !== "confirmed-authorised-to-publish") {
    issues.push({
      fieldId: "publication_authorisation",
      message: "Public authorisation must be confirmed before submission.",
    });
  }
  const anonymisation = values.anonymisation_status;
  if (
    anonymisation !== "confirmed-no-student-identifiers-or-raw-student-material"
  ) {
    issues.push({
      fieldId: "anonymisation_status",
      message:
        "A confirmed declaration with no student identifiers or raw student material is required.",
    });
  }

  if (
    !snapshot.methodId ||
    !snapshot.methodVersion ||
    !snapshot.workspaceItemId ||
    !snapshot.runId ||
    !snapshot.sourcePath
  ) {
    issues.push({
      fieldId: "_provenance",
      message: "Runtime provenance is unavailable; submission is blocked.",
    });
  }

  const stageValue = values.contribution_stage;
  const stage =
    typeof stageValue === "string" && stageValue
      ? stageValue
      : snapshot.defaultStage || "documented-experience";
  if (issues.length) throw new FormValidationError(issues);
  return { values, stage };
}

function markdownValue(value: EvidenceValue | FormValue | undefined): string {
  if (Array.isArray(value)) return value.join(", ");
  return value === null || value === undefined ? "" : String(value);
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

export function resolveEvidenceMarkdown(
  layoutMarkdown: string,
  values: Record<string, EvidenceValue | FormValue>
): string {
  return layoutMarkdown.replace(
    /\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_token, fieldId: string) => escapeMarkdown(markdownValue(values[fieldId]))
  );
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function safeMethodPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function evidenceTimestampSlug(value: string | Date): string {
  const iso = (value instanceof Date ? value : new Date(value)).toISOString();
  return iso.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

export function evidenceFilePath(
  methodId: string,
  timestampSlug: string
): string {
  return `methods/${safeMethodPathSegment(methodId)}/evidence/${timestampSlug}.en.md`;
}

export type EvidenceAssemblyInput = {
  snapshot: EvidenceSnapshot;
  values: Record<string, EvidenceValue | FormValue>;
  stage: string;
  generatedAt: string;
  /** Stable slug reused across retries so the in-file `id` equals the filename. */
  timestampSlug?: string;
};

export function assembleEvidenceMarkdown(input: EvidenceAssemblyInput): string {
  const { snapshot, values, stage, generatedAt } = input;
  // On a retry the submission key (and thus the filename) was fixed at the
  // first attempt; derive the in-file id from it so the two never disagree.
  const timestampSlug =
    input.timestampSlug ?? evidenceTimestampSlug(generatedAt);
  const description = `Evidence contribution for ${snapshot.methodId} concluded run`;
  const levers = resolveFrozenRunValuesFromFieldValues(snapshot, values);
  const frontmatter = [
    "---",
    "type: Evidence Contribution",
    `id: ${yamlScalar(timestampSlug)}`,
    "lang: en",
    `description: ${yamlScalar(description)}`,
    "status: draft",
    `stage: ${yamlScalar(stage)}`,
    "generated:",
    `  by: ${yamlScalar(EVIDENCE_PRODUCER)}`,
    `  at: ${yamlScalar(generatedAt)}`,
    `publication_authorisation: ${yamlScalar(
      markdownValue(values.publication_authorisation)
    )}`,
    `anonymisation_status: ${yamlScalar(
      markdownValue(values.anonymisation_status)
    )}`,
    `data_sharing_limits: ${yamlScalar(
      markdownValue(values.data_sharing_limits)
    )}`,
    "method:",
    `  id: ${yamlScalar(snapshot.methodId)}`,
    `  version: ${yamlScalar(snapshot.methodVersion)}`,
    `  levers: ${levers}`,
    `  canvas: ${yamlScalar(
      markdownValue(snapshot.frozenValues.canvas_version)
    )}`,
    "provenance:",
    `  source_path: ${yamlScalar(snapshot.sourcePath)}`,
    `  template_id: ${yamlScalar(snapshot.templateId)}`,
    `  template_version: ${yamlScalar(snapshot.templateVersion)}`,
    `  workspace_item_id: ${yamlScalar(snapshot.workspaceItemId)}`,
    `  run_id: ${yamlScalar(snapshot.runId)}`,
    "---",
    "",
  ].join("\n");
  const body = resolveEvidenceMarkdown(snapshot.layoutMarkdown, values);
  const provenanceBlock = [
    "",
    "## Runtime provenance — system-authored",
    "",
    `- Evidence template: ${snapshot.templateId}@${snapshot.templateVersion}`,
    `- Evidence template source: ${snapshot.sourcePath}`,
    `- Workspace item: ${snapshot.workspaceItemId}`,
    `- Concluded run: ${snapshot.runId}`,
    `- Generated by: ${EVIDENCE_PRODUCER}`,
    "",
  ].join("\n");
  return `${frontmatter}${body}${provenanceBlock}`;
}

function resolveFrozenRunValuesFromFieldValues(
  snapshot: EvidenceSnapshot,
  _values: Record<string, EvidenceValue | FormValue>
): string {
  const candidate = snapshot.frozenValues.resolved_levers;
  if (typeof candidate === "string" && candidate.startsWith("{")) {
    return candidate;
  }
  return JSON.stringify({});
}

const EVIDENCE_STAGE_ORDER = [
  "documented-experience",
  "structured-experiment",
  "replication",
  "challenge",
];

export function isAutoMergeEligibleStage(stage: string): boolean {
  return (
    EVIDENCE_STAGE_ORDER.indexOf(stage) >= 0 &&
    EVIDENCE_STAGE_ORDER.indexOf(stage) <=
      EVIDENCE_STAGE_ORDER.indexOf("documented-experience")
  );
}

export function shouldAutoMergeEvidence(input: {
  stage: string;
  provenancePresent: boolean;
  consentPresent: boolean;
  okfLintPassed: boolean;
}): boolean {
  return (
    input.provenancePresent &&
    input.consentPresent &&
    input.okfLintPassed &&
    isAutoMergeEligibleStage(input.stage)
  );
}
