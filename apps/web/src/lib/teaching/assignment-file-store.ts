import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { StudentAssignment } from "./types";
import {
  customAssignmentsForTeacher,
  mergeTeacherAssignments,
  teacherOwnsAssignment,
} from "./assignment-ownership";
import { normalizeAssignmentFields } from "./assignment-policy";

const DEFAULT_DATA_DIR = join(process.cwd(), "data", "teaching");

function resolveFilePath(): string {
  return (
    process.env.TEACHING_ASSIGNMENTS_PATH?.trim() ||
    join(DEFAULT_DATA_DIR, "assignments.json")
  );
}

function normalizeList(assignments: StudentAssignment[]): StudentAssignment[] {
  return assignments.map((a) => normalizeAssignmentFields(a));
}

export async function readAllCustomAssignments(): Promise<StudentAssignment[]> {
  try {
    const raw = await readFile(resolveFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as StudentAssignment[];
    return Array.isArray(parsed) ? normalizeList(parsed) : [];
  } catch {
    return [];
  }
}

async function writeAllCustomAssignments(
  assignments: StudentAssignment[]
): Promise<void> {
  const filePath = resolveFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(assignments, null, 2), "utf-8");
}

export async function listCustomAssignmentsForTeacher(
  teacherId: string
): Promise<StudentAssignment[]> {
  const all = await readAllCustomAssignments();
  return customAssignmentsForTeacher(all, teacherId);
}

export async function getCustomAssignmentById(
  id: string
): Promise<StudentAssignment | undefined> {
  const all = await readAllCustomAssignments();
  return all.find((a) => a.id === id);
}

/**
 * Replace the calling teacher's custom assignments only.
 * Other teachers' rows are preserved.
 */
export async function replaceTeacherCustomAssignments(
  teacherId: string,
  teacherAssignments: StudentAssignment[]
): Promise<StudentAssignment[]> {
  const all = await readAllCustomAssignments();
  const normalized = normalizeList(teacherAssignments);
  const merged = mergeTeacherAssignments(all, teacherId, normalized);
  await writeAllCustomAssignments(merged);
  return customAssignmentsForTeacher(merged, teacherId);
}

export async function deleteCustomAssignmentForTeacher(
  teacherId: string,
  id: string
): Promise<"deleted" | "not_found" | "forbidden"> {
  const all = await readAllCustomAssignments();
  const existing = all.find((a) => a.id === id);
  if (!existing) {
    return "not_found";
  }
  if (!teacherOwnsAssignment(existing, teacherId)) {
    return "forbidden";
  }
  await writeAllCustomAssignments(all.filter((a) => a.id !== id));
  return "deleted";
}

export async function closeCustomAssignmentForTeacher(
  teacherId: string,
  id: string
): Promise<
  | { ok: true; assignment: StudentAssignment }
  | { ok: false; error: "not_found" | "forbidden" | "already_closed" }
> {
  const all = await readAllCustomAssignments();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) {
    return { ok: false, error: "not_found" };
  }
  const existing = normalizeAssignmentFields(all[idx]);
  if (!teacherOwnsAssignment(existing, teacherId)) {
    return { ok: false, error: "forbidden" };
  }
  if (existing.lifecycleStatus === "closed") {
    return { ok: false, error: "already_closed" };
  }
  const closed: StudentAssignment = {
    ...existing,
    lifecycleStatus: "closed",
    closedAt: new Date().toISOString(),
  };
  all[idx] = closed;
  await writeAllCustomAssignments(all);
  return { ok: true, assignment: closed };
}
