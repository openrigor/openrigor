"use client";

import { Suspense } from "react";
import { UserProvider } from "@/contexts/UserContext";
import { MethodReviewView } from "@/components/workspace/method-review-view";

export default function MethodReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <MethodReviewView />
      </UserProvider>
    </Suspense>
  );
}
