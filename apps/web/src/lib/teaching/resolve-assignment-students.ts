import type { ClassStudent, StudentClassData } from "./types";

export type RosterStudent = {
  id: string;
  email: string;
  name: string;
};

/** Resolve enrolled student user IDs for a class (skips pending invites without an id). */
export function studentIdsFromClass(
  studentClass: StudentClassData | undefined
): string[] {
  if (!studentClass) return [];
  return studentClass.students
    .map((student: ClassStudent) => student.supabaseUserId)
    .filter((id) => id.length > 0);
}

/** Unique accepted students across a teacher's classes (for assign UI / API). */
export function rosterStudentsFromClasses(
  classes: StudentClassData[]
): RosterStudent[] {
  const byId = new Map<string, RosterStudent>();
  for (const studentClass of classes) {
    for (const student of studentClass.students) {
      if (!student.supabaseUserId) continue;
      if (byId.has(student.supabaseUserId)) continue;
      byId.set(student.supabaseUserId, {
        id: student.supabaseUserId,
        email: student.email,
        name: student.name || "",
      });
    }
  }
  return Array.from(byId.values());
}

export function resolveAssignmentStudentIds(input: {
  assignMode: "all_students" | "selected_students" | "class";
  students: { id: string }[];
  classes: StudentClassData[];
  selectedClassId: string;
  selectedStudentIds: string[];
}): string[] {
  if (input.assignMode === "all_students") {
    return input.students.map((s) => s.id);
  }
  if (input.assignMode === "class") {
    const studentClass = input.classes.find(
      (entry) => entry.id === input.selectedClassId
    );
    return studentIdsFromClass(studentClass);
  }
  return [...input.selectedStudentIds];
}
