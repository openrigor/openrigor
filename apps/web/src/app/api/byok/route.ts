import { NextRequest, NextResponse } from "next/server";
import {
  encryptApiKey,
  maskApiKey,
  decryptApiKey,
} from "@opencanvas/shared/byok/crypto";
import {
  assertPublicHost,
  assertPublicHttpsUrl,
} from "@opencanvas/shared/byok/url";
import type {
  ByokShareMode,
  UserByokSettingsRow,
} from "@opencanvas/shared/byok/types";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceItem } from "@/lib/workspace/store";

function getEncryptionKey(): string | null {
  const key = process.env.BYOK_ENCRYPTION_KEY?.trim();
  return key || null;
}

function maskedSettingsResponse(row: UserByokSettingsRow) {
  let masked = "••••••••";
  const encryptionKey = getEncryptionKey();
  if (encryptionKey) {
    try {
      masked = maskApiKey(decryptApiKey(row.api_key_enc, encryptionKey));
    } catch {
      masked = "••••••••";
    }
  }
  return {
    enabled: row.enabled,
    base_url: row.base_url,
    model: row.model,
    api_key_masked: masked,
    share_mode: row.share_mode ?? "none",
    shared_item_ids: row.shared_item_ids ?? [],
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load BYOK settings" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({
    settings: maskedSettingsResponse(data as UserByokSettingsRow),
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "BYOK_ENCRYPTION_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  let body: {
    enabled?: boolean;
    base_url?: string;
    model?: string;
    api_key?: string;
    share_mode?: ByokShareMode;
    shared_item_ids?: string[];
    shareItemIdsReplace?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingRow = (existing as UserByokSettingsRow | null) ?? null;

  const shareModeRaw = body.share_mode ?? existingRow?.share_mode ?? "none";
  const shareModes: ByokShareMode[] = [
    "none",
    "all_assignments",
    "specific_items",
  ];
  if (!shareModes.includes(shareModeRaw)) {
    return NextResponse.json(
      { error: "share_mode must be none, all_assignments, or specific_items" },
      { status: 400 }
    );
  }

  const hasShareItemIdsReplace = Object.prototype.hasOwnProperty.call(
    body,
    "shareItemIdsReplace"
  );
  const sharedItemIdsRaw = hasShareItemIdsReplace
    ? body.shareItemIdsReplace
    : (body.shared_item_ids ?? existingRow?.shared_item_ids ?? []);
  if (
    !Array.isArray(sharedItemIdsRaw) ||
    !sharedItemIdsRaw.every(
      (itemId): itemId is string =>
        typeof itemId === "string" && itemId.trim().length > 0
    )
  ) {
    return NextResponse.json(
      {
        error: hasShareItemIdsReplace
          ? "shareItemIdsReplace must be an array of item ids"
          : "shared_item_ids must be an array of item ids",
      },
      { status: 400 }
    );
  }

  const sharedItemIds = [
    ...new Set(sharedItemIdsRaw.map((itemId) => itemId.trim())),
  ];
  if (shareModeRaw === "specific_items" && sharedItemIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "shared_item_ids must contain at least one owned method item for specific_items",
      },
      { status: 400 }
    );
  }

  if (
    shareModeRaw === "specific_items" ||
    (hasShareItemIdsReplace && sharedItemIds.length > 0)
  ) {
    try {
      const ownedItems = await Promise.all(
        sharedItemIds.map((itemId) => getWorkspaceItem(user.id, itemId))
      );
      if (
        ownedItems.some(
          (item) => !item || item.kind !== "method" || item.ownerId !== user.id
        )
      ) {
        return NextResponse.json(
          { error: "shared_item_ids must contain only owned method items" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not validate shared method items" },
        { status: 400 }
      );
    }
  }

  const baseUrlRaw =
    typeof body.base_url === "string"
      ? body.base_url
      : (existingRow?.base_url ?? "");

  let baseUrl: string;
  try {
    baseUrl = assertPublicHttpsUrl(baseUrlRaw);
    await assertPublicHost(new URL(baseUrl).hostname);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "base_url must be a valid public HTTPS URL",
      },
      { status: 400 }
    );
  }

  const modelRaw =
    typeof body.model === "string" ? body.model : (existingRow?.model ?? "");
  const model = modelRaw.trim();
  if (!model) {
    return NextResponse.json(
      { error: "model must be a non-empty string" },
      { status: 400 }
    );
  }

  const enabled =
    typeof body.enabled === "boolean"
      ? body.enabled
      : (existingRow?.enabled ?? true);

  let apiKeyEnc = existingRow?.api_key_enc;
  const incomingKey =
    typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (incomingKey) {
    try {
      apiKeyEnc = encryptApiKey(incomingKey, encryptionKey);
    } catch (err) {
      console.error("Failed to encrypt BYOK API key", err);
      return NextResponse.json(
        { error: "Failed to encrypt API key" },
        { status: 500 }
      );
    }
  }

  if (!apiKeyEnc) {
    return NextResponse.json(
      { error: "api_key is required when saving for the first time" },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    base_url: baseUrl,
    model,
    api_key_enc: apiKeyEnc,
    enabled,
    share_mode: shareModeRaw,
    shared_item_ids: shareModeRaw === "specific_items" ? sharedItemIds : [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_byok_settings")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to save BYOK settings" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    settings: maskedSettingsResponse(data as UserByokSettingsRow),
  });
}
