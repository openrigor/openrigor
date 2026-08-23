import { Session, User } from "@supabase/supabase-js";
import { createClient } from "./server";
import { cookies } from "next/headers";

export async function verifyUserAuthenticated(): Promise<
  { user: User; session: Session } | undefined
> {
  // E2E test mode: return mock user/session only when explicitly enabled.
  // Deployed envs leave E2E_TEST_MODE unset so the cookie alone cannot bypass auth.
  const cookieStore = await cookies();
  const e2eCookie = cookieStore.get("__e2e_test__");
  if (process.env.E2E_TEST_MODE === "true" && e2eCookie?.value === "true") {
    return {
      user: {
        id: "e2e-test-user-id",
        aud: "authenticated",
        role: "authenticated",
        email: "e2e-test@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      } as User,
      session: {
        access_token: "e2e-test-token",
        refresh_token: "e2e-test-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: "e2e-test-user-id",
          aud: "authenticated",
          role: "authenticated",
          email: "e2e-test@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        } as User,
      } as Session,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session) {
    return undefined;
  }
  return { user, session };
}
