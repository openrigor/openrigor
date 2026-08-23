import type { StudentAssignment } from "./types";
import { getOrgByAdmin } from "./org-store";

/**
 * Teacher ids whose work the viewer may read.
 * Always includes self; org admins also get `org.teacherIds`.
 * Mutate rights stay strict via `teacherOwnsAssignment` (owning teacherId only).
 */
export async function resolveTeacherReadScope(
  viewerId: string
): Promise<string[]> {
  const trimmed = viewerId.trim();
  if (!trimmed) return [];

  const org = await getOrgByAdmin(trimmed);
  if (!org) return [trimmed];

  return Array.from(new Set([trimmed, ...org.teacherIds]));
}

/**
 * True when the viewer may read `targetTeacherId`'s classes / assignments /
 * submissions (self, or a teacher linked under the viewer's org).
 */
export async function canReadTeacherWork(
  viewerId: string,
  targetTeacherId: string
): Promise<boolean> {
  const viewer = viewerId.trim();
  const target = targetTeacherId.trim();
  if (!viewer || !target) return false;
  if (viewer === target) return true;

  const org = await getOrgByAdmin(viewer);
  if (!org) return false;
  return org.teacherIds.includes(target);
}

/** Filter customs to any of the given teacher ids (read-scope helper). */
export function customAssignmentsForTeacherIds(
  assignments: StudentAssignment[],
  teacherIds: readonly string[]
): StudentAssignment[] {
  const set = new Set(teacherIds);
  return assignments.filter(
    (assignment) =>
      typeof assignment.teacherId === "string" && set.has(assignment.teacherId)
  );
}
