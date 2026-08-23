/**
 * Seed assignment definitions loaded from disk at runtime.
 * These are the default assignments that ship with each environment.
 *
 * Dev has a seed file with sample assignments.
 * Prod can have its own seed file or none for a clean start.
 *
 * Server-only — this module uses fs.
 */

import { readFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { StudentAssignment } from "./types";

const DATA_DIR = join(process.cwd(), "data", "teaching");
const FILE_PATH = join(DATA_DIR, "seed-assignments.json");

function resolveFilePath(): string {
  return process.env.TEACHING_SEEDS_PATH?.trim() || FILE_PATH;
}

/**
 * Load seed assignments from disk.
 * Returns empty array if file doesn't exist or can't be read.
 */
export async function loadSeedAssignments(): Promise<StudentAssignment[]> {
  try {
    const filePath = resolveFilePath();
    await mkdir(dirname(filePath), { recursive: true });
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StudentAssignment[];
  } catch {
    return [];
  }
}

/**
 * Look up a single seed assignment by ID.
 */
export async function getSeedAssignmentById(
  id: string
): Promise<StudentAssignment | undefined> {
  const seeds = await loadSeedAssignments();
  return seeds.find((a) => a.id === id);
}

/**
 * Check whether an assignment ID belongs to a seed assignment.
 */
export async function isSeedAssignment(id: string): Promise<boolean> {
  const seeds = await loadSeedAssignments();
  return seeds.some((a) => a.id === id);
}

export { DATA_DIR, FILE_PATH };
