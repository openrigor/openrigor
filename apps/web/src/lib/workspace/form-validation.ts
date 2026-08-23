import type { FormFieldDefinition, FormValue, SubmittedForm } from "./types";

export type FormValidationIssue = {
  fieldId: string;
  message: string;
};

export class FormValidationError extends Error {
  constructor(public readonly issues: FormValidationIssue[]) {
    super("Form values are invalid");
    this.name = "FormValidationError";
  }
}

export class FormAlreadySubmittedError extends Error {
  constructor() {
    super("Form has already been submitted");
    this.name = "FormAlreadySubmittedError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function normaliseRoster(value: unknown): string[] | undefined {
  const parts = Array.isArray(value)
    ? value.flatMap((part) => (typeof part === "string" ? [part] : []))
    : typeof value === "string"
      ? value.split(/[;,\n]/)
      : [];
  const emails = parts
    .flatMap((part) => part.split(/[;,\n]/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(emails)];
}

const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFormValues(
  fields: Record<string, FormFieldDefinition>,
  rawValues: unknown
): Record<string, FormValue> {
  const issues: FormValidationIssue[] = [];
  if (!isRecord(rawValues)) {
    throw new FormValidationError([
      { fieldId: "_form", message: "Submit values as an object." },
    ]);
  }

  for (const key of Object.keys(rawValues)) {
    if (!fields[key]) {
      issues.push({
        fieldId: key,
        message: "This field is not part of the template.",
      });
    }
  }

  const values: Record<string, FormValue> = {};
  for (const [fieldId, field] of Object.entries(fields)) {
    const raw = rawValues[fieldId];
    const blank = raw === undefined || raw === null || raw === "";

    if (field.type === "roster") {
      const roster = normaliseRoster(raw);
      if (!roster || (field.required && roster.length === 0)) {
        issues.push({ fieldId, message: `${field.label} is required.` });
        values[fieldId] = roster || [];
        continue;
      }
      const invalid = roster.find((address) => !email.test(address));
      if (invalid) {
        issues.push({
          fieldId,
          message: `${field.label} contains an invalid email address.`,
        });
      }
      const joined = roster.join(", ");
      if (field.maxLength && joined.length > field.maxLength) {
        issues.push({
          fieldId,
          message: `${field.label} must be ${field.maxLength} characters or fewer.`,
        });
      }
      values[fieldId] = roster;
      continue;
    }

    if (field.type === "number") {
      if (blank && field.required) {
        issues.push({ fieldId, message: `${field.label} is required.` });
        continue;
      }
      if (blank && !field.required) {
        values[fieldId] = "";
        continue;
      }
      if (typeof raw !== "number" && typeof raw !== "string") {
        issues.push({ fieldId, message: `${field.label} must be a number.` });
        continue;
      }
      const number = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(number)) {
        issues.push({ fieldId, message: `${field.label} must be a number.` });
        continue;
      }
      if (field.min !== undefined && number < field.min) {
        issues.push({
          fieldId,
          message: `${field.label} must be at least ${field.min}.`,
        });
      }
      if (field.max !== undefined && number > field.max) {
        issues.push({
          fieldId,
          message: `${field.label} must be at most ${field.max}.`,
        });
      }
      values[fieldId] = number;
      continue;
    }

    if (!blank && typeof raw !== "string") {
      issues.push({ fieldId, message: `${field.label} must be text.` });
      values[fieldId] = "";
      continue;
    }
    const stringValue = typeof raw === "string" ? raw : "";
    if (field.required && !stringValue.trim()) {
      issues.push({ fieldId, message: `${field.label} is required.` });
    }
    if (field.maxLength && stringValue.length > field.maxLength) {
      issues.push({
        fieldId,
        message: `${field.label} must be ${field.maxLength} characters or fewer.`,
      });
    }
    if (field.type === "date" && stringValue && !isValidDate(stringValue)) {
      issues.push({ fieldId, message: `${field.label} must be a valid date.` });
    }
    if (field.type === "date" && stringValue) {
      if (field.minDate && stringValue < field.minDate) {
        issues.push({
          fieldId,
          message: `${field.label} is before the allowed date.`,
        });
      }
      if (field.maxDate && stringValue > field.maxDate) {
        issues.push({
          fieldId,
          message: `${field.label} is after the allowed date.`,
        });
      }
    }
    if (
      field.type === "select" &&
      stringValue &&
      !field.options?.includes(stringValue)
    ) {
      issues.push({
        fieldId,
        message: `${field.label} has an invalid option.`,
      });
    }
    values[fieldId] = stringValue;
  }

  if (issues.length) throw new FormValidationError(issues);
  return values;
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

export function resolveFormMarkdown(
  layoutMarkdown: string,
  fields: Record<string, FormFieldDefinition>,
  values: Record<string, FormValue>
): string {
  return layoutMarkdown.replace(
    /\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_token, fieldId: string) => {
      const field = fields[fieldId];
      const value = values[fieldId];
      if (!field) return "";
      const text = Array.isArray(value)
        ? value.join(", ")
        : value === undefined
          ? ""
          : String(value);
      return escapeMarkdown(text);
    }
  );
}

export function submissionEquals(
  left: SubmittedForm,
  values: Record<string, FormValue>,
  resolvedMarkdown: string
): boolean {
  return (
    left.resolvedMarkdown === resolvedMarkdown &&
    JSON.stringify(left.values) === JSON.stringify(values)
  );
}
