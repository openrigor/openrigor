import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  EVIDENCE_FIELD_TYPES,
  ledgerDimensionValidationError,
  type ApparatusEvidenceFieldDefinition,
  type LedgerDimension,
  type LedgerMissingSemantics,
  type LedgerScopeFilter,
} from "@opencanvas/shared";
export type { LedgerScopeFilter } from "@opencanvas/shared";

export type EvidenceLedgerBucket =
  | "Included"
  | "Outside declared scope"
  | "Unknown"
  | "Unavailable"
  | "Resolver exclusion";

export type EvidenceLedgerExclusionReason =
  | "invalid provenance"
  | "inaccessible"
  | "not accepted";

export type LedgerDeclaredValue = string | number;

export type LedgerDimensionValue =
  | { status: "recorded"; value: LedgerDeclaredValue }
  | { status: "unknown"; value: LedgerDeclaredValue };

export type LedgerScopeValue = LedgerDimensionValue | { status: "unavailable" };

export type EvidenceLedgerDimension = {
  id: string;
  type: "select" | "date" | "number";
  role: LedgerDimension["role"];
  control: LedgerDimension["control"];
  options?: string[];
  missingSemantics?: LedgerMissingSemantics;
};

export type EvidenceLedgerTemplate = {
  id: "evidence-template";
  version: string;
  path: string;
  dimensions: EvidenceLedgerDimension[];
};

export type EvidenceLedgerMethod = {
  id: string;
  version: string;
  path: string;
  evidenceTemplate: EvidenceLedgerTemplate;
};

export type EvidenceLedgerContribution = {
  id?: string;
  path: string;
  sourceHash?: string;
  methodId?: string;
  methodVersion?: string;
  templateVersion?: string;
  dimensionValues: Record<string, LedgerDimensionValue>;
  scopeValues: Record<string, LedgerScopeValue>;
  bucket: EvidenceLedgerBucket;
  exclusionReason?: EvidenceLedgerExclusionReason;
  /** Dimensions whose recorded value is invalid (out of options / bad date /
   * non-finite number). Mirrors the file-backed resolver: the dimension is
   * omitted from `dimensionValues`; the packet is excluded ONLY when a filter
   * targets such a dimension (invalid provenance), never for unfiltered dims.
   */
  invalidDimensions?: string[];
};

export type EvidenceLedgerManifest = {
  methods: Array<{
    id: string;
    version: string;
    path: string;
    evidenceTemplate: EvidenceLedgerTemplate;
  }>;
  filters: LedgerScopeFilter[];
  contributions: EvidenceLedgerContribution[];
};

export type EvidenceLedgerResolution = {
  methods: EvidenceLedgerMethod[];
  /** Every packet encountered under methods/, including resolver exclusions. */
  contributions: EvidenceLedgerContribution[];
  /** Accepted packets before scope filtering. */
  acceptedEvidence: EvidenceLedgerContribution[];
  scope: {
    filters: LedgerScopeFilter[];
    baselineCount: number;
    bucketCounts: Record<EvidenceLedgerBucket, number>;
  };
  manifest: EvidenceLedgerManifest;
  manifestHash: string;
};

export type ResolveEvidenceLedgerOptions = {
  researchRoot: string;
  filters?: LedgerScopeFilter[];
};

type Frontmatter = Record<string, unknown>;

type MarkdownDocument = {
  source: string;
  frontmatter: Frontmatter;
};

type MethodSource = {
  id: string;
  version: string;
  path: string;
  absolutePath: string;
  template?: ResolvedTemplate;
};

type ResolvedTemplate = EvidenceLedgerTemplate & {
  fields: Record<string, ApparatusEvidenceFieldDefinition>;
};

