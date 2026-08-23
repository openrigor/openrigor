"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function Page() {
  const [errorOccurred, setErrorOccurred] = useState(false);

  useEffect(() => {
    async function signOut() {
      const client = createSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) {
        setErrorOccurred(true);
        return;
      }
      // Hard navigation so middleware sees cleared cookies and does not leave
      // the previous role shell mounted.
      window.location.assign("/auth/login");
    }
    signOut();
  }, []);

  return (
    <>
      {errorOccurred ? (
        <div>
          <h1>Sign out error</h1>
          <p>
            There was an error signing out. Please refresh the page to try
            again.
          </p>
        </div>
      ) : (
        <p>Signing out...</p>
      )}
    </>
  );
}
