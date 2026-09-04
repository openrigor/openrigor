"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { UserProvider } from "@/contexts/UserContext";
import { MethodReviewView } from "@/components/workspace/method-review-view";

export default function MethodReviewPage() {
  const t = useTranslations("workspace");
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <UserProvider>
        <MethodReviewView />
      </UserProvider>
    </Suspense>
  );
}
