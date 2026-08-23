import type { StudentAssignment } from "./types";

/**
 * Custom assignments belonging to a teacher.
 * Assignments without teacherId are treated as unowned (visible to nobody
 * via this filter) — migrate legacy rows before relying on them.
 */
export function customAssignmentsForTeacher(
  assignments: StudentAssignment[],
  teacherId: string
): StudentAssignment[] {
  return assignments.filter((a) => a.teacherId === teacherId);
}

/**
 * Replace one teacher's custom assignments in the global list, leaving
 * every other teacher's rows untouched. Prevents full-overwrite wipes.
 */
export function mergeTeacherAssignments(
  all: StudentAssignment[],
  teacherId: string,
  teacherAssignments: StudentAssignment[]
): StudentAssignment[] {
  const others = all.filter((a) => a.teacherId !== teacherId);
  const owned = teacherAssignments.map((a) => ({
    ...a,
    teacherId,
  }));
  return [...others, ...owned];
}

/** True when the teacher may mutate this custom assignment. */
export function teacherOwnsAssignment(
  assignment: StudentAssignment | undefined,
  teacherId: string
): boolean {
  if (!assignment) return false;
  return assignment.teacherId === teacherId;
}
