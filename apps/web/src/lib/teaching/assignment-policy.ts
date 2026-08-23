import type {
  AssignmentLifecycleStatus,
  AssignmentTier,
  StudentAssignment,
} from "./types";

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

export function normalizeAssignmentFields<T extends Partial<StudentAssignment>>(
  assignment: T
): T & { tier: AssignmentTier; lifecycleStatus: AssignmentLifecycleStatus } {
  return {
    ...assignment,
    tier: normalizeAssignmentTier(assignment.tier),
    lifecycleStatus: normalizeLifecycleStatus(assignment.lifecycleStatus),
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
