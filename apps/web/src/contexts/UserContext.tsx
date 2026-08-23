import { createSupabaseClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

/** Matches the mock user returned by verify_user_server.ts in E2E test mode. */
function e2eMockUser(): User {
  return {
    id: "e2e-test-user-id",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-test@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  } as User;
}

function isE2ETestMode(): boolean {
  if (typeof window === "undefined") return false;
  // Build-time flag — unset in deployments so a forged cookie is inert.
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE !== "true") return false;
  return document.cookie.includes("__e2e_test__=true");
}

type UserContentType = {
  getUser: () => Promise<User | undefined>;
  user: User | undefined;
  loading: boolean;
};

const UserContext = createContext<UserContentType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user || typeof window === "undefined") return;

    // E2E test mode: return mock user without hitting Supabase
    if (isE2ETestMode()) {
      setUser(e2eMockUser());
      setLoading(false);
      return;
    }

    getUser();
  }, []);

  async function getUser() {
    if (user) {
      setLoading(false);
      return user;
    }

    const supabase = createSupabaseClient();

    try {
      const result = await supabase.auth.getUser();
      const supabaseUser = result.data?.user;
      setUser(supabaseUser || undefined);
      setLoading(false);
      return supabaseUser || undefined;
    } catch (e) {
      console.error("[UserContext] getUser failed:", e);
      setLoading(false);
      return undefined;
    }
  }

  const contextValue: UserContentType = {
    getUser,
    user,
    loading,
  };

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUserContext must be used within a UserProvider");
  }
  return context;
}
