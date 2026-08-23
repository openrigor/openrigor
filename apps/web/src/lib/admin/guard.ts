import type { User } from "@supabase/supabase-js";

type MaybeUser = User | null | undefined;

/**
 * Read the configured admin identities for every request. Do not hoist this
 * into module scope: operators may change ADMIN_EMAILS without a restart.
 */
function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminDashboardEnabled(): boolean {
  return configuredAdminEmails().size > 0;
}

/** Configuration-based admin guard; app_metadata roles are intentionally ignored. */
export function isPlatformAdmin(user: MaybeUser): boolean {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && configuredAdminEmails().has(email));
}
