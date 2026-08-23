#!/usr/bin/env tsx

/**
 * Generate the web app's checked-in apparatus catalog from the public Research
 * OKF. The generated artifact is deliberately data-only; the app maps ids to
 * reviewed built-in implementations and never executes repository code.
 *
 * Usage:
 *   RESEARCH_OKF_ROOT=/path/to/okf/research yarn generate:apparatus
 *
 * When the repositories are checked out side-by-side, the sibling Research
 * checkout is discovered automatically.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  EVIDENCE_FIELD_TYPES,
  ledgerDimensionValidationError,
  type ApparatusEvidenceFieldDefinition,
} from "@opencanvas/shared";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Executable methods the app can instantiate. Other Research methods stay catalog-only. */
export const BUILTIN_METHOD_IDS = ["ai-assisted-essay"] as const;

type MethodFrontmatter = Record<string, unknown>;
type EvidenceTemplateFrontmatter = Record<string, unknown>;

type EvidenceTemplate = {
  id: string;
  version: string;
  defaultStage?: string;
  fields: Record<string, ApparatusEvidenceFieldDefinition>;
  layoutMarkdown: string;
  guidance: string;
  sourcePath: string;
};

const EVIDENCE_FIELD_TYPE_SET = new Set<string>(EVIDENCE_FIELD_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFrontmatter(
  source: string,
  sourcePath: string,
): MethodFrontmatter {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    throw new Error(`Apparatus source has no YAML frontmatter: ${sourcePath}`);
  }
  return yaml.load(match[1]) as MethodFrontmatter;
}

function parseEvidenceTemplate(
  source: string,
  sourcePath: string,
  methodId: string,
  methodVersion: string,
  evidenceTemplateRef: string,
): EvidenceTemplate {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    throw new Error(
      `Method ${methodId} evidence_template has no YAML frontmatter: ${sourcePath}`,
    );
  }

  const frontmatter = yaml.load(match[1]) as EvidenceTemplateFrontmatter;
  if (!isRecord(frontmatter)) {
    throw new Error(
      `Method ${methodId} evidence_template frontmatter must be a map`,
    );
  }

  const contractError = (field: string, message: string): never => {
    throw new Error(`Method ${methodId} evidence_template ${field} ${message}`);
  };
  const templateId = String(frontmatter.id || "");
  const templateVersion = String(frontmatter.version || "");
  const { id: referencedId, version: referencedVersion } =
    parseRunBriefRef(evidenceTemplateRef);

  if (frontmatter.type !== "Form Template") {
    contractError("type", "must be Form Template");
  }
  if (templateId !== "evidence-template") {
    contractError("id", "must be evidence-template");
  }
  if (!templateVersion) {
    contractError("version", "must be present");
  }
  if (frontmatter.template_kind !== "form") {
    contractError("template_kind", "must be form");
  }
  if (frontmatter.applies_to_method !== `${methodId}@${methodVersion}`) {
    contractError(
      "applies_to_method",
      `must equal ${methodId}@${methodVersion}`,
    );
  }
  if (referencedId !== templateId) {
    contractError("id", `does not match method pointer ${evidenceTemplateRef}`);
  }
  if (!referencedVersion || referencedVersion !== templateVersion) {
    contractError(
      "version",
      `does not match method pointer ${evidenceTemplateRef}`,
    );
  }
  if (!isRecord(frontmatter.fields)) {
    contractError("fields", "must be a map");
  }
  for (const [fieldId, definition] of Object.entries(frontmatter.fields)) {
    if (!isRecord(definition)) {
      contractError(`fields.${fieldId}`, "must be a map");
    }
    const fieldType = definition.type;
    if (
      typeof fieldType !== "string" ||
      !EVIDENCE_FIELD_TYPE_SET.has(fieldType)
    ) {
      contractError(
        `fields.${fieldId}.type`,
        "must be one of text, textarea, select, number, date",
      );
    }
    if (fieldType === "select") {
      const options = definition.options;
      if (!Array.isArray(options)) {
        contractError(
          `fields.${fieldId}.options`,
          "must be present for select",
        );
      } else if (!options.every((option) => typeof option === "string")) {
        contractError(`fields.${fieldId}.options`, "must contain only strings");
      }
    }
    const ledgerError = ledgerDimensionValidationError(definition);
    if (ledgerError) {
      contractError(
        `fields.${fieldId}.${ledgerError.field}`,
        ledgerError.message,
      );
    }
  }

  const defaultStage = frontmatter.default_stage;
  if (defaultStage !== undefined && typeof defaultStage !== "string") {
    contractError("default_stage", "must be a string");
  }

  let assistant: Record<string, unknown> = {};
  if (frontmatter.assistant !== undefined) {
    if (!isRecord(frontmatter.assistant)) {
      contractError("assistant", "must be a map");
    }
    assistant = frontmatter.assistant;
  }
  if (
    assistant.guidance !== undefined &&
    typeof assistant.guidance !== "string"
  ) {
    contractError("assistant.guidance", "must be a string");
  }

  return {
    id: templateId,
    version: templateVersion,
    ...(defaultStage !== undefined ? { defaultStage } : {}),
    fields: frontmatter.fields as Record<
      string,
      ApparatusEvidenceFieldDefinition
    >,
    layoutMarkdown: source.slice(match[0].length),
    guidance: assistant.guidance ?? "",
    sourcePath: path.posix.join("methods", methodId, "evidence-template.en.md"),
  };
}

