import { createServerClient } from "@supabase/ssr";
import { getSupabaseUrl } from "@/lib/supabase/env";

export function getSiteUrl(): string {
  // Do not fall back to NEXT_PUBLIC_API_URL — that is the LangGraph proxy
  // path ("/api"), not a site origin. A bad absolute API URL (e.g. Tailscale
  // Mission Control) would also poison invite redirect links.
  if (process.env.ENV_MODE === "prod") {
    const prod =
      process.env.SITE_URL ||
      process.env.DEV_PUBLIC_URL ||
      "https://evaluchat.org";
    return prod.replace(/\/$/, "");
  }

  const raw =
    process.env.SITE_URL ||
    process.env.DEV_PUBLIC_URL ||
    "https://dev.evaluchat.org";
  return raw.replace(/\/$/, "");
}

export function createAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // No-op for admin client
      },
    },
  });
}
