import { readFile } from "fs/promises";
import { join } from "path";

export interface AssignmentRegistryEntry {
  assignmentId: string;
  assignedStudentIds: string[];
  assignedAt: string;
}

function resolveFilePath(): string {
  return (
    process.env.TEACHING_REGISTRY_PATH?.trim() ||
    join(process.cwd(), "data", "teaching", "registry.json")
  );
}

export async function readAssignmentRegistry(): Promise<
  AssignmentRegistryEntry[]
> {
  try {
    const raw = await readFile(resolveFilePath(), "utf-8");
    const registry = JSON.parse(raw) as unknown;
    return Array.isArray(registry)
      ? (registry as AssignmentRegistryEntry[])
      : [];
  } catch {
    return [];
  }
}

export async function isAssignmentAssignedToStudent(
  assignmentId: string,
  studentId: string
): Promise<boolean> {
  const registry = await readAssignmentRegistry();
  return registry.some(
    (entry) =>
      entry.assignmentId === assignmentId &&
      Array.isArray(entry.assignedStudentIds) &&
      entry.assignedStudentIds.includes(studentId)
  );
}
