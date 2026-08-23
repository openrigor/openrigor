import { getAssignmentById, getSeedAssignments } from "./assignments";
import type { StudentAssignment } from "./types";

/**
 * Seed assignments loaded from data/teaching/seed-assignments.json.
 * Returns empty array if no seed file exists.
 *
 * Use the async getSeedAssignments() for server-side code.
 * This file exists for backward compat with client imports.
 */

export async function getSampleAssignments(): Promise<StudentAssignment[]> {
  return getSeedAssignments();
}

export function assignmentMetaLine(assignment: StudentAssignment): string {
  return `${assignment.courseLabel} · ${assignment.teacherName} · Due ${assignment.dueLabel}`;
}

export { getAssignmentById, getSeedAssignments };
