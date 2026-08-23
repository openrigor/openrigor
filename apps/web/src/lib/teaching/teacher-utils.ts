import { Thread } from "@langchain/langgraph-sdk";
import { User } from "@supabase/supabase-js";
import { TeachingThreadMetadata } from "./types";

/** UserContext may yield undefined while loading; treat like null. */
type MaybeUser = User | null | undefined;

/** Platform owner — invites org admins. Lives in app_metadata (not user-editable). */
export function isOwner(user: MaybeUser): boolean {
  if (!user) return false;
  return user.app_metadata?.role === "owner";
}

/** Organisation admin — manages the organisation workspace. */
export function isOrgAdmin(user: MaybeUser): boolean {
  if (!user) return false;
  return user.app_metadata?.role === "admin";
}

/**
 * @deprecated Use {@link isOwner}. Old platform-admin claim is now owner.
 */
export function isAdmin(user: MaybeUser): boolean {
  return isOwner(user);
}

/**
 * Kept as a compatibility shim for older callers. The public beta has no
 * billing or credit top-ups, so this is intentionally always false.
 */
export function canTopUpCredits(user: MaybeUser): boolean {
  // Legacy callers may still use this capability predicate; the beta renders
  // no credit controls and exposes no billing endpoint.
  return isOrgAdmin(user);
}

/** Org admins may invite delegated teachers. */
export function canInviteTeachers(user: MaybeUser): boolean {
  return isOrgAdmin(user);
}

/**
 * Research contribution is public and GitHub-first; there is no in-app
 * researcher persona in the public beta. Keep this shim false for old code.
 */
export function isResearcher(user: MaybeUser): boolean {
  void user;
  return false;
}

/** Student — access the student assignment dashboard. */
export function canAccessStudentDashboard(user: MaybeUser): boolean {
  if (!user) return false;
  return user.app_metadata?.role === "student";
}

/** Owners may invite org admins. */
export function canInviteAdmins(user: MaybeUser): boolean {
  return isOwner(user);
}

/**
 * True for org admins and teachers; false for owners.
 * There are no hidden test identities or email fallbacks in the public beta.
 */
export function isTeacher(user: MaybeUser): boolean {
  if (!user) return false;

  // Owners are not teachers — they only invite org admins.
  if (isOwner(user)) return false;

  // Org admins teach (and manage their org) from the teacher UI.
  if (isOrgAdmin(user)) return true;

  if (user.app_metadata?.role === "teacher") return true;

  return false;
}

export function getSubmissionStats(threads: Thread[]) {
  // Exclude abandoned threads — they're deleted on abandon going forward
  const activeThreads = threads.filter((thread) => {
    const metadata = thread.metadata as unknown as TeachingThreadMetadata;
    return !metadata.abandoned;
  });

  const total = activeThreads.length;
  const submitted = activeThreads.filter((thread) => {
    const metadata = thread.metadata as unknown as TeachingThreadMetadata;
    return (metadata.completionPercent ?? 0) >= 100;
  }).length;
  const inProgress = activeThreads.filter((thread) => {
    const metadata = thread.metadata as unknown as TeachingThreadMetadata;
    const completion = metadata.completionPercent ?? 0;
    return completion > 0 && completion < 100;
  }).length;
  const notStarted = total - submitted - inProgress;

  return {
    total,
    submitted,
    inProgress,
    notStarted,
  };
}

export function getStudentEmailFromThread(thread: Thread): string {
  const metadata = thread.metadata as unknown as TeachingThreadMetadata;
  // For now, we'll need to look this up from Supabase using the supabase_user_id
  // This is a placeholder - the actual email will need to be fetched from the API
  return metadata.supabase_user_id || "unknown@student.com";
}
