import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import generatedCatalog from "../../../data/template-catalog.json";
import generatedPlatformCatalog from "../../../data/platform-template-catalog.json";
import { FINDING_STARTER_TEMPLATE_ID } from "./types";

export { FINDING_STARTER_TEMPLATE_ID };

export function isFindingStarterTemplate(id: string): boolean {
  return id === FINDING_STARTER_TEMPLATE_ID;
}

const FormFieldSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    label: z.string().min(1),
    type: z.enum(["text", "textarea", "number", "date", "select", "roster"]),
    required: z.boolean(),
    maxLength: z.number().int().positive().optional(),
    displayChars: z.number().int().positive().optional(),
    displayLines: z.number().int().positive().optional(),
    options: z.array(z.string().min(1)).min(1).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    minDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    maxDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((field, context) => {
    if (field.type === "select" && !field.options) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "select needs options",
      });
    }
    if (field.type !== "select" && field.options) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "options only apply to select",
      });
    }
    if (field.options && new Set(field.options).size !== field.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "select options must be unique",
      });
    }
    if (
      field.type !== "number" &&
      (field.min !== undefined || field.max !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "min/max only apply to number",
      });
    }
    if (
      field.type !== "date" &&
      (field.minDate !== undefined || field.maxDate !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date bounds only apply to date",
      });
    }
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "min must not exceed max",
      });
    }
    if (
      field.minDate !== undefined &&
      field.maxDate !== undefined &&
      field.minDate > field.maxDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minDate must not exceed maxDate",
      });
    }
  });

const CommonEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  locale: z.string(),
  title: z.string(),
  description: z.string(),
  sourcePath: z.string(),
  assistantGuidance: z.string(),
  contentHash: z.string(),
});

const MarkdownEntrySchema = CommonEntrySchema.extend({
  templateKind: z.literal("markdown"),
  initialMarkdown: z.string(),
});

const FormEntrySchema = CommonEntrySchema.extend({
  templateKind: z.literal("form"),
  layoutMarkdown: z.string(),
  fields: z.record(z.string(), FormFieldSchema),
}).superRefine((entry, context) => {
  const used = new Set<string>();
  const tokenPattern = /\{\{[\s\S]*?\}\}/g;
  for (const token of entry.layoutMarkdown.match(tokenPattern) || []) {
    const match = token.match(/^\{\{([a-z][a-z0-9_-]*)\}\}$/);
    if (!match || !entry.fields[match[1]]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `invalid form placeholder ${token}`,
      });
      continue;
    }
    used.add(match[1]);
  }
  const remainder = entry.layoutMarkdown.replace(tokenPattern, "");
  if (remainder.includes("{{") || remainder.includes("}}")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "malformed form placeholder syntax",
    });
  }
  for (const [id, field] of Object.entries(entry.fields)) {
    if (field.id !== id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `field id does not match ${id}`,
      });
    }
    if (!used.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unused form field ${id}`,
      });
    }
  }
});

const CatalogEntrySchema = z.union([MarkdownEntrySchema, FormEntrySchema]);

const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogRevision: z.string().min(1),
  templates: z.array(CatalogEntrySchema).min(1),
});

export type FormFieldDefinition = z.infer<typeof FormFieldSchema>;
export type MarkdownTemplateCatalogEntry = z.infer<typeof MarkdownEntrySchema>;
export type FormTemplateCatalogEntry = z.infer<typeof FormEntrySchema>;
export type TemplateCatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type TemplateCatalog = z.infer<typeof CatalogSchema>;

let lastKnownGood: TemplateCatalog | undefined;
let lastExternalRevision: string | undefined;
let lastExternalMeta: { mtimeMs: number; size: number } | undefined;

function parseCatalog(raw: string): TemplateCatalog {
  return CatalogSchema.parse(JSON.parse(raw));
}

function externalCatalogPath(): string | undefined {
  const configured = process.env.EVALUCHAT_TEMPLATE_CATALOG_PATH?.trim();
  if (!configured || !existsSync(configured)) return undefined;
  if (statSync(configured).isDirectory()) {
    for (const filename of ["catalog.json", "template-catalog.json"]) {
      const candidate = join(configured, filename);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  return configured;
}

function fallbackCatalog(): TemplateCatalog {
  const parsed = CatalogSchema.safeParse(generatedCatalog);
  if (!parsed.success || parsed.data.templates.length === 0) {
    throw new Error("Generated template catalog is missing or malformed");
  }
  return parsed.data;
}

function platformCatalog(): TemplateCatalog {
  const parsed = CatalogSchema.safeParse(generatedPlatformCatalog);
  if (!parsed.success || parsed.data.templates.length === 0) {
    throw new Error(
      "Generated platform template catalog is missing or malformed"
    );
  }
  return parsed.data;
}

/** Knowledge/workspace starters. External catalog deploys may replace this snapshot. */
export function getTemplateCatalog(): TemplateCatalog {
  const path = externalCatalogPath();
  if (!path) {
    if (!lastKnownGood) lastKnownGood = fallbackCatalog();
    return lastKnownGood;
  }

  try {
    const metadata = statSync(path);
    if (
      lastKnownGood &&
      lastExternalRevision !== undefined &&
      lastExternalMeta &&
      lastExternalMeta.mtimeMs === metadata.mtimeMs &&
      lastExternalMeta.size === metadata.size
    ) {
      return lastKnownGood;
    }

    const parsed = parseCatalog(readFileSync(path, "utf8"));
    lastKnownGood = parsed;
    lastExternalRevision = parsed.catalogRevision;
    lastExternalMeta = {
      mtimeMs: metadata.mtimeMs,
      size: metadata.size,
    };
    return parsed;
  } catch (error) {
    console.error("[workspace] ignoring malformed template catalog", error);
    lastExternalRevision = undefined;
    lastExternalMeta = undefined;
    if (lastKnownGood) return lastKnownGood;
    lastKnownGood = fallbackCatalog();
    return lastKnownGood;
  }
}

export function getPlatformTemplateCatalog(): TemplateCatalog {
  return platformCatalog();
}

export function isPlatformTemplateId(id: string): boolean {
  return getPlatformTemplateCatalog().templates.some(
    (template) => template.id === id
  );
}

export function catalogForTemplateId(id: string): TemplateCatalog {
  return isPlatformTemplateId(id)
    ? getPlatformTemplateCatalog()
    : getTemplateCatalog();
}

export function getTemplateById(id: string): TemplateCatalogEntry | undefined {
  return (
    getPlatformTemplateCatalog().templates.find(
      (template) => template.id === id
    ) ?? getTemplateCatalog().templates.find((template) => template.id === id)
  );
}

/** True when Create → Templates may instantiate this catalog id. */
export function isSelectableTemplate(id: string): boolean {
  return (
    !isPlatformTemplateId(id) &&
    getTemplateCatalog().templates.some((template) => template.id === id)
  );
}

export function searchTemplates(query: string): TemplateCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return getTemplateCatalog()
    .templates.filter((template) => {
      if (isPlatformTemplateId(template.id)) return false;
      if (!needle) return true;
      return [template.id, template.title, template.description].some((value) =>
        value.toLowerCase().includes(needle)
      );
    })
    .slice(0, 5);
}
