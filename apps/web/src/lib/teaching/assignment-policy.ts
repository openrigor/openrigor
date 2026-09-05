import type {
  AssignmentLifecycleStatus,
  AssignmentTier,
  StudentAssignment,
} from "./types";
import {
  DEFAULT_LANGUAGE_LOCALE,
  LANGUAGE_LOCALES,
  isLanguageLocale,
} from "@opencanvas/shared";

/**
 * Education assignments are free in the public beta.  These helpers keep
 * legacy assignment files readable while deliberately leaving billing out of
 * the public application.
 */
export const FREE_ACTIVE_ASSIGNMENT_CAP = Number.POSITIVE_INFINITY;
export const FREE_STUDENTS_PER_ASSIGNMENT_CAP = 100;

export function normalizeAssignmentTier(
  tier: AssignmentTier | undefined | null
): AssignmentTier {
  void tier;
  return "free";
}

export function normalizeLifecycleStatus(
  status: AssignmentLifecycleStatus | undefined | null
): AssignmentLifecycleStatus {
  return status === "closed" ? "closed" : "open";
}

/** Normalize assignment content language for legacy and untrusted rows. */
export function normalizeAssignmentLocale(locale: unknown): string {
  return typeof locale === "string" && isLanguageLocale(locale)
    ? locale
    : DEFAULT_LANGUAGE_LOCALE;
}

/** Return the registry label for a non-English assignment locale. */
export function assignmentLocaleLabel(locale: unknown): string | undefined {
  const normalized = normalizeAssignmentLocale(locale);
  if (normalized === DEFAULT_LANGUAGE_LOCALE) return undefined;
  return LANGUAGE_LOCALES.find(({ code }) => code === normalized)?.label;
}

export function normalizeAssignmentFields<T extends Partial<StudentAssignment>>(
  assignment: T
): T & {
  tier: AssignmentTier;
  lifecycleStatus: AssignmentLifecycleStatus;
  locale: string;
} {
  return {
    ...assignment,
    tier: normalizeAssignmentTier(assignment.tier),
    lifecycleStatus: normalizeLifecycleStatus(assignment.lifecycleStatus),
    locale: normalizeAssignmentLocale(assignment.locale),
  };
}

/** Legacy names retained while the beta removes commercial routing. */
export const normalizeAssignmentCommercialFields = normalizeAssignmentFields;

export function assertFreeAssignmentCap(
  assignments: StudentAssignment[],
  _teacherId?: string
): { ok: true } | { ok: false; error: string } {
  // There is no paid tier or active-assignment billing cap in the public beta.
  // Keep the function so older API callers continue to compile.
  void assignments;
  return { ok: true };
}

export function assertStudentCap(
  studentIds: string[],
  _tier?: AssignmentTier | null,
  cap = FREE_STUDENTS_PER_ASSIGNMENT_CAP
): { ok: true } | { ok: false; error: string; count: number } {
  if (studentIds.length > cap) {
    return {
      ok: false,
      count: studentIds.length,
      error: `Assignments may have at most ${cap} students.`,
    };
  }
  return { ok: true };
}
