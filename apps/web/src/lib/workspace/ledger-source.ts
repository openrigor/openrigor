import { createHash } from "node:crypto";
import yaml from "js-yaml";
import {
  EVIDENCE_FIELD_TYPES,
  ledgerDimensionValidationError,
  type ApparatusEvidenceFieldDefinition,
} from "@opencanvas/shared";
import type {
  EvidenceLedgerContribution,
  EvidenceLedgerDimension,
  EvidenceLedgerMethod,
  EvidenceLedgerTemplate,
  LedgerDimensionValue,
} from "@/lib/apparatuses/evidence-ledger";
import {
  githubHeaders,
  githubRequest,
  RESEARCH_REPOSITORY,
} from "./evidence-github";

const CONTENTS_PREFIX = `/repos/${RESEARCH_REPOSITORY}/contents`;
const LARGE_FILE_BYTES = 1_000_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_PACKET_NAMES = new Set(["index.md", "log.md"]);

type Frontmatter = Record<string, unknown>;

type GithubContent = {
  type: "file" | "dir";
  path: string;
  name: string;
  sha?: string;
  size?: number;
  content?: string;
  encoding?: string;
  download_url?: string;
};

type ParsedTemplate = EvidenceLedgerTemplate & {
  fields: Record<string, ApparatusEvidenceFieldDefinition>;
};

export type LoadedLedgerSource = {
  method: EvidenceLedgerMethod;
  template: EvidenceLedgerTemplate;
  contributions: EvidenceLedgerContribution[];
  sourceCommit: string;
};

export type ResearchedLedgerMethod = {
  id: string;
  title: string;
  description?: string;
  version: string;
  evidenceTemplate: { id: string; version: string };
  acceptedEvidenceCount: number;
};

let researchedMethodsPromise: Promise<ResearchedLedgerMethod[]> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseMarkdown(source: string): Frontmatter {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  // JSON_SCHEMA keeps dates as strings — must match the resolver's parser
  // (evidence-ledger.ts) exactly, or dated packets get excluded as invalid.
  const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  return isRecord(parsed) ? parsed : {};
}

function isValidDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isAccepted(frontmatter: Frontmatter): boolean {
  return (
    frontmatter.status === "accepted" ||
    frontmatter.status === "stable" ||
    frontmatter.accepted === true
  );
}

function evidenceValues(frontmatter: Frontmatter): Record<string, unknown> {
  for (const key of ["field_values", "values", "fields"]) {
    if (isRecord(frontmatter[key])) return frontmatter[key];
  }
  return {};
}

function dimensionValue(
  definition: ApparatusEvidenceFieldDefinition,
  rawValue: unknown
): LedgerDimensionValue | undefined {
  const missingSemantics = definition.missing_semantics ?? "unknown";
  if (rawValue === undefined)
    return { status: "unknown", value: missingSemantics };
  if (typeof rawValue !== "string" && typeof rawValue !== "number")
    return undefined;
  if (rawValue === missingSemantics)
    return { status: "unknown", value: rawValue };
  if (definition.type === "select") {
    if (
      typeof rawValue !== "string" ||
      !definition.options?.includes(rawValue)
    ) {
      return undefined;
    }
  } else if (definition.type === "number") {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue))
      return undefined;
  } else if (definition.type === "date") {
    if (typeof rawValue !== "string" || !isValidDate(rawValue))
      return undefined;
  }
  return { status: "recorded", value: rawValue };
}

async function content(path: string): Promise<GithubContent | GithubContent[]> {
  return (await githubRequest(
    `${CONTENTS_PREFIX}/${path.split("/").map(encodeURIComponent).join("/")}?ref=main`,
    { method: "GET" }
  )) as GithubContent | GithubContent[];
}

