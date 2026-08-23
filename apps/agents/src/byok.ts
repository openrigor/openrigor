import { BaseStore, LangGraphRunnableConfig } from "@langchain/langgraph";
import { createClient, Session } from "@supabase/supabase-js";
import { decryptApiKey } from "@opencanvas/shared/byok/crypto";
import {
  assertPublicHost,
  assertPublicHttpsUrl,
} from "@opencanvas/shared/byok/url";
import { shareCoversItem } from "@opencanvas/shared/byok/shares";
import type {
  ByokDecryptedSettings,
  UserByokSettingsRow,
} from "@opencanvas/shared/byok/types";

let warnedMissingByokConfig = false;

const WORKSPACE_MANIFEST_KEY = "manifest";

function warnMissingByokConfigOnce(reason: string) {
  if (warnedMissingByokConfig) return;
  warnedMissingByokConfig = true;
  console.warn(`[byok] ${reason}; falling back to platform providers`);
}

function isSupabaseServiceRoleConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE?.trim();
  return Boolean(
    key && key !== "your-service-role-key" && !key.startsWith("your-")
  );
}

/**
 * Load the signed-in user's BYOK settings when configured and enabled.
 * Returns null when BYOK is unavailable, disabled, or not set — callers
 * should keep using the existing platform provider path.
 *
 * Throws when BYOK is enabled but the stored key cannot be decrypted or
 * the saved base URL is not a public HTTPS destination (fail closed).
 */
export async function getByokModelSettings(
  config: LangGraphRunnableConfig
): Promise<ByokDecryptedSettings | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !isSupabaseServiceRoleConfigured()
  ) {
    warnMissingByokConfigOnce(
      "Supabase URL or service role not configured for BYOK"
    );
    return null;
  }

  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    warnMissingByokConfigOnce("BYOK_ENCRYPTION_KEY not configured");
    return null;
  }

  const accessToken = (
    config.configurable?.supabase_session as Session | undefined
  )?.access_token;
  if (!accessToken) {
    return null;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const authRes = await supabase.auth.getUser(accessToken);
  const user = authRes.data.user;
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as UserByokSettingsRow;
  if (!row.enabled) {
    return null;
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(row.api_key_enc, encryptionKey);
  } catch {
    throw new Error(
      "BYOK is enabled, but the stored API key cannot be decrypted"
    );
  }

  const baseUrl = assertPublicHttpsUrl(row.base_url);
  await assertPublicHost(new URL(baseUrl).hostname);

  return {
    baseUrl,
    model: row.model,
    apiKey,
  };
}

type WorkspaceManifest = {
  items?: Record<string, unknown>;
};

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function readWorkspaceItem(
  store: BaseStore,
  userId: string,
  itemId: string
): Promise<Record<string, unknown> | undefined> {
  const stored = await store.get(
    ["workspace_items", userId],
    WORKSPACE_MANIFEST_KEY
  );
  const manifest = recordValue(stored?.value) as WorkspaceManifest | undefined;
  return recordValue(manifest?.items?.[itemId]);
}

/**
 * Resolve an owner's BYOK settings for a live method participant grant.
 * This intentionally reads both manifests and the encrypted settings row on
 * every request so a revoked grant cannot remain usable in a running thread.
 */
export async function getSharedByokModelSettings(
  config: LangGraphRunnableConfig
): Promise<ByokDecryptedSettings | null> {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !isSupabaseServiceRoleConfigured() ||
      !process.env.BYOK_ENCRYPTION_KEY?.trim() ||
      !config.store
    ) {
      return null;
    }

    const configuredItemId =
      config.configurable?.workspace_item_id ??
      config.configurable?.itemId ??
      config.metadata?.workspace_item_id;
    const threadId = config.configurable?.thread_id;
    const session = config.configurable?.supabase_session as
      | Session
      | undefined;
    if (
      (typeof configuredItemId !== "string" || !configuredItemId) &&
      (typeof threadId !== "string" || !threadId)
    ) {
      return null;
    }
    if (!session?.access_token) {
      return null;
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE!
    );
    const authRes = await supabase.auth.getUser(session.access_token);
    const participantUser = authRes.data.user;
    if (!participantUser) return null;

    let itemId =
      typeof configuredItemId === "string" ? configuredItemId : undefined;
    let participantItem = itemId
      ? await readWorkspaceItem(config.store, participantUser.id, itemId)
      : undefined;
    if (!participantItem && threadId) {
      const stored = await config.store.get(
        ["workspace_items", participantUser.id],
        WORKSPACE_MANIFEST_KEY
      );
      const manifest = recordValue(stored?.value) as
        | WorkspaceManifest
        | undefined;
      const match = Object.entries(manifest?.items ?? {}).find(([, value]) => {
        const candidate = recordValue(value);
        return (
          candidate?.kind === "method_participant" &&
          candidate.threadId === threadId
        );
      });
      if (match) {
        itemId = match[0];
        participantItem = recordValue(match[1]);
      }
    }
    if (
      !itemId ||
      participantItem?.kind !== "method_participant" ||
      participantItem.ownerId !== participantUser.id
    ) {
      return null;
    }

    const ownerId = participantItem.operatorId;
    const ownerItemId = participantItem.operatorItemId;
    if (
      typeof ownerId !== "string" ||
      typeof ownerItemId !== "string" ||
      ownerId === participantUser.id
    ) {
      return null;
    }
    const ownerItem = await readWorkspaceItem(
      config.store,
      ownerId,
      ownerItemId
    );
    if (ownerItem?.kind !== "method" || ownerItem.ownerId !== ownerId) {
      return null;
    }

    const run = recordValue(ownerItem.run);
    const participants = Array.isArray(run?.participants)
      ? run.participants
      : [];
    const participant = participants.find((candidate) => {
      const row = recordValue(candidate);
      if (!row || row.itemId !== itemId) return false;
      return (
        row.userId === participantUser.id ||
        (typeof row.email === "string" &&
          typeof participantUser.email === "string" &&
          row.email.trim().toLowerCase() ===
            participantUser.email.trim().toLowerCase())
      );
    });
    if (!participant) return null;

    const { data } = await supabase
      .from("user_byok_settings")
      .select("*")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!data) return null;

    const row = data as UserByokSettingsRow;
    if (!shareCoversItem(row, ownerItemId)) return null;

    const apiKey = decryptApiKey(
      row.api_key_enc,
      process.env.BYOK_ENCRYPTION_KEY!.trim()
    );
    const baseUrl = assertPublicHttpsUrl(row.base_url);
    await assertPublicHost(new URL(baseUrl).hostname);
    return { baseUrl, model: row.model, apiKey };
  } catch (error) {
    // A shared grant is optional. Any missing, revoked, deleted, or invalid
    // owner configuration follows the normal platform-provider path.
    console.warn(
      "[byok] shared grant resolution failed; using platform provider",
      error
    );
    return null;
  }
}
