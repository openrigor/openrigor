import type { Thread } from "@langchain/langgraph-sdk";
import type { AssignmentEntry } from "./assignment-registry";
import type { StudentClassData, TeachingThreadMetadata } from "./types";

/** Collect enrolled student user ids across a teacher's classes. */
export function studentIdsFromClasses(
  classes: StudentClassData[]
): Set<string> {
  const ids = new Set<string>();
  for (const studentClass of classes) {
    for (const student of studentClass.students) {
      if (student.supabaseUserId) {
        ids.add(student.supabaseUserId);
      }
    }
  }
  return ids;
}

/**
 * Keep only threads whose supabase_user_id is one of the teacher's students.
 * Prevents cross-teacher leakage when assignment_id is a shared seed catalog id.
 */
export function filterThreadsByStudentIds(
  threads: Thread[],
  teacherStudentIds: Set<string>
): Thread[] {
  if (teacherStudentIds.size === 0) return [];
  return threads.filter((thread) => {
    const metadata = thread.metadata as unknown as TeachingThreadMetadata;
    const userId = metadata?.supabase_user_id;
    return !!userId && teacherStudentIds.has(userId);
  });
}

/**
 * True when a registry entry assigns this seed/assignment to at least one of
 * the teacher's own students (legacy seed-id assignments).
 */
export function registryTouchesTeacherStudents(
  entry: AssignmentEntry | undefined,
  teacherStudentIds: Set<string>
): boolean {
  if (!entry) return false;
  return entry.assignedStudentIds.some((id) => teacherStudentIds.has(id));
}