async function rawContent(entry: GithubContent): Promise<string> {
  if (entry.size && entry.size > LARGE_FILE_BYTES && entry.download_url) {
    const response = await fetch(entry.download_url, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(
        Number.parseInt(
          process.env.EVIDENCE_GITHUB_TIMEOUT_MS || "15000",
          10
        ) || 15_000
      ),
    });
    if (!response.ok) throw new Error(`GitHub raw content ${response.status}`);
    return response.text();
  }
  if (entry.encoding === "base64" && typeof entry.content === "string") {
    return Buffer.from(entry.content.replace(/\n/g, ""), "base64").toString(
      "utf8"
    );
  }
  const loaded = await content(entry.path);
  if (
    !Array.isArray(loaded) &&
    loaded.encoding === "base64" &&
    loaded.content
  ) {
    return Buffer.from(loaded.content.replace(/\n/g, ""), "base64").toString(
      "utf8"
    );
  }
  throw new Error(`GitHub contents response did not include ${entry.path}`);
}

async function file(
  path: string
): Promise<{ entry: GithubContent; source: string }> {
  const entry = await content(path);
  if (Array.isArray(entry) || entry.type !== "file") {
    throw new Error(`Research source ${path} is not a file`);
  }
  return { entry, source: await rawContent(entry) };
}

