import type { AssignmentEntry } from "./assignment-registry";

/**
 * Student-visible assignments come only from the assignment registry.
 * Seed JSON is a teacher-side catalog — never auto-shown to every student.
 */
export function assignmentIdsForStudent(
  registry: AssignmentEntry[],
  studentId: string
): string[] {
  return registry
    .filter((entry) => entry.assignedStudentIds.includes(studentId))
    .map((entry) => entry.assignmentId);
}

/** True when a teacher has assigned this assignment to at least one student. */
export function isAssignmentInRegistry(
  registry: AssignmentEntry[],
  assignmentId: string
): boolean {
  return registry.some((entry) => entry.assignmentId === assignmentId);
}
