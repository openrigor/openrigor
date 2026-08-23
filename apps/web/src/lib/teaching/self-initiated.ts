import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { StudentAssignment } from "./types";

const DEFAULT_DATA_DIR = join(process.cwd(), "data", "teaching");

function assignmentsFilePath(): string {
  return (
    process.env.TEACHING_ASSIGNMENTS_PATH?.trim() ||
    join(DEFAULT_DATA_DIR, "assignments.json")
  );
}

function registryFilePath(): string {
  return (
    process.env.TEACHING_REGISTRY_PATH?.trim() ||
    join(DEFAULT_DATA_DIR, "registry.json")
  );
}

async function readJson<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

interface RegistryEntry {
  assignmentId: string;
  assignedStudentIds: string[];
  assignedAt: string;
}

/**
 * Create a student-initiated assignment-style thread record and register it for
 * the owning student so it appears in their assignment list. Reuses the same
 * StudentAssignment shape + registry discriminator as teacher assignments —
 * the only difference is that the student owns it (teacherId = student id).
 */
export async function createStudentInitiatedAssignment(input: {
  id: string;
  title: string;
  prompt: string;
  agentInstructions?: string;
  starterMarkdown?: string;
  studentId: string;
  studentName: string;
}): Promise<StudentAssignment> {
  const assignment: StudentAssignment = {
    id: input.id,
    courseLabel: "Self-initiated",
    teacherName: input.studentName || "You",
    teacherId: input.studentId,
    dueLabel: "Self-paced",
    title: input.title,
    prompt: input.prompt,
    agentInstructions:
      input.agentInstructions ||
      "Act as an AI co-creator and Socratic coach. Help the student develop their own work through questions, challenges and reflection — prepare them to explain and defend their decisions in an oral defence. Do not ghostwrite the answer.",
    starterMarkdown: input.starterMarkdown,
    completionPercent: 0,
    status: "not_started",
    tier: "free",
    lifecycleStatus: "open",
  };

  const all = await readJson<StudentAssignment>(assignmentsFilePath());
  await writeJson(assignmentsFilePath(), [
    ...all.filter((a) => a.id !== assignment.id),
    assignment,
  ]);

  const registry = await readJson<RegistryEntry>(registryFilePath());
  const withoutExisting = registry.filter(
    (e) => e.assignmentId !== assignment.id
  );
  await writeJson(registryFilePath(), [
    ...withoutExisting,
    {
      assignmentId: assignment.id,
      assignedStudentIds: [input.studentId],
      assignedAt: new Date().toISOString(),
    },
  ]);

  return assignment;
}
