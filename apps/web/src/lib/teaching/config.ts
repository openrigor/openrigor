import { isApparatusEnabled } from "@/lib/apparatuses/enablement";

/**
 * Teaching prototype mode == the essays apparatus is enabled.
 * The legacy flag (NEXT_PUBLIC_TEACHING_PROTOTYPE=true) maps to essays enablement
 * (apparatus semantics, 2A-3); self-host can also set NEXT_PUBLIC_APPARATUSES.
 */
export function isTeachingPrototype(): boolean {
  return isApparatusEnabled("ai-assisted-essay");
}

/**
 * Determine post-login path based on user role.
 * Owner → /owner; org admin and teacher → /teacher; student → /student.
 * A direct registration (including OAuth) is always completed as an org admin.
 */
export function postLoginPath(
  _user?: {
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } | null
): string {
  return "/workspace";
}