const EVIDENCE_FIELD_TYPE_SET = new Set<string>(EVIDENCE_FIELD_TYPES);
const RESERVED_MARKDOWN_NAMES = new Set(["index.md", "log.md"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class EvidenceLedgerResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceLedgerResolutionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readMarkdownDocument(absolutePath: string): MarkdownDocument {
  const source = fs.readFileSync(absolutePath, "utf8");
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!match) {
    throw new EvidenceLedgerResolutionError(
      `Markdown document has no YAML frontmatter: ${absolutePath}`
    );
  }
  const frontmatter = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  if (!isRecord(frontmatter)) {
    throw new EvidenceLedgerResolutionError(
      `Markdown frontmatter must be an object: ${absolutePath}`
    );
  }
  return { source, frontmatter };
}

function byCodepoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function markdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...markdownFiles(entryPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !RESERVED_MARKDOWN_NAMES.has(entry.name)
    ) {
      files.push(entryPath);
    }
  }
  return files.sort(byCodepoint);
}

function isValidDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  return day <= daysInMonth;
}

function isAccepted(frontmatter: Frontmatter): boolean {
  return (
    frontmatter.status === "accepted" ||
    frontmatter.status === "stable" ||
    frontmatter.accepted === true
  );
}

function requiredString(
  frontmatter: Frontmatter,
  field: string,
  sourcePath: string
): string {
  const value = frontmatter[field];
  if (typeof value !== "string" || !value) {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} must declare a non-empty ${field}`
    );
  }
  return value;
}

function validateAndResolveTemplate(
  document: MarkdownDocument,
  sourcePath: string,
  method: Pick<MethodSource, "id" | "version">
): ResolvedTemplate {
  const frontmatter = document.frontmatter;
  if (frontmatter.type !== "Form Template") {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} must have type Form Template`
    );
  }
  if (frontmatter.id !== "evidence-template") {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} must have id evidence-template`
    );
  }
  if (frontmatter.template_kind !== "form") {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} must have template_kind form`
    );
  }
  if (frontmatter.applies_to_method !== `${method.id}@${method.version}`) {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} must apply to ${method.id}@${method.version}`
    );
  }
  const version = requiredString(frontmatter, "version", sourcePath);
  if (!isRecord(frontmatter.fields)) {
    throw new EvidenceLedgerResolutionError(
      `${sourcePath} fields must be an object`
    );
  }

  const fields: Record<string, ApparatusEvidenceFieldDefinition> = {};
  const dimensions: EvidenceLedgerDimension[] = [];
  for (const fieldId of Object.keys(frontmatter.fields).sort(byCodepoint)) {
    const definition = frontmatter.fields[fieldId];
    if (!isRecord(definition)) {
      throw new EvidenceLedgerResolutionError(
        `${sourcePath} fields.${fieldId} must be an object`
      );
    }
    if (
      typeof definition.type !== "string" ||
      !EVIDENCE_FIELD_TYPE_SET.has(definition.type)
    ) {
      throw new EvidenceLedgerResolutionError(
        `${sourcePath} fields.${fieldId}.type must be one of text, textarea, select, number, date`
      );
    }
    if (definition.type === "select") {
      const options = definition.options;
      if (!Array.isArray(options)) {
        throw new EvidenceLedgerResolutionError(
          `${sourcePath} fields.${fieldId}.options must be present for select`
        );
      } else if (!options.every((option) => typeof option === "string")) {
        throw new EvidenceLedgerResolutionError(
          `${sourcePath} fields.${fieldId}.options must contain only strings`
        );
      }
    }
    const ledgerError = ledgerDimensionValidationError(definition);
    if (ledgerError) {
      throw new EvidenceLedgerResolutionError(
        `${sourcePath} fields.${fieldId}.${ledgerError.field} ${ledgerError.message}`
      );
    }
    const typedDefinition = definition as ApparatusEvidenceFieldDefinition;
    fields[fieldId] = typedDefinition;
    if (!typedDefinition.ledger_dimension) continue;

    const type = typedDefinition.type;
    if (type !== "select" && type !== "date" && type !== "number") {
      throw new EvidenceLedgerResolutionError(
        `${sourcePath} fields.${fieldId}.ledger_dimension has an unsupported field type`
      );
    }
    dimensions.push({
      id: fieldId,
      type,
      role: typedDefinition.ledger_dimension.role,
      control: typedDefinition.ledger_dimension.control,
      ...(typedDefinition.options
        ? { options: [...typedDefinition.options] }
        : {}),
      ...(typedDefinition.missing_semantics !== undefined
        ? { missingSemantics: typedDefinition.missing_semantics }
        : {}),
    });
  }

  return {
    id: "evidence-template",
    version,
    path: sourcePath,
    dimensions,
    fields,
  };
}

function templatePaths(root: string, method: MethodSource): string[] {
  const methodRoot = path.join(root, "methods", method.id);
  const paths = [path.join(methodRoot, "evidence-template.en.md")];
  if (fs.existsSync(methodRoot)) {
    for (const entry of fs.readdirSync(methodRoot, { withFileTypes: true })) {
      if (entry.isFile() && /^evidence-template@.+\.en\.md$/.test(entry.name)) {
        paths.push(path.join(methodRoot, entry.name));
      }
    }
  }
  paths.push(...markdownFiles(path.join(methodRoot, "evidence-templates")));
  return [...new Set(paths)].sort(byCodepoint);
}

function resolveTemplates(
  root: string,
  method: MethodSource
): Map<string, ResolvedTemplate> {
  const templates = new Map<string, ResolvedTemplate>();
  for (const absolutePath of templatePaths(root, method)) {
    if (!fs.existsSync(absolutePath)) continue;
    const template = validateAndResolveTemplate(
      readMarkdownDocument(absolutePath),
      canonicalPath(root, absolutePath),
      method
    );
    const key = `${template.id}@${template.version}`;
    if (templates.has(key)) {
      throw new EvidenceLedgerResolutionError(
        `Method ${method.id} has more than one ${key} evidence template`
      );
    }
    templates.set(key, template);
  }
  return templates;
}

function readMethods(root: string): MethodSource[] {
  const methodsRoot = path.join(root, "methods");
  if (!fs.existsSync(methodsRoot)) {
    throw new EvidenceLedgerResolutionError(
      `Research methods source not found at ${methodsRoot}`
    );
  }
  const methods: MethodSource[] = [];
  for (const entry of fs.readdirSync(methodsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const absolutePath = path.join(
      methodsRoot,
      entry.name,
      `${entry.name}.en.md`
    );
    if (!fs.existsSync(absolutePath)) continue;
    const document = readMarkdownDocument(absolutePath);
    if (document.frontmatter.type !== "Method") continue;
    const id = requiredString(
      document.frontmatter,
      "id",
      canonicalPath(root, absolutePath)
    );
    if (id !== entry.name) {
      throw new EvidenceLedgerResolutionError(
        `${canonicalPath(root, absolutePath)} id must match its directory`
      );
    }
    methods.push({
      id,
      version: requiredString(
        document.frontmatter,
        "version",
        canonicalPath(root, absolutePath)
      ),
      path: canonicalPath(root, absolutePath),
      absolutePath,
    });
  }
  return methods.sort((left, right) => byCodepoint(left.id, right.id));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(byCodepoint)
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalFilters(filters: LedgerScopeFilter[]): LedgerScopeFilter[] {
  const fields = new Set<string>();
  return [...filters]
    .map((filter) => {
      if (!filter.fieldId || fields.has(filter.fieldId)) {
        throw new EvidenceLedgerResolutionError(
          `Scope filters must use each field at most once: ${filter.fieldId}`
        );
      }
      fields.add(filter.fieldId);
      if (filter.control === "multi-select") {
        if (!filter.values.length || filter.values.some((value) => !value)) {
          throw new EvidenceLedgerResolutionError(
            `Scope filter ${filter.fieldId} must select at least one value`
          );
        }
        return {
          ...filter,
          values: [...new Set(filter.values)].sort(byCodepoint),
        };
      }
      if (filter.min === undefined && filter.max === undefined) {
        throw new EvidenceLedgerResolutionError(
          `Scope range filter ${filter.fieldId} must have a minimum or maximum`
        );
      }
      return { ...filter };
    })
    .sort((left, right) => byCodepoint(left.fieldId, right.fieldId));
}

function validateScopeFilters(
  filters: LedgerScopeFilter[],
  templatesByMethod: Map<string, Map<string, ResolvedTemplate>>
): void {
  const templates = [...templatesByMethod.values()].flatMap((templates) => [
    ...templates.values(),
  ]);
  for (const filter of filters) {
    const declaredFields: Array<{
      template: ResolvedTemplate;
      definition: ApparatusEvidenceFieldDefinition;
    }> = [];
    for (const template of templates) {
      const definition = template.fields[filter.fieldId];
      if (definition) declaredFields.push({ template, definition });
    }
    if (
      !declaredFields.length ||
      declaredFields.some(({ definition }) => !definition.ledger_dimension)
    ) {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} is not declared by an eligible evidence template`
      );
    }
    const dimensions = declaredFields.map(({ template }) => {
      const dimension = template.dimensions.find(
        (candidate) => candidate.id === filter.fieldId
      );
      if (!dimension) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} is not declared by an eligible evidence template`
        );
      }
      return dimension;
    });
    if (
      dimensions.some(
        (dimension) =>
          dimension.control !== filter.control ||
          dimension.type !== dimensions[0].type
      )
    ) {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} has incompatible template declarations`
      );
    }
    if (filter.control === "multi-select") {
      if (dimensions[0].type !== "select") {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} must use a range control`
        );
      }
      for (const dimension of dimensions) {
        if (
          filter.values.some(
            (value) => !dimension.options || !dimension.options.includes(value)
          )
        ) {
          throw new EvidenceLedgerResolutionError(
            `Scope filter ${filter.fieldId} uses a value not declared by every applicable template`
          );
        }
      }
      continue;
    }
    if (dimensions[0].type === "select") {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} must use a multi-select control`
      );
    }
    const expectedType = dimensions[0].type === "number" ? "number" : "string";
    for (const endpoint of [filter.min, filter.max]) {
      if (endpoint !== undefined && typeof endpoint !== expectedType) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be ${expectedType}`
        );
      }
      if (
        dimensions[0].type === "number" &&
        typeof endpoint === "number" &&
        !Number.isFinite(endpoint)
      ) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be finite numbers`
        );
      }
      if (
        dimensions[0].type === "date" &&
        endpoint !== undefined &&
        typeof endpoint === "string" &&
        !isValidDate(endpoint)
      ) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be valid dates in YYYY-MM-DD format`
        );
      }
    }
  }
}

function valuesFromEvidence(frontmatter: Frontmatter): Record<string, unknown> {
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
  if (rawValue === undefined) {
    return { status: "unknown", value: missingSemantics };
  }
  if (typeof rawValue !== "string" && typeof rawValue !== "number") {
    return undefined;
  }
  if (rawValue === missingSemantics) {
    return { status: "unknown", value: rawValue };
  }
  if (definition.type === "select") {
    if (
      typeof rawValue !== "string" ||
      !definition.options?.includes(rawValue)
    ) {
      return undefined;
    }
  } else if (definition.type === "number") {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      return undefined;
    }
  } else if (definition.type === "date") {
    if (typeof rawValue !== "string" || !isValidDate(rawValue)) {
      return undefined;
    }
  }
  return { status: "recorded", value: rawValue };
}

function classifyScope(
  filters: LedgerScopeFilter[],
  template: ResolvedTemplate,
  values: Record<string, unknown>
): {
  bucket: Exclude<EvidenceLedgerBucket, "Resolver exclusion">;
  scopeValues: Record<string, LedgerScopeValue>;
  invalid: boolean;
} {
  const scopeValues: Record<string, LedgerScopeValue> = {};
  let unavailable = false;
  let unknown = false;
  let outside = false;

  for (const filter of filters) {
    const definition = template.fields[filter.fieldId];
    if (!definition?.ledger_dimension) {
      scopeValues[filter.fieldId] = { status: "unavailable" };
      unavailable = true;
      continue;
    }
    const value = dimensionValue(definition, values[filter.fieldId]);
    if (!value) return { bucket: "Included", scopeValues, invalid: true };
    scopeValues[filter.fieldId] = value;
    if (value.status === "unknown") {
      unknown = true;
      continue;
    }
    if (filter.control === "multi-select") {
      if (
        typeof value.value !== "string" ||
        !filter.values.includes(value.value)
      ) {
        outside = true;
      }
      continue;
    }
    if (
      (filter.min !== undefined && value.value < filter.min) ||
      (filter.max !== undefined && value.value > filter.max)
    ) {
      outside = true;
    }
  }

  if (unavailable)
    return { bucket: "Unavailable", scopeValues, invalid: false };
  if (unknown) return { bucket: "Unknown", scopeValues, invalid: false };
  if (outside) {
    return { bucket: "Outside declared scope", scopeValues, invalid: false };
  }
  return { bucket: "Included", scopeValues, invalid: false };
}

function resolverExclusion(
  path: string,
  reason: EvidenceLedgerExclusionReason,
  details: Partial<EvidenceLedgerContribution> = {}
): EvidenceLedgerContribution {
  return {
    path,
    dimensionValues: {},
    scopeValues: {},
    bucket: "Resolver exclusion",
    exclusionReason: reason,
    ...details,
  };
}

function publicTemplate(template: ResolvedTemplate): EvidenceLedgerTemplate {
  return {
    id: template.id,
    version: template.version,
    path: template.path,
    dimensions: template.dimensions,
  };
}

function resolveContribution(
  root: string,
  filters: LedgerScopeFilter[],
  method: MethodSource,
  templates: Map<string, ResolvedTemplate>,
  absolutePath: string
): EvidenceLedgerContribution {
  const sourcePath = canonicalPath(root, absolutePath);
  let document: MarkdownDocument;
  try {
    document = readMarkdownDocument(absolutePath);
  } catch (error) {
    return resolverExclusion(
      sourcePath,
      error instanceof Error && /EACCES|EPERM/.test(error.message)
        ? "inaccessible"
        : "invalid provenance"
    );
  }

  const id =
    typeof document.frontmatter.id === "string"
      ? document.frontmatter.id
      : undefined;
  const sourceHash = sha256(document.source);
  const details = { ...(id ? { id } : {}), sourceHash };
  if (!isAccepted(document.frontmatter)) {
    return resolverExclusion(sourcePath, "not accepted", details);
  }
  if (document.frontmatter.type !== "Evidence Contribution") {
    return resolverExclusion(sourcePath, "invalid provenance", details);
  }

  const evidenceMethod = document.frontmatter.method;
  const provenance = document.frontmatter.provenance;
  if (!isRecord(evidenceMethod) || !isRecord(provenance)) {
    return resolverExclusion(sourcePath, "invalid provenance", details);
  }
  if (
    evidenceMethod.id !== method.id ||
    evidenceMethod.version !== method.version ||
    provenance.template_id !== "evidence-template" ||
    typeof provenance.template_version !== "string"
  ) {
    return resolverExclusion(sourcePath, "invalid provenance", details);
  }

  const templateKey = `evidence-template@${provenance.template_version}`;
  const template = templates.get(templateKey);
  if (!template) {
    return resolverExclusion(sourcePath, "invalid provenance", details);
  }
  if (
    provenance.template_path !== undefined &&
    provenance.template_path !== template.path
  ) {
    return resolverExclusion(sourcePath, "invalid provenance", details);
  }

  const values = valuesFromEvidence(document.frontmatter);
  const dimensionValues: Record<string, LedgerDimensionValue> = {};
  for (const dimension of template.dimensions) {
    const value = dimensionValue(
      template.fields[dimension.id],
      values[dimension.id]
    );
    if (value) dimensionValues[dimension.id] = value;
  }
  const classification = classifyScope(filters, template, values);
  if (classification.invalid) {
    return resolverExclusion(sourcePath, "invalid provenance", {
      ...details,
      methodId: method.id,
      methodVersion: method.version,
      templateVersion: template.version,
      dimensionValues,
      scopeValues: classification.scopeValues,
    });
  }

  return {
    ...details,
    path: sourcePath,
    methodId: method.id,
    methodVersion: method.version,
    templateVersion: template.version,
    dimensionValues,
    scopeValues: classification.scopeValues,
    bucket: classification.bucket,
  };
}

/**
 * Generate a canonical, source-linked scope manifest for all methods.
 * It is intentionally file-backed and pure: no ranking, inference,
 * prose parsing, or mutation is performed.
 *
 * @param options Configuration for evidence ledger resolution
 * @returns EvidenceLedgerResolution containing all methods and their evidence
 */
export function resolveEvidenceLedger(
  options: ResolveEvidenceLedgerOptions
): EvidenceLedgerResolution {
  const root = path.resolve(options.researchRoot);

  const allMethods = readMethods(root);

  const templatesByMethod = new Map<string, Map<string, ResolvedTemplate>>();
  for (const method of allMethods) {
    const templates = resolveTemplates(root, method);
    const currentTemplatePath = path.join(
      root,
      "methods",
      method.id,
      "evidence-template.en.md"
    );
    if (!fs.existsSync(currentTemplatePath)) {
      throw new EvidenceLedgerResolutionError(
        `Method ${method.id} has no current evidence template`
      );
    }
    method.template = validateAndResolveTemplate(
      readMarkdownDocument(currentTemplatePath),
      canonicalPath(root, currentTemplatePath),
      method
    );
    templates.set(
      `${method.template.id}@${method.template.version}`,
      method.template
    );
    templatesByMethod.set(method.id, templates);
  }

  const filters = canonicalFilters(options.filters ?? []);
  validateScopeFilters(filters, templatesByMethod);

  const contributions: EvidenceLedgerContribution[] = [];
  for (const method of allMethods) {
    const evidenceRoot = path.join(root, "methods", method.id, "evidence");
    const templates = templatesByMethod.get(method.id) ?? new Map();
    for (const absolutePath of markdownFiles(evidenceRoot)) {
      contributions.push(
        resolveContribution(root, filters, method, templates, absolutePath)
      );
    }
  }
  contributions.sort((left, right) => byCodepoint(left.path, right.path));

  const acceptedEvidence = contributions.filter(
    (contribution) => contribution.bucket !== "Resolver exclusion"
  );
  const bucketCounts: Record<EvidenceLedgerBucket, number> = {
    Included: 0,
    "Outside declared scope": 0,
    Unknown: 0,
    Unavailable: 0,
    "Resolver exclusion": 0,
  };
  for (const contribution of contributions) {
    bucketCounts[contribution.bucket] += 1;
  }
  const methods = allMethods.map((method) => ({
    id: method.id,
    version: method.version,
    path: method.path,
    evidenceTemplate: publicTemplate(method.template!),
  }));
  const manifest: EvidenceLedgerManifest = {
    methods,
    filters,
    contributions,
  };

  return {
    methods,
    contributions,
    acceptedEvidence,
    scope: {
      filters,
      baselineCount: acceptedEvidence.length,
      bucketCounts,
    },
    manifest,
    manifestHash: sha256(JSON.stringify(canonicalize(manifest))),
  };
}

export type ResolveEvidenceLedgerSourceOptions = {
  /** The current method and its current template selected by the ledger. */
  method: EvidenceLedgerMethod;
  template: EvidenceLedgerTemplate;
  /** Normalized packets fetched by the source loader. No browser data is used. */
  contributions: EvidenceLedgerContribution[];
  filters?: LedgerScopeFilter[];
};

function validateSourceScopeFilters(
  filters: LedgerScopeFilter[],
  template: EvidenceLedgerTemplate
): void {
  const dimensions = new Map(
    template.dimensions.map((dimension) => [dimension.id, dimension])
  );
  for (const filter of filters) {
    const dimension = dimensions.get(filter.fieldId);
    if (!dimension) {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} is not declared by the selected evidence template`
      );
    }
    if (dimension.control !== filter.control) {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} has an incompatible control`
      );
    }
    if (filter.control === "multi-select") {
      if (
        dimension.type !== "select" ||
        filter.values.some((value) => !dimension.options?.includes(value))
      ) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} uses a value not declared by the selected evidence template`
        );
      }
      continue;
    }
    const expectedType = dimension.type === "number" ? "number" : "string";
    if (dimension.type !== "number" && dimension.type !== "date") {
      throw new EvidenceLedgerResolutionError(
        `Scope filter ${filter.fieldId} must use a multi-select control`
      );
    }
    for (const endpoint of [filter.min, filter.max]) {
      if (endpoint !== undefined && typeof endpoint !== expectedType) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be ${expectedType}`
        );
      }
      if (typeof endpoint === "number" && !Number.isFinite(endpoint)) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be finite numbers`
        );
      }
      if (
        dimension.type === "date" &&
        typeof endpoint === "string" &&
        !isValidDate(endpoint)
      ) {
        throw new EvidenceLedgerResolutionError(
          `Scope filter ${filter.fieldId} range endpoints must be valid dates in YYYY-MM-DD format`
        );
      }
    }
  }
}

