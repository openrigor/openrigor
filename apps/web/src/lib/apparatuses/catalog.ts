/**
 * Apparatus catalog READ path.
 * Preferred source: build-time artifact `apps/web/data/apparatuses.generated.json`
 * (regenerate with `yarn generate:apparatus` / scripts/generate-apparatus-mirror.ts).
 * Fallback stub — used only by source consumers that have not generated the
 * checked-in artifact yet. A present artifact is always validated strictly.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  APPARATUS_CAPABILITIES,
  EVIDENCE_FIELD_TYPES,
  assertValidApparatusConfiguration,
  ledgerDimensionValidationError,
  type ApparatusCapability,
  type ApparatusEvidenceFieldDefinition,
  type ApparatusKnobDefinition,
  type ApparatusProfile,
  type ApparatusProvenance,
  type ApparatusRole,
} from "@opencanvas/shared";

export interface ApparatusCatalogUrls {
  spec: string;
  evidence: string;
  questions: string[];
}

export interface ApparatusPlatform {
  participant_invitations?: "required" | "optional" | "none";
  review_surface?: string;
}

export interface ApparatusEvidenceTemplate {
  id: "evidence-template";
  version: string;
  defaultStage?: string;
  fields: Record<string, ApparatusEvidenceFieldDefinition>;
  layoutMarkdown: string;
  guidance: string;
  sourcePath: string;
}

export interface ApparatusCatalogEntry {
  id: string;
  name: string;
  version: string;
  min_platform: string;
  min_canvas_version: string;
  status: string;
  research_questions: string[];
  roles: ApparatusRole[];
  required_capabilities: ApparatusCapability[];
  knobs: ApparatusKnobDefinition[];
  telemetry: string[];
  provenance: ApparatusProvenance;
  description: string;
  profiles: ApparatusProfile[];
  catalog_urls?: ApparatusCatalogUrls;
  run_brief_template?: string;
  evidence_template?: ApparatusEvidenceTemplate;
  platform?: ApparatusPlatform;
}

/** Fallback stub — regenerate with scripts/generate-apparatus-mirror.ts */
const FALLBACK_STUB_CATALOG: ApparatusCatalogEntry[] = [
  {
    id: "ai-assisted-essay",
    name: "Essays — constrained dialogic drafting (CAMDLE)",
    version: "0.1.0",
    min_platform: "0.6.0",
    min_canvas_version: "0.6.0",
    status: "stable",
    research_questions: ["threshold-calibration"],
    roles: ["student", "teacher", "org-admin"],
    required_capabilities: [
      "assignment-context",
      "student-authoring",
      "submission",
    ],
    knobs: [
      {
        id: "ai_assistance",
        type: "boolean",
        default: true,
        effect: "AI assistance",
      },
      {
        id: "ai_canvas_actions",
        type: "boolean",
        default: true,
        effect: "AI editing actions",
      },
      {
        id: "drafting_gate",
        type: "enum",
        values: ["none", "discussion-first", "thesis-approved"],
        default: "discussion-first",
        effect: "Drafting gate",
      },
      {
        id: "threshold",
        type: "integer",
        min: 0,
        max: 100,
        default: 4,
        effect: "Escape hatch threshold",
      },
      {
        id: "tracking",
        type: "boolean",
        default: true,
        effect: "Process telemetry",
      },
    ],
    telemetry: ["process_signals", "transcript", "output"],
    provenance: { sources: [] },
    description:
      "Constrained dialogic drafting: drafting support is gated behind dialogic contribution (CAMDLE). Investigates the threshold-calibration research question.",
    profiles: [],
  },
];

