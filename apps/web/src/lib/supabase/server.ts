import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

export async function createClient() {
  const cookieStore = await cookies();

  // Create a storage-backed client for middleware/cookie sync
  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );

  return supabase;
}

/**
 * Lightweight Supabase client for auth operations in server actions
 * where the SSR PKCE flow causes issues with password sign-in.
 */
export function createActionClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabasePublicKey());
}