async function markdownFiles(path: string): Promise<GithubContent[]> {
  let listed: GithubContent | GithubContent[];
  try {
    listed = await content(path);
  } catch (error) {
    if (error instanceof Error && /GitHub API 404/.test(error.message))
      return [];
    throw error;
  }
  if (!Array.isArray(listed)) return listed.type === "file" ? [listed] : [];
  const nested = await Promise.all(
    listed.map(async (entry) =>
      entry.type === "dir" ? markdownFiles(entry.path) : [entry]
    )
  );
  const files = nested.flat() as GithubContent[];
  return files
    .filter((entry) => entry.path.endsWith(".md"))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parseTemplate(
  source: string,
  path: string,
  methodId: string
): ParsedTemplate {
  const frontmatter = parseMarkdown(source);
  if (
    frontmatter.id !== "evidence-template" ||
    typeof frontmatter.version !== "string"
  ) {
    throw new Error(`Evidence template ${path} has invalid identity`);
  }
  if (
    frontmatter.applies_to_method !== undefined &&
    frontmatter.applies_to_method !== `${methodId}@${frontmatter.version}`
  ) {
    // Templates are versioned independently; the method match below accepts
    // the standard method@version value once the method has been parsed.
  }
  if (!isRecord(frontmatter.fields))
    throw new Error(`Evidence template ${path} has no fields`);
  const fields: Record<string, ApparatusEvidenceFieldDefinition> = {};
  const dimensions: EvidenceLedgerDimension[] = [];
  for (const [id, rawDefinition] of Object.entries(frontmatter.fields)) {
    if (!isRecord(rawDefinition) || typeof rawDefinition.type !== "string")
      continue;
    const validation = ledgerDimensionValidationError(rawDefinition);
    if (validation)
      throw new Error(
        `Evidence template ${path} ${id}.${validation.field} ${validation.message}`
      );
    if (
      !(EVIDENCE_FIELD_TYPES as readonly string[]).includes(rawDefinition.type)
    )
      continue;
    const definition: ApparatusEvidenceFieldDefinition = {
      ...rawDefinition,
      type: rawDefinition.type as ApparatusEvidenceFieldDefinition["type"],
      ...(Array.isArray(rawDefinition.options)
        ? {
            options: rawDefinition.options.filter(
              (option): option is string => typeof option === "string"
            ),
          }
        : {}),
    };
    fields[id] = definition;
    if (!definition.ledger_dimension) continue;
    if (
      definition.type !== "select" &&
      definition.type !== "date" &&
      definition.type !== "number"
    )
      continue;
    dimensions.push({
      id,
      type: definition.type,
      role: definition.ledger_dimension.role,
      control: definition.ledger_dimension.control,
      ...(definition.options ? { options: definition.options } : {}),
      ...(definition.missing_semantics !== undefined
        ? { missingSemantics: definition.missing_semantics }
        : {}),
    });
  }
  return {
    id: "evidence-template",
    version: frontmatter.version,
    path,
    dimensions: dimensions.sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    fields,
  };
}

function exclusion(
  path: string,
  source: string,
  reason: "invalid provenance" | "not accepted"
): EvidenceLedgerContribution {
  const frontmatter = parseMarkdown(source);
  return {
    ...(typeof frontmatter.id === "string" ? { id: frontmatter.id } : {}),
    path,
    sourceHash: sha256(source),
    dimensionValues: {},
    scopeValues: {},
    bucket: "Resolver exclusion",
    exclusionReason: reason,
  };
}

function normalizePacket(
  path: string,
  source: string,
  method: EvidenceLedgerMethod,
  templates: Map<string, ParsedTemplate>
): EvidenceLedgerContribution {
  const frontmatter = parseMarkdown(source);
  if (!isAccepted(frontmatter)) return exclusion(path, source, "not accepted");
  if (frontmatter.type !== "Evidence Contribution") {
    return exclusion(path, source, "invalid provenance");
  }
  const evidenceMethod = frontmatter.method;
  const provenance = frontmatter.provenance;
  if (
    !isRecord(evidenceMethod) ||
    !isRecord(provenance) ||
    evidenceMethod.id !== method.id ||
    evidenceMethod.version !== method.version ||
    provenance.template_id !== "evidence-template" ||
    typeof provenance.template_version !== "string"
  ) {
    return exclusion(path, source, "invalid provenance");
  }
  const template = templates.get(provenance.template_version);
  if (
    !template ||
    (provenance.template_path !== undefined &&
      provenance.template_path !== template.path)
  ) {
    return exclusion(path, source, "invalid provenance");
  }
  const values = evidenceValues(frontmatter);
  const dimensionValues: Record<string, LedgerDimensionValue> = {};
  const invalidDimensions: string[] = [];
  for (const dimension of template.dimensions) {
    const value = dimensionValue(
      template.fields[dimension.id],
      values[dimension.id]
    );
    // Mirror the file-backed resolver (evidence-ledger.ts lines 722-728):
    // an invalid value omits only that dimension; the packet is NOT dropped
    // here. It becomes a resolver exclusion only when a filter targets the
    // invalid dimension (handled by resolveEvidenceLedgerFromSource).
    if (!value) {
      invalidDimensions.push(dimension.id);
      continue;
    }
    dimensionValues[dimension.id] = value;
  }
  return {
    ...(typeof frontmatter.id === "string" ? { id: frontmatter.id } : {}),
    path,
    sourceHash: sha256(source),
    methodId: method.id,
    methodVersion: method.version,
    templateVersion: template.version,
    dimensionValues,
    invalidDimensions,
    scopeValues: {},
    bucket: "Included",
  };
}

async function sourceCommit(): Promise<string> {
  const commit = await githubRequest(
    `/repos/${RESEARCH_REPOSITORY}/commits/main`,
    {
      method: "GET",
    }
  );
  if (typeof commit.sha !== "string")
    throw new Error("Research main commit is unavailable");
  return commit.sha;
}

async function methodMeta(methodId: string): Promise<{
  id: string;
  version: string;
  title: string;
  description?: string;
  evidenceTemplate?: { id: string; version: string };
}> {
  const { source } = await file(`methods/${methodId}/${methodId}.en.md`);
  const frontmatter = parseMarkdown(source);
  const pointer =
    typeof frontmatter.evidence_template === "string"
      ? frontmatter.evidence_template.match(/^([^@]+)@(.+)$/)
      : undefined;
  return {
    id: typeof frontmatter.id === "string" ? frontmatter.id : methodId,
    version: typeof frontmatter.version === "string" ? frontmatter.version : "",
    title: typeof frontmatter.title === "string" ? frontmatter.title : methodId,
    ...(typeof frontmatter.description === "string"
      ? { description: frontmatter.description }
      : {}),
    ...(pointer
      ? { evidenceTemplate: { id: pointer[1], version: pointer[2] } }
      : {}),
  };
}

export async function countAcceptedEvidence(methodId: string): Promise<number> {
  const packets = await markdownFiles(`methods/${methodId}/evidence`);
  const sources = await Promise.all(
    packets
      .filter((packet) => !RESERVED_PACKET_NAMES.has(packet.name))
      .map(async (packet) => ({ packet, source: await rawContent(packet) }))
  );
  return sources.filter(({ source }) => isAccepted(parseMarkdown(source)))
    .length;
}

/** Lists published research methods directly from GitHub, never the app mirror. */
export async function listResearchedMethods(): Promise<
  ResearchedLedgerMethod[]
> {
  if (!researchedMethodsPromise) {
    const pending = (async () => {
      const entries = await content("methods");
      if (!Array.isArray(entries)) return [];
      const methods = await Promise.all(
        entries
          .filter((entry) => entry.type === "dir")
          .map(async (entry) => {
            try {
              const meta = await methodMeta(entry.name);
              if (!meta.version || !meta.evidenceTemplate) return undefined;
              return {
                ...meta,
                evidenceTemplate: meta.evidenceTemplate,
                acceptedEvidenceCount: await countAcceptedEvidence(meta.id),
              };
            } catch {
              return undefined;
            }
          })
      );
      const unique = new Map<string, ResearchedLedgerMethod>();
      for (const method of methods)
        if (method && !unique.has(method.id)) unique.set(method.id, method);
      return [...unique.values()].sort((left, right) =>
        left.id.localeCompare(right.id)
      );
    })();
    // Do not cache rejections permanently: a single transient GitHub failure
    // (rate limit, timeout, 5xx) must not disable the ledger catalog for the
    // process lifetime. Clear the memo so the next request retries.
    researchedMethodsPromise = pending.catch((error) => {
      researchedMethodsPromise = undefined;
      throw error;
    });
  }
  return researchedMethodsPromise;
}

/**
 * Fetch and normalise the public source records for a single method version.
 * This loader never assigns scope buckets beyond resolver exclusions; the
 * resolver performs all predicate evaluation on the server.
 */
export async function loadLedgerSource(
  methodId: string,
  methodVersion: string
): Promise<LoadedLedgerSource> {
  const [meta, currentTemplateFile, historicalFiles, packetFiles, commit] =
    await Promise.all([
      methodMeta(methodId),
      file(`methods/${methodId}/evidence-template.en.md`),
      markdownFiles(`methods/${methodId}/evidence-templates`),
      markdownFiles(`methods/${methodId}/evidence`),
      sourceCommit(),
    ]);
  if (
    meta.id !== methodId ||
    meta.version !== methodVersion ||
    !meta.evidenceTemplate
  ) {
    throw new Error(
      `Method ${methodId}@${methodVersion} is not published for Evidence Ledger`
    );
  }
  const currentTemplate = parseTemplate(
    currentTemplateFile.source,
    `methods/${methodId}/evidence-template.en.md`,
    methodId
  );
  if (
    meta.evidenceTemplate.id !== currentTemplate.id ||
    meta.evidenceTemplate.version !== currentTemplate.version
  ) {
    throw new Error(
      `Method ${methodId} has no resolved current evidence template`
    );
  }
  const history = await Promise.all(
    historicalFiles.map(async (entry) => ({
      entry,
      source: await rawContent(entry),
    }))
  );
  const templates = new Map<string, ParsedTemplate>([
    [currentTemplate.version, currentTemplate],
  ]);
  for (const historical of history) {
    const template = parseTemplate(
      historical.source,
      historical.entry.path,
      methodId
    );
    templates.set(template.version, template);
  }
  const method: EvidenceLedgerMethod = {
    id: meta.id,
    version: meta.version,
    path: `methods/${methodId}/${methodId}.en.md`,
    evidenceTemplate: currentTemplate,
  };
  const packets = await Promise.all(
    packetFiles
      .filter((packet) => !RESERVED_PACKET_NAMES.has(packet.name))
      .map(async (packet) => ({
        path: packet.path,
        source: await rawContent(packet),
      }))
  );
  return {
    method,
    template: currentTemplate,
    contributions: packets
      .map((packet) =>
        normalizePacket(packet.path, packet.source, method, templates)
      )
      .sort((left, right) => left.path.localeCompare(right.path)),
    sourceCommit: commit,
  };
}

/** Test seam for isolated module tests. */
export function resetLedgerSourceMemo(): void {
  researchedMethodsPromise = undefined;
}
