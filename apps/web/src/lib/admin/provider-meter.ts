import { createAdminClient } from "@/lib/teaching/admin-client";
import { appendProviderUsageEvent } from "@/lib/workspace/usage-store";

export type ProviderTokenUsage = {
  tokensIn?: number;
  tokensOut?: number;
};

export function isProviderRunRequest(method: string, path: string): boolean {
  return method === "POST" && /^threads\/[^/]+\/runs(?:\/stream)?$/.test(path);
}

async function hasEnabledByokOverride(
  userId: string
): Promise<boolean | undefined> {
  try {
    const { data, error } = await createAdminClient()
      .from("user_byok_settings")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error(
        "Failed to check BYOK settings before usage metering",
        error
      );
      return undefined;
    }
    if (data?.enabled === true) return true;
    if (data?.enabled === false) return false;
    return undefined;
  } catch (error) {
    console.error("Failed to check BYOK settings before usage metering", error);
    return undefined;
  }
}

/** Record one successful platform-provider run; BYOK traffic is excluded. */
export async function recordPlatformProviderRun(
  userId: string,
  method: string,
  path: string,
  status: number,
  tokens?: ProviderTokenUsage
): Promise<void> {
  if (status >= 400 || !isProviderRunRequest(method, path)) return;
  if ((await hasEnabledByokOverride(userId)) !== false) return;

  try {
    if (tokens) {
      await appendProviderUsageEvent(userId, tokens);
    } else {
      await appendProviderUsageEvent(userId);
    }
  } catch (error) {
    // Metering must not turn a successful agent run into a failed user request.
    console.error("Failed to append provider usage event", error);
  }
}
