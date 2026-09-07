"use client";

import { Signup } from "@/components/auth/signup/Signup";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("auth");
  return (
    <main className="h-screen">
      <Suspense fallback={<div>{t("loading")}</div>}>
        <Signup />
      </Suspense>
    </main>
  );
}