/**
 * Resolve packets obtained from the public research repository. It deliberately
 * shares filter canonicalisation and bucket semantics with the file-backed
 * resolver above, so clients cannot evaluate or forge scope predicates.
 */
export function resolveEvidenceLedgerFromSource(
  options: ResolveEvidenceLedgerSourceOptions
): EvidenceLedgerResolution {
  const filters = canonicalFilters(options.filters ?? []);
  validateSourceScopeFilters(filters, options.template);

  const contributions: EvidenceLedgerContribution[] = options.contributions
    .map((source): EvidenceLedgerContribution => {
      if (source.bucket === "Resolver exclusion") return { ...source };

      const scopeValues: Record<string, LedgerScopeValue> = {};
      let unavailable = false;
      let unknown = false;
      let outside = false;
      for (const filter of filters) {
        // A filter targeting an invalid recorded value is a resolver exclusion
        // (same as the file-backed resolver's classifyScope invalid path).
        if (source.invalidDimensions?.includes(filter.fieldId)) {
          return {
            ...source,
            scopeValues: {
              ...scopeValues,
              [filter.fieldId]: { status: "unavailable" },
            },
            bucket: "Resolver exclusion",
            exclusionReason: "invalid provenance",
          };
        }
        const value = source.dimensionValues[filter.fieldId];
        if (!value) {
          scopeValues[filter.fieldId] = { status: "unavailable" };
          unavailable = true;
          continue;
        }
        scopeValues[filter.fieldId] = value;
        if (value.status === "unknown") {
          unknown = true;
          continue;
        }
        if (filter.control === "multi-select") {
          if (
            typeof value.value !== "string" ||
            !filter.values.includes(value.value)
          ) {
            outside = true;
          }
        } else if (
          (filter.min !== undefined && value.value < filter.min) ||
          (filter.max !== undefined && value.value > filter.max)
        ) {
          outside = true;
        }
      }

      const bucket: EvidenceLedgerBucket = unavailable
        ? "Unavailable"
        : unknown
          ? "Unknown"
          : outside
            ? "Outside declared scope"
            : "Included";
      return { ...source, scopeValues, bucket };
    })
    .sort((left, right) => byCodepoint(left.path, right.path));

  const bucketCounts: Record<EvidenceLedgerBucket, number> = {
    Included: 0,
    "Outside declared scope": 0,
    Unknown: 0,
    Unavailable: 0,
    "Resolver exclusion": 0,
  };
  for (const contribution of contributions)
    bucketCounts[contribution.bucket] += 1;

  const methods = [{ ...options.method, evidenceTemplate: options.template }];
  const manifest: EvidenceLedgerManifest = { methods, filters, contributions };
  return {
    methods,
    contributions,
    acceptedEvidence: contributions.filter(
      (contribution) => contribution.bucket !== "Resolver exclusion"
    ),
    scope: {
      filters,
      baselineCount: contributions.filter(
        (contribution) => contribution.bucket !== "Resolver exclusion"
      ).length,
      bucketCounts,
    },
    manifest,
    manifestHash: sha256(JSON.stringify(canonicalize(manifest))),
  };
}
