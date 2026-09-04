"use client";

import { Login } from "@/components/auth/login/Login";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("auth");
  return (
    <main className="h-screen">
      <Suspense fallback={<div>{t("loading")}</div>}>
        <Login />
      </Suspense>
    </main>
  );
}
