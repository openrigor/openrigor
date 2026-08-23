#!/usr/bin/env tsx

/**
 * Build the immutable template snapshot consumed by the web app.
 *
 * Usage:
 *   EVALUCHAT_TEMPLATE_SOURCE_ROOT=/path/to/knowledge/templates \
 *     yarn generate:templates
 *
 * Knowledge starters only. Platform method-run briefs are generated with
 * `yarn generate:platform-templates` from apps/web/templates/platform/.
 * Knowledge ids that match a platform template are omitted so a stale
 * Knowledge copy cannot reappear in Create → Templates.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const semver = /^\d+\.\d+\.\d+$/;
const fieldId = /^[a-z][a-z0-9_-]*$/;
const locale = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const dateValue = /^\d{4}-\d{2}-\d{2}$/;
const placeholder = /^\{\{([a-z][a-z0-9_-]*)\}\}$/;

const FormFieldSource = z
  .object({
    label: z.string().min(1),
    type: z.enum(["text", "textarea", "number", "date", "select", "roster"]),
    required: z.boolean().default(false),
    max_length: z.number().int().positive().optional(),
    display_chars: z.number().int().positive().optional(),
    display_lines: z.number().int().positive().optional(),
    options: z.array(z.string().min(1)).min(1).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    min_date: z.string().regex(dateValue).optional(),
    max_date: z.string().regex(dateValue).optional(),
  })
  .passthrough();

const TemplateBase = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(semver),
  locale: z.string().regex(locale),
  title: z.string().min(1),
  description: z.string().min(1),
  assistant: z.object({ guidance: z.string().min(1) }),
});

const MarkdownFrontmatter = TemplateBase.extend({
  type: z.literal("Markdown Template"),
  template_kind: z.literal("markdown"),
}).passthrough();

const FormFrontmatter = TemplateBase.extend({
  type: z
    .string()
    .refine(
      (value) => value.toLowerCase() === "form template",
      "type must be Form Template",
    ),
  template_kind: z.literal("form"),
  fields: z
    .record(z.string(), FormFieldSource)
    .refine(
      (fields) => Object.keys(fields).length > 0,
      "a form template must declare at least one field",
    ),
}).passthrough();

export type FormFieldDefinition = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "roster";
  required: boolean;
  maxLength?: number;
  displayChars?: number;
  displayLines?: number;
  options?: string[];
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
};

export type MarkdownCatalogEntry = {
  id: string;
  version: string;
  locale: string;
  title: string;
  description: string;
  templateKind: "markdown";
  sourcePath: string;
  initialMarkdown: string;
  assistantGuidance: string;
  contentHash: string;
};

export type FormCatalogEntry = {
  id: string;
  version: string;
  locale: string;
  title: string;
  description: string;
  templateKind: "form";
  sourcePath: string;
  layoutMarkdown: string;
  fields: Record<string, FormFieldDefinition>;
  assistantGuidance: string;
  contentHash: string;
};

export type CatalogEntry = MarkdownCatalogEntry | FormCatalogEntry;

export type GeneratedTemplateCatalog = {
  schemaVersion: 1;
  catalogRevision: string;
  templates: CatalogEntry[];
};

function hash(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function parseDocument(sourcePath: string): {
  frontmatter: unknown;
  body: string;
  source: string;
} {
  const source = fs.readFileSync(sourcePath, "utf8");
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Template has no YAML frontmatter: ${sourcePath}`);
  }
  return { frontmatter: yaml.load(match[1]), body: match[2].trim(), source };
}

function validateFormFields(
  fields: Record<string, z.infer<typeof FormFieldSource>>,
  sourcePath: string,
): Record<string, FormFieldDefinition> {
  const result: Record<string, FormFieldDefinition> = {};
  for (const id of Object.keys(fields).sort()) {
    if (!fieldId.test(id)) {
      throw new Error(`Invalid form field id "${id}" in ${sourcePath}`);
    }
    const field = fields[id];
    if (field.options && new Set(field.options).size !== field.options.length) {
      throw new Error(`Duplicate select options for "${id}" in ${sourcePath}`);
    }
    if (field.type === "select" && !field.options) {
      throw new Error(`Select field "${id}" needs options in ${sourcePath}`);
    }
    if (field.type !== "select" && field.options) {
      throw new Error(`Only select fields may declare options for "${id}"`);
    }
    if (
      field.type !== "number" &&
      (field.min !== undefined || field.max !== undefined)
    ) {
      throw new Error(`Only number fields may declare min/max for "${id}"`);
    }
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      throw new Error(
        `Field "${id}" has min greater than max in ${sourcePath}`,
      );
    }
    if (field.type !== "date" && (field.min_date || field.max_date)) {
      throw new Error(`Only date fields may declare date bounds for "${id}"`);
    }
    if (field.min_date && field.max_date && field.min_date > field.max_date) {
      throw new Error(
        `Field "${id}" has min_date greater than max_date in ${sourcePath}`,
      );
    }
    result[id] = {
      id,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.max_length === undefined
        ? {}
        : { maxLength: field.max_length }),
      ...(field.display_chars === undefined
        ? {}
        : { displayChars: field.display_chars }),
      ...(field.display_lines === undefined
        ? {}
        : { displayLines: field.display_lines }),
      ...(field.options === undefined ? {} : { options: field.options }),
      ...(field.min === undefined ? {} : { min: field.min }),
      ...(field.max === undefined ? {} : { max: field.max }),
      ...(field.min_date === undefined ? {} : { minDate: field.min_date }),
      ...(field.max_date === undefined ? {} : { maxDate: field.max_date }),
    };
  }
  return result;
}

function assertPlaceholders(
  layoutMarkdown: string,
  fields: Record<string, FormFieldDefinition>,
  sourcePath: string,
): void {
  const used = new Set<string>();
  const tokenPattern = /\{\{[\s\S]*?\}\}/g;
  for (const token of layoutMarkdown.match(tokenPattern) || []) {
    const match = token.match(placeholder);
    if (!match) {
      throw new Error(`Malformed form placeholder "${token}" in ${sourcePath}`);
    }
    used.add(match[1]);
    if (!fields[match[1]]) {
      throw new Error(
        `Unknown form placeholder "${match[1]}" in ${sourcePath}`,
      );
    }
  }
  const remainder = layoutMarkdown.replace(tokenPattern, "");
  if (remainder.includes("{{") || remainder.includes("}}")) {
    throw new Error(`Malformed form placeholder syntax in ${sourcePath}`);
  }
  for (const id of Object.keys(fields)) {
    if (!used.has(id)) {
      throw new Error(`Declared form field "${id}" is unused in ${sourcePath}`);
    }
  }
}

export type CatalogBuildOptions = {
  sourcePathPrefix?: string;
  excludeIds?: Iterable<string>;
};

function catalogSourcePath(
  sourcePath: string,
  sourcePathPrefix = "templates",
): string {
  return `${sourcePathPrefix.replace(/\/$/, "")}/${path.basename(sourcePath)}`;
}

export function parseTemplate(
  sourcePath: string,
  options: Pick<CatalogBuildOptions, "sourcePathPrefix"> = {},
): CatalogEntry {
  const {
    frontmatter: rawFrontmatter,
    body,
    source,
  } = parseDocument(sourcePath);
  const base = TemplateBase.parse(rawFrontmatter);
  const relativeSourcePath = catalogSourcePath(
    sourcePath,
    options.sourcePathPrefix,
  );

  if (typeof rawFrontmatter === "object" && rawFrontmatter !== null) {
    const raw = rawFrontmatter as Record<string, unknown>;
    if (raw.template_kind === "markdown") {
      MarkdownFrontmatter.parse(rawFrontmatter);
      if (!body) throw new Error(`Template body is empty: ${sourcePath}`);
      return {
        id: base.id,
        version: base.version,
        locale: base.locale,
        title: base.title,
        description: base.description,
        templateKind: "markdown",
        sourcePath: relativeSourcePath,
        initialMarkdown: `${body}\n`,
        assistantGuidance: base.assistant.guidance.trim(),
        contentHash: hash(source),
      };
    }
  }

  const frontmatter = FormFrontmatter.parse(rawFrontmatter);
  if (!body) throw new Error(`Form template body is empty: ${sourcePath}`);
  const fields = validateFormFields(frontmatter.fields, sourcePath);
  assertPlaceholders(body, fields, sourcePath);
  return {
    id: frontmatter.id,
    version: frontmatter.version,
    locale: frontmatter.locale,
    title: frontmatter.title,
    description: frontmatter.description,
    templateKind: "form",
    sourcePath: relativeSourcePath,
    layoutMarkdown: `${body}\n`,
    fields,
    assistantGuidance: frontmatter.assistant.guidance.trim(),
    contentHash: hash(source),
  };
}

export function platformTemplateRoot(): string {
  return path.join(repoRoot, "apps/web/templates/platform");
}

export function workspaceTemplateRoot(): string {
  return path.join(repoRoot, "apps/web/templates/workspace");
}

export function mergeCatalogs(
  base: GeneratedTemplateCatalog,
  extra: GeneratedTemplateCatalog,
): GeneratedTemplateCatalog {
  const byId = new Map(base.templates.map((entry) => [entry.id, entry]));
  for (const entry of extra.templates) byId.set(entry.id, entry);
  const templates = [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return {
    schemaVersion: 1,
    catalogRevision: hash(JSON.stringify(templates)),
    templates,
  };
}

export function mergeWorkspaceTemplates(
  catalog: GeneratedTemplateCatalog,
  sourceRoot = workspaceTemplateRoot(),
): GeneratedTemplateCatalog {
  if (!fs.existsSync(sourceRoot)) return catalog;
  return mergeCatalogs(
    catalog,
    buildCatalog(sourceRoot, { sourcePathPrefix: "templates/workspace" }),
  );
}

export function platformTemplateIds(
  sourceRoot = platformTemplateRoot(),
): string[] {
  if (!fs.existsSync(sourceRoot)) return [];
  return buildCatalog(sourceRoot, {
    sourcePathPrefix: "templates/platform",
  }).templates.map((entry) => entry.id);
}

export function buildCatalog(
  sourceRoot: string,
  options: CatalogBuildOptions = {},
): GeneratedTemplateCatalog {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Template source directory not found: ${sourceRoot}`);
  }

  const exclude = new Set(options.excludeIds ?? []);
  const entries = fs
    .readdirSync(sourceRoot)
    .filter((filename) => filename.endsWith(".md"))
    .sort()
    .map((filename) =>
      parseTemplate(path.join(sourceRoot, filename), {
        sourcePathPrefix: options.sourcePathPrefix,
      }),
    )
    .filter((entry) => !exclude.has(entry.id));

  if (!entries.length) {
    throw new Error(`No templates found in ${sourceRoot}`);
  }

  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id))
      throw new Error(`Duplicate template id: ${entry.id}`);
    ids.add(entry.id);
  }

  const canonical = JSON.stringify(entries);
  return {
    schemaVersion: 1,
    catalogRevision: hash(canonical),
    templates: entries,
  };
}

export function writeCatalog(
  sourceRoot: string,
  outputPath: string,
  options: CatalogBuildOptions = {},
): void {
  const artifact = buildCatalog(sourceRoot, options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const sourceRootValue = process.env.EVALUCHAT_TEMPLATE_SOURCE_ROOT?.trim();
  if (!sourceRootValue) {
    throw new Error(
      "EVALUCHAT_TEMPLATE_SOURCE_ROOT is required; generate from evaluchat/knowledge@dev",
    );
  }
  const outputPath = path.resolve(
    process.env.EVALUCHAT_TEMPLATE_CATALOG_OUTPUT ||
      path.join(repoRoot, "apps/web/data/template-catalog.json"),
  );
  const knowledge = buildCatalog(path.resolve(sourceRootValue), {
    excludeIds: platformTemplateIds(),
  });
  const artifact = mergeWorkspaceTemplates(knowledge);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `Generated ${path.relative(repoRoot, outputPath)} from ${path.resolve(sourceRootValue)} and ${workspaceTemplateRoot()}`,
  );
}
