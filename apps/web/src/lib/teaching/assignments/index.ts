/**
 * Assignment definitions — seeds and lookups.
 *
 * Seed assignments load from data/teaching/seed-assignments.json at runtime,
 * not from hardcoded source. This lets dev and prod have different seeds
 * (or none) without code changes.
 *
 * For server-side code, use the API endpoint /api/teaching/seeds or load
 * directly with loadSeedAssignments() from seed-loader (server-only module).
 *
 * For client-side code, seed data is served through the API.
 */

import type { StudentAssignment } from "../types";

/**
 * Look up a seed assignment by ID via the API.
 */
export async function getAssignmentById(
  id: string
): Promise<StudentAssignment | undefined> {
  try {
    const res = await fetch("/api/teaching/seeds");
    const data = await res.json();
    const seeds = (data.seeds ?? []) as StudentAssignment[];
    return seeds.find((a) => a.id === id);
  } catch {
    return undefined;
  }
}

/**
 * Load all seed assignments via the API.
 */
export async function getSeedAssignments(): Promise<StudentAssignment[]> {
  try {
    const res = await fetch("/api/teaching/seeds");
    const data = await res.json();
    return (data.seeds ?? []) as StudentAssignment[];
  } catch {
    return [];
  }
}
