"use client";

import { LandingPage } from "@/components/landing/landing-page";
import { UserProvider } from "@/contexts/UserContext";
import { useUserContext } from "@/contexts/UserContext";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { useEffect } from "react";

function HomeContent() {
  const { user, loading } = useUserContext();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace("/workspace");
  }, [loading, user, router]);
  if (!loading && user) return null;
  return <LandingPage />;
}

export default function Home() {
  return (
    <Suspense>
      <UserProvider>
        <HomeContent />
      </UserProvider>
    </Suspense>
  );
}
