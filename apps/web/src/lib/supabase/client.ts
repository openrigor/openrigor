import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// createBrowserClient in @supabase/ssr@0.5.x hardcodes detectSessionInUrl:
// isBrowser() after spreading options.auth, so the flag is silently ignored.
// Mirror its cookie-backed client with detectSessionInUrl forced off so the
// browser cannot race /auth/confirm's server PKCE exchange.
import { createStorageFromOptions } from "@supabase/ssr/dist/module/cookies";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

let cachedBrowserClient: SupabaseClient | undefined;

export function createSupabaseClient() {
  const shouldUseSingleton = typeof window !== "undefined";
  if (shouldUseSingleton && cachedBrowserClient) {
    return cachedBrowserClient;
  }

  const { storage } = createStorageFromOptions(
    { cookieEncoding: "base64url" },
    false
  );

  const client = createClient(getSupabaseUrl(), getSupabasePublicKey(), {
    auth: {
      flowType: "pkce",
      autoRefreshToken: shouldUseSingleton,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
    },
  });

  if (shouldUseSingleton) {
    cachedBrowserClient = client;
  }
  return client;
}