type ApparatusArtifact = {
  version: number;
  apparatuses: ApparatusCatalogEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EVIDENCE_FIELD_TYPE_SET = new Set<string>(EVIDENCE_FIELD_TYPES);

function validateEvidenceTemplate(entryId: string, template: unknown): void {
  const contractError = (field: string, message: string): never => {
    throw new Error(
      `Apparatus ${entryId} evidence_template${field ? ` ${field}` : ""} ${message}`
    );
  };

  const evidenceTemplate = isRecord(template)
    ? template
    : contractError("", "must be an object");

  if (typeof evidenceTemplate.id !== "string") {
    contractError("id", "must be a string");
  }
  if (evidenceTemplate.id !== "evidence-template") {
    contractError("id", "must be evidence-template");
  }
  if (
    typeof evidenceTemplate.version !== "string" ||
    !evidenceTemplate.version
  ) {
    contractError("version", "must be a non-empty string");
  }
  if (
    evidenceTemplate.defaultStage !== undefined &&
    typeof evidenceTemplate.defaultStage !== "string"
  ) {
    contractError("defaultStage", "must be a string");
  }
  if (!isRecord(evidenceTemplate.fields)) {
    contractError("fields", "must be an object");
  }
  const fields = evidenceTemplate.fields as Record<string, unknown>;
  for (const [fieldName, definition] of Object.entries(fields)) {
    if (!isRecord(definition)) {
      contractError(`fields.${fieldName}`, "must be an object");
    }
    const fieldDefinition = definition as Record<string, unknown>;
    const fieldType = fieldDefinition.type;
    if (
      typeof fieldType !== "string" ||
      !EVIDENCE_FIELD_TYPE_SET.has(fieldType)
    ) {
      contractError(
        `fields.${fieldName}.type`,
        "must be one of text, textarea, select, number, date"
      );
    }
    if (fieldType === "select") {
      const options = fieldDefinition.options;
      if (!Array.isArray(options)) {
        contractError(
          `fields.${fieldName}.options`,
          "must be present for select"
        );
      } else if (!options.every((option) => typeof option === "string")) {
        contractError(
          `fields.${fieldName}.options`,
          "must contain only strings"
        );
      }
    }
    const ledgerError = ledgerDimensionValidationError(fieldDefinition);
    if (ledgerError) {
      contractError(
        `fields.${fieldName}.${ledgerError.field}`,
        ledgerError.message
      );
    }
  }
  if (typeof evidenceTemplate.layoutMarkdown !== "string") {
    contractError("layoutMarkdown", "must be a string");
  }
  if (typeof evidenceTemplate.guidance !== "string") {
    contractError("guidance", "must be a string");
  }
  if (typeof evidenceTemplate.sourcePath !== "string") {
    contractError("sourcePath", "must be a string");
  }
}

function loadCatalog(): ApparatusCatalogEntry[] {
  const artifactPath = join(
    process.cwd(),
    "data",
    "apparatuses.generated.json"
  );
  if (!existsSync(artifactPath)) {
    return FALLBACK_STUB_CATALOG;
  }

  // A checked-in generated artifact is part of the build contract. Do not
  // silently fall back when it is malformed or violates the runtime schema:
  // publishing an invalid apparatus must fail CI/build rather than create a
  // server that appears healthy while ignoring the research configuration.
  const raw = readFileSync(artifactPath, "utf8");
  const parsed = JSON.parse(raw) as ApparatusArtifact;
  if (!Array.isArray(parsed.apparatuses)) {
    throw new Error(
      "Generated apparatus catalog must contain an apparatuses array"
    );
  }
  validateApparatusCatalog(parsed.apparatuses);
  return parsed.apparatuses;
}

export const APPARATUS_CATALOG: ApparatusCatalogEntry[] = loadCatalog();

/** Deterministic build-time validation for generated Research manifests. */
export function validateApparatusCatalog(
  entries: ApparatusCatalogEntry[],
  canvasVersion = "0.6.0"
): void {
  const known = new Set<string>();
  for (const entry of entries) {
    if (!/^[a-z0-9][a-z0-9-]+$/.test(entry.id)) {
      throw new Error(`Invalid apparatus id: ${entry.id}`);
    }
    if (known.has(entry.id))
      throw new Error(`Duplicate apparatus id: ${entry.id}`);
    known.add(entry.id);
    if (!entry.version || !entry.min_canvas_version) {
      throw new Error(`Apparatus ${entry.id} is missing version metadata`);
    }
    if (entry.evidence_template !== undefined) {
      validateEvidenceTemplate(entry.id, entry.evidence_template);
    }
    for (const capability of entry.required_capabilities) {
      if (!(APPARATUS_CAPABILITIES as readonly string[]).includes(capability)) {
        throw new Error(
          `Apparatus ${entry.id} uses unknown capability ${capability}`
        );
      }
    }
    const [major, minor, patch] = entry.min_canvas_version
      .split(".")
      .map(Number);
    const [canvasMajor, canvasMinor, canvasPatch] = canvasVersion
      .split(".")
      .map(Number);
    if (
      [major, minor, patch, canvasMajor, canvasMinor, canvasPatch].some(
        Number.isNaN
      ) ||
      major > canvasMajor ||
      (major === canvasMajor && minor > canvasMinor) ||
      (major === canvasMajor && minor === canvasMinor && patch > canvasPatch)
    ) {
      throw new Error(
        `Apparatus ${entry.id} requires canvas ${entry.min_canvas_version}`
      );
    }
    if (
      !entry.required_capabilities.includes("assignment-context") ||
      !entry.required_capabilities.includes("student-authoring") ||
      !entry.required_capabilities.includes("submission")
    ) {
      throw new Error(`Apparatus ${entry.id} has no viable student workflow`);
    }
    const profileIds = new Set<string>();
    for (const profile of entry.profiles) {
      if (profileIds.has(profile.id))
        throw new Error(`Duplicate profile ${entry.id}/${profile.id}`);
      profileIds.add(profile.id);
      if (profile.immutable !== true)
        throw new Error(`Profile ${entry.id}/${profile.id} must be immutable`);
      assertValidApparatusConfiguration(entry, profile.configuration);
    }
  }
}