export function buildApparatusEntry(
  frontmatter: MethodFrontmatter,
  sourcePath: string,
): Record<string, unknown> {
  const id = String(frontmatter.id || "");
  const version = String(frontmatter.version || "");
  const minCanvasVersion = String(
    frontmatter.min_canvas_version || frontmatter.min_platform || "",
  );
  if (!id || !version || !minCanvasVersion) {
    throw new Error(
      `Apparatus source must declare id, version, and min_canvas_version: ${sourcePath}`,
    );
  }

  const knobs = frontmatter.levers ?? frontmatter.knobs;
  const entry: Record<string, unknown> = {
    ...frontmatter,
    knobs,
    name: String(frontmatter.title || id),
    version,
    min_canvas_version: minCanvasVersion,
    min_platform: String(frontmatter.min_platform || minCanvasVersion),
  };
  delete entry.levers;
  delete entry.type;
  delete entry.lang;
  delete entry.origin;
  delete entry.title;
  delete entry.question;
  return entry;
}

export function buildApparatusMirror(researchRoot: string): {
  version: number;
  canvas_version: string;
  apparatuses: Record<string, unknown>[];
} {
  const methodsRoot = path.join(researchRoot, "methods");
  if (!fs.existsSync(methodsRoot)) {
    throw new Error(
      `Research methods source not found at ${methodsRoot}. Set RESEARCH_OKF_ROOT to the Research OKF checkout.`,
    );
  }

  const apparatuses: Record<string, unknown>[] = [];
  for (const id of BUILTIN_METHOD_IDS) {
    const sourcePath = path.join(methodsRoot, id, `${id}.en.md`);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Research method source not found at ${sourcePath}. Set RESEARCH_OKF_ROOT to the Research OKF checkout.`,
      );
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    const frontmatter = parseFrontmatter(source, sourcePath);
    if (String(frontmatter.id) !== id) {
      throw new Error(
        `Builtin method source ${sourcePath} must declare id ${id}`,
      );
    }
    const methodId = id;
    const methodVersion = String(frontmatter.version || "");
    const evidenceTemplateRef = String(frontmatter.evidence_template || "");
    if (!evidenceTemplateRef) {
      throw new Error(`Method ${methodId} is missing evidence_template`);
    }
    const evidenceTemplatePath = path.join(
      methodsRoot,
      id,
      "evidence-template.en.md",
    );
    if (!fs.existsSync(evidenceTemplatePath)) {
      throw new Error(
        `Method ${methodId} evidence_template file not found at ${evidenceTemplatePath}`,
      );
    }
    const evidenceTemplate = parseEvidenceTemplate(
      fs.readFileSync(evidenceTemplatePath, "utf8"),
      evidenceTemplatePath,
      methodId,
      methodVersion,
      evidenceTemplateRef,
    );
    const entry = buildApparatusEntry(frontmatter, sourcePath);
    entry.evidence_template = evidenceTemplate;
    apparatuses.push(entry);
  }

  const canvasVersion = String(apparatuses[0]?.min_canvas_version || "0.6.0");
  return {
    version: 2,
    canvas_version: canvasVersion,
    apparatuses,
  };
}

export function parseRunBriefRef(ref: string): {
  id: string;
  version?: string;
} {
  const at = ref.lastIndexOf("@");
  if (at <= 0) return { id: ref };
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

export function assertMethodRunBriefsBound(
  apparatuses: Record<string, unknown>[],
  platformTemplates: Array<{
    id: string;
    version: string;
    templateKind: string;
  }>,
): void {
  for (const entry of apparatuses) {
    const methodId = String(entry.id || "unknown");
    const ref = String(entry.run_brief_template || "");
    if (!ref) {
      throw new Error(`Method ${methodId} is missing run_brief_template`);
    }
    const { id, version } = parseRunBriefRef(ref);
    const template = platformTemplates.find((candidate) => candidate.id === id);
    if (!template || template.templateKind !== "form") {
      throw new Error(
        `Method ${methodId} run_brief_template ${ref} is not a platform Form template`,
      );
    }
    if (version && template.version !== version) {
      throw new Error(
        `Method ${methodId} run_brief_template ${ref} does not match platform version ${template.version}`,
      );
    }
  }
}

export function assertMethodEvidenceTemplatesBound(
  apparatuses: Record<string, unknown>[],
): void {
  for (const entry of apparatuses) {
    const methodId = String(entry.id || "unknown");
    const evidenceTemplate = entry.evidence_template;
    if (!isRecord(evidenceTemplate)) {
      throw new Error(`Method ${methodId} is missing evidence_template`);
    }
    if (evidenceTemplate.id !== "evidence-template") {
      throw new Error(
        `Method ${methodId} evidence_template id must be evidence-template`,
      );
    }
    if (
      typeof evidenceTemplate.version !== "string" ||
      !evidenceTemplate.version
    ) {
      throw new Error(
        `Method ${methodId} evidence_template version must be present`,
      );
    }
    if (typeof evidenceTemplate.layoutMarkdown !== "string") {
      throw new Error(
        `Method ${methodId} evidence_template layoutMarkdown must be a string`,
      );
    }
    if (typeof evidenceTemplate.guidance !== "string") {
      throw new Error(
        `Method ${methodId} evidence_template guidance must be a string`,
      );
    }
    if (typeof evidenceTemplate.sourcePath !== "string") {
      throw new Error(
        `Method ${methodId} evidence_template sourcePath must be a string`,
      );
    }
    if (
      "defaultStage" in evidenceTemplate &&
      typeof evidenceTemplate.defaultStage !== "string"
    ) {
      throw new Error(
        `Method ${methodId} evidence_template defaultStage must be a string`,
      );
    }
    if (!isRecord(evidenceTemplate.fields)) {
      throw new Error(
        `Method ${methodId} evidence_template fields must be a map`,
      );
    }
    for (const [fieldId, definition] of Object.entries(
      evidenceTemplate.fields,
    )) {
      if (!isRecord(definition)) {
        throw new Error(
          `Method ${methodId} evidence_template fields.${fieldId} must be a map`,
        );
      }
      const fieldType = definition.type;
      if (
        typeof fieldType !== "string" ||
        !EVIDENCE_FIELD_TYPE_SET.has(fieldType)
      ) {
        throw new Error(
          `Method ${methodId} evidence_template fields.${fieldId}.type must be one of text, textarea, select, number, date`,
        );
      }
      if (fieldType === "select") {
        const options = definition.options;
        if (!Array.isArray(options)) {
          throw new Error(
            `Method ${methodId} evidence_template fields.${fieldId}.options must be present for select`,
          );
        } else if (!options.every((option) => typeof option === "string")) {
          throw new Error(
            `Method ${methodId} evidence_template fields.${fieldId}.options must contain only strings`,
          );
        }
      }
    }
  }
}

export function writeApparatusMirror(
  researchRoot: string,
  outputPath: string,
  platformCatalogPath = path.join(
    repoRoot,
    "apps",
    "web",
    "data",
    "platform-template-catalog.json",
  ),
): void {
  const artifact = buildApparatusMirror(researchRoot);
  if (!fs.existsSync(platformCatalogPath)) {
    throw new Error(
      `Platform template catalog not found at ${platformCatalogPath}. Run yarn generate:platform-templates first.`,
    );
  }
  const platformCatalog = JSON.parse(
    fs.readFileSync(platformCatalogPath, "utf8"),
  ) as {
    templates?: Array<{ id: string; version: string; templateKind: string }>;
  };
  assertMethodRunBriefsBound(
    artifact.apparatuses,
    platformCatalog.templates ?? [],
  );
  assertMethodEvidenceTemplatesBound(artifact.apparatuses);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const researchRoot =
    process.env.RESEARCH_OKF_ROOT || path.resolve(repoRoot, "../okf/research");
  const outputPath = path.join(
    repoRoot,
    "apps",
    "web",
    "data",
    "apparatuses.generated.json",
  );
  const platformCatalogPath = path.resolve(
    process.env.EVALUCHAT_PLATFORM_TEMPLATE_CATALOG_OUTPUT ||
      path.join(repoRoot, "apps/web/data/platform-template-catalog.json"),
  );
  writeApparatusMirror(researchRoot, outputPath, platformCatalogPath);
  console.log(
    `Generated ${path.relative(repoRoot, outputPath)} from ${path.join(researchRoot, "methods")}`,
  );
}
