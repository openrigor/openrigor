const API_URL = "/api/teaching/registry";

export interface AssignmentEntry {
  assignmentId: string;
  assignedStudentIds: string[];
  assignedAt: string;
}

/**
 * Fetch assignment registry from the server.
 * Throws on network/server errors so callers can retry.
 */
export async function getAssignmentRegistry(): Promise<AssignmentEntry[]> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Registry fetch failed (${res.status})`);
  }
  const data = await res.json();
  return (data.registry || []) as AssignmentEntry[];
}

/**
 * Save the full registry to the server.
 */
async function saveAssignmentRegistry(
  registry: AssignmentEntry[]
): Promise<void> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registry }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Registry save failed (${res.status})`);
  }
}

/**
 * Register a new assignment with its assigned students.
 */
export async function registerAssignment(
  entry: AssignmentEntry
): Promise<void> {
  const existing = await getAssignmentRegistry();
  const filtered = existing.filter(
    (e) => e.assignmentId !== entry.assignmentId
  );
  await saveAssignmentRegistry([...filtered, entry]);
}

/**
 * Check if an assignment has been explicitly assigned to at least one student.
 * Seed catalog entries are not special — they must be in the registry too.
 * Returns false on fetch error (safe default — shows as draft).
 */
export async function isAssignmentAssigned(
  assignmentId: string
): Promise<boolean> {
  try {
    const registry = await getAssignmentRegistry();
    return registry.some((entry) => entry.assignmentId === assignmentId);
  } catch {
    return false;
  }
}

/**
 * Get assigned student IDs for a specific assignment.
 * Returns [] on fetch error.
 */
export async function getAssignedStudentIds(
  assignmentId: string
): Promise<string[]> {
  try {
    const registry = await getAssignmentRegistry();
    const entry = registry.find((e) => e.assignmentId === assignmentId);
    return entry?.assignedStudentIds || [];
  } catch {
    return [];
  }
}

/**
 * Remove an assignment from the registry.
 */
export async function removeAssignment(assignmentId: string): Promise<void> {
  const existing = await getAssignmentRegistry();
  await saveAssignmentRegistry(
    existing.filter((e) => e.assignmentId !== assignmentId)
  );
}
