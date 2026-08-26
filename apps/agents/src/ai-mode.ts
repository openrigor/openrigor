import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createClient, Session } from "@supabase/supabase-js";
import {
  assertCurrentSharedModelNoticeVersion,
  normalizeOpenRigorAiMode,
} from "@opencanvas/shared/ai-mode";
import type {
  OpenRigorAiMode,
  UserAiConsentRow,
} from "@opencanvas/shared/ai-mode";

export type AiModeAuthorization = {
  mode: OpenRigorAiMode;
  privacyNoticeVersion: string | null;
  revokedAt: string | null;
};

function isSupabaseServiceRoleConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE?.trim();
  return Boolean(
    key && key !== "your-service-role-key" && !key.startsWith("your-")
  );
}

function missingAuthorization(reason: string): Error {
  return new Error("OpenRigor AI mode authorization is missing: " + reason);
}

/**
 * Validate a consent row without making any provider decision. This is kept
 * separate so the same fail-closed state semantics can be unit tested without
 * a live Supabase client.
 */
export function assertAiModeAuthorization(
  row: UserAiConsentRow | null | undefined
): AiModeAuthorization {
  if (!row || !row.mode) {
    throw missingAuthorization("choose an AI mode before using inference");
  }

  const mode = normalizeOpenRigorAiMode(row.mode);
  if (!mode) {
    throw missingAuthorization("the stored mode is unsupported");
  }
  if (row.revoked_at) {
    throw new Error(
      "OpenRigor AI mode authorization is revoked; choose and save a mode again"
    );
  }

  if (mode === "shared_model") {
    try {
      assertCurrentSharedModelNoticeVersion(row.privacy_notice_version);
    } catch {
      throw new Error(
        "OpenRigor shared-model consent is stale; re-accept the current privacy notice"
      );
    }
  }

  return {
    mode,
    privacyNoticeVersion: row.privacy_notice_version,
    revokedAt: row.revoked_at,
  };
}

/**
 * Read mode authorization on every model request. Browser-supplied mode
 * values are intentionally ignored; the proxy's authenticated session is the
 * only identity accepted by this lookup.
 */
export async function getAiModeAuthorization(
  config: LangGraphRunnableConfig
): Promise<AiModeAuthorization> {
  const accessToken = (
    config.configurable?.supabase_session as Session | undefined
  )?.access_token;
  if (!accessToken) {
    throw missingAuthorization("no authenticated session is available");
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !isSupabaseServiceRoleConfigured()
  ) {
    throw missingAuthorization("the authorization store is not configured");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE!
  );
  const authRes = await supabase.auth.getUser(accessToken);
  const user = authRes.data.user;
  if (!user) {
    throw missingAuthorization("the authenticated user could not be verified");
  }

  const { data, error } = await supabase
    .from("user_ai_consent")
    .select("user_id, mode, privacy_notice_version, revoked_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new Error("Could not verify OpenRigor AI mode authorization");
  }
  return assertAiModeAuthorization((data as UserAiConsentRow | null) ?? null);
}
