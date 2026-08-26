import { NextRequest, NextResponse } from "next/server";
import {
  assertCurrentSharedModelNoticeVersion,
  normalizeOpenRigorAiMode,
  SHARED_MODEL_NOTICE_VERSION,
} from "@opencanvas/shared/ai-mode";
import type {
  OpenRigorAiMode,
  UserAiConsentRow,
} from "@opencanvas/shared/ai-mode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AiModeResponse = {
  mode: OpenRigorAiMode | null;
  privacy_notice_version: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  authorization_state: OpenRigorAiMode | "missing" | "stale" | "revoked";
  consent: {
    mode: OpenRigorAiMode | null;
    privacy_notice_version: string | null;
    revoked_at: string | null;
    updated_at: string;
  } | null;
};

function authorizationState(
  row: UserAiConsentRow | null
): AiModeResponse["authorization_state"] {
  if (!row || !row.mode) return "missing";
  if (row.revoked_at) return "revoked";
  if (
    row.mode === "shared_model" &&
    row.privacy_notice_version !== SHARED_MODEL_NOTICE_VERSION
  ) {
    return "stale";
  }
  return row.mode;
}

function toAiModeResponse(row: UserAiConsentRow | null): AiModeResponse {
  return {
    mode: row?.mode ?? null,
    privacy_notice_version: row?.privacy_notice_version ?? null,
    revoked_at: row?.revoked_at ?? null,
    updated_at: row?.updated_at ?? null,
    authorization_state: authorizationState(row),
    consent: row
      ? {
          mode: row.mode,
          privacy_notice_version: row.privacy_notice_version,
          revoked_at: row.revoked_at,
          updated_at: row.updated_at,
        }
      : null,
  };
}

async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

async function readConsent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ row: UserAiConsentRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("user_ai_consent")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { row: (data as UserAiConsentRow | null) ?? null, error };
}

export async function GET() {
  const auth = await getAuthenticatedSupabase();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { row, error } = await readConsent(auth.supabase, auth.user.id);
  if (error) {
    return NextResponse.json(
      { error: "Could not verify AI mode authorization" },
      { status: 500 }
    );
  }
  return NextResponse.json(toAiModeResponse(row));
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    mode?: unknown;
    privacy_notice_version?: unknown;
    privacyNoticeVersion?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = normalizeOpenRigorAiMode(body?.mode);
  if (!mode) {
    return NextResponse.json(
      { error: "AI mode is missing or unsupported" },
      { status: 400 }
    );
  }

  let privacyNoticeVersion: string | null = null;
  if (mode === "shared_model") {
    const suppliedVersion =
      body.privacy_notice_version ?? body.privacyNoticeVersion;
    if (typeof suppliedVersion !== "string" || !suppliedVersion) {
      return NextResponse.json(
        {
          error:
            "Shared-model consent is missing: privacy_notice_version is required",
        },
        { status: 400 }
      );
    }
    try {
      assertCurrentSharedModelNoticeVersion(suppliedVersion);
      privacyNoticeVersion = suppliedVersion;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Shared-model consent is stale",
        },
        { status: 400 }
      );
    }
  }

  const row = {
    user_id: auth.user.id,
    mode,
    privacy_notice_version: privacyNoticeVersion,
    revoked_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await auth.supabase
    .from("user_ai_consent")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Could not save AI mode authorization" },
      { status: 500 }
    );
  }

  return NextResponse.json(toAiModeResponse(data as UserAiConsentRow));
}

async function revoke() {
  const auth = await getAuthenticatedSupabase();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = await readConsent(auth.supabase, auth.user.id);
  if (current.error) {
    return NextResponse.json(
      { error: "Could not verify AI mode authorization" },
      { status: 500 }
    );
  }
  if (!current.row) {
    return NextResponse.json(
      { error: "AI mode authorization is missing and cannot be revoked" },
      { status: 404 }
    );
  }

  const revokedAt = current.row.revoked_at ?? new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("user_ai_consent")
    .update({ revoked_at: revokedAt, updated_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Could not revoke AI mode authorization" },
      { status: 500 }
    );
  }
  return NextResponse.json(toAiModeResponse(data as UserAiConsentRow));
}

export const DELETE = revoke;
// Keep revoke callable by clients that use action-style POSTs.
export const POST = revoke;
