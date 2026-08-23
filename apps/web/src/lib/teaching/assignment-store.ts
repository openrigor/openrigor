import type {
  AssignmentTier,
  CreateAssignmentInput,
  StudentAssignment,
} from "./types";
import { getSeedAssignments } from "./assignments";

const API_URL = "/api/teaching/assignments";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Fetch the current teacher's custom assignments from the server.
 * Throws on network/server errors so callers can retry.
 */
export async function getCustomAssignments(): Promise<StudentAssignment[]> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Assignments fetch failed (${res.status})`);
  }
  const data = await res.json();
  return (data.assignments || []) as StudentAssignment[];
}

/**
 * Save the current teacher's custom assignments (server merges with others).
 */
async function saveCustomAssignments(
  assignments: StudentAssignment[]
): Promise<void> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Assignments save failed (${res.status})`);
  }
}

/**
 * Create and persist a new custom assignment owned by the teacher.
 */
export async function saveCustomAssignment(
  input: CreateAssignmentInput,
  teacherName: string,
  teacherId: string
): Promise<StudentAssignment> {
  const id = `${slugify(input.title)}-${Date.now().toString(36)}`;

  const tier: AssignmentTier = input.tier === "premium" ? "premium" : "free";
  const newAssignment: StudentAssignment = {
    id,
    title: input.title,
    courseLabel: input.courseLabel,
    dueLabel: input.dueLabel,
    prompt: input.prompt,
    agentInstructions: input.agentInstructions,
    wordTarget: input.wordTarget,
    starterMarkdown: input.starterMarkdown,
    teacherName,
    teacherId,
    completionPercent: 0,
    status: "not_started",
    tier,
    lifecycleStatus: "open",
    apparatusId: input.apparatusId,
    apparatusProfileId: input.apparatusProfileId,
  };

  const existing = await getCustomAssignments();
  await saveCustomAssignments([...existing, newAssignment]);
  return newAssignment;
}

/**
 * Delete a custom assignment by ID via the DELETE API endpoint.
 * Also cleans up any registry entries for the assignment.
 */
export async function deleteCustomAssignment(id: string): Promise<boolean> {
  // Delete the assignment
  const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Delete failed (${res.status})`);
  }
  const body = await res.json();

  // Best-effort cleanup of registry entries
  try {
    await fetch(
      `/api/teaching/registry?assignmentId=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      }
    );
  } catch {
    // registry cleanup is best-effort
  }

  return body.deleted;
}

/**
 * Update an existing custom assignment (for editing drafts).
 */
export async function updateCustomAssignment(
  id: string,
  input: CreateAssignmentInput
): Promise<StudentAssignment | undefined> {
  const existing = await getCustomAssignments();
  const idx = existing.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;

  const updated: StudentAssignment = {
    ...existing[idx],
    title: input.title,
    courseLabel: input.courseLabel,
    dueLabel: input.dueLabel,
    prompt: input.prompt,
    agentInstructions: input.agentInstructions,
    wordTarget: input.wordTarget,
    starterMarkdown: input.starterMarkdown,
    // tier is immutable after create (v1)
  };

  existing[idx] = updated;
  await saveCustomAssignments(existing);
  return updated;
}

/**
 * Close an open assignment (frees a free-tier active slot).
 */
export async function closeCustomAssignment(
  id: string
): Promise<StudentAssignment> {
  const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lifecycleStatus: "closed" }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Close failed (${res.status})`);
  }
  const data = (await res.json()) as { assignment: StudentAssignment };
  return data.assignment;
}

/**
 * Assignments for the teacher "Your assignments" list: this teacher's customs only.
 * Shared seed templates are NOT included — load those via getSeedAssignments().
 */
export async function getAllAssignments(): Promise<StudentAssignment[]> {
  return getCustomAssignments();
}

/**
 * Look up an assignment by ID, checking seeds then a single custom fetch.
 * Returns undefined if not found or if fetch fails.
 */
export async function getAssignmentByIdIncludingCustom(
  id: string
): Promise<StudentAssignment | undefined> {
  const seeds = await getSeedAssignments();
  const seeded = seeds.find((a) => a.id === id);
  if (seeded) return seeded;
  try {
    const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`Assignment fetch failed (${res.status})`);
    }
    const data = await res.json();
    return (data.assignment ?? undefined) as StudentAssignment | undefined;
  } catch {
    return undefined;
  }
}

export interface SelfInitiateInput {
  title: string;
  prompt: string;
  agentInstructions?: string;
  starterMarkdown?: string;
}

/**
 * Create a student-initiated assignment-style thread. Reused by the
 * "Start your own assignment" interface on the student dashboard.
 */
export async function createSelfInitiatedAssignment(
  input: SelfInitiateInput
): Promise<StudentAssignment | undefined> {
  const res = await fetch("/api/teaching/self-initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Self-initiate failed (${res.status})`);
  }
  const data = (await res.json()) as {
    assignment?: StudentAssignment;
  };
  return data.assignment;
}
