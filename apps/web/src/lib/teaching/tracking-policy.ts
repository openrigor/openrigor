import { resolveMethodTrackingAccess } from "@/lib/workspace/store";

/** Resolve tracking policy from the frozen method-run snapshot. */
export async function isTrackingAllowedForThread(
  threadId: string,
  userId?: string
): Promise<boolean> {
  if (!threadId || threadId === "unknown" || !userId) return false;
  const access = await resolveMethodTrackingAccess(threadId, userId);
  return access.canWrite;
}
