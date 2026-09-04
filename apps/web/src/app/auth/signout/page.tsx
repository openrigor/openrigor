"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function Page() {
  const t = useTranslations("auth");
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
          <h1>{t("signOutError")}</h1>
          <p>{t("signOutErrorDescription")}</p>
        </div>
      ) : (
        <p>{t("signingOut")}</p>
      )}
    </>
  );
}
