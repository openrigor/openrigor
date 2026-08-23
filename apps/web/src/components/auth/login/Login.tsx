"use client";

import NextImage from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { UserAuthForm } from "./user-auth-form-login";
import {
  COPYRIGHT_NOTICE,
  DOCS_URL,
  PRIVACY_PATH,
  SALMON_DARK,
  SALMON_ON_BRAND,
  TERMS_PATH,
} from "./login-branding";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function loginErrorMessage(error: string | null): string | null {
  if (error === "missing")
    return "Enter both email and password, then try again.";
  if (error === "credentials" || error === "true")
    return "Email or password is incorrect. Please try again.";
  return null;
}

function DocsLink({ className }: { className?: string }) {
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Documentation
      <ExternalLink className="size-3.5 opacity-70" aria-hidden />
    </a>
  );
}

export function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorMessage = loginErrorMessage(errorParam);
  const authCode = searchParams.get("code");

  // Belt-and-suspenders with middleware: PKCE confirmation codes belong on
  // /auth/confirm (SITE_URL often points at /auth/login).
  useEffect(() => {
    if (!authCode) return;
    const next = searchParams.get("next");
    const qs = new URLSearchParams({ code: authCode });
    if (next) qs.set("next", next);
    router.replace(`/auth/confirm?${qs.toString()}`);
  }, [authCode, searchParams, router]);

  if (authCode) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Confirming your email…
      </div>
    );
  }

  const onLoginWithOauth = async (
    provider: "google" | "github"
  ): Promise<void> => {
    const client = createSupabaseClient();
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${currentOrigin}/auth/callback` },
    });
  };

  return (
    <div className="container relative h-full flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "#2c3e56" }}
        />
        <div className="relative z-20 flex gap-3 items-center shrink-0">
          <NextImage
            src="/evaluchat.png"
            width={64}
            height={64}
            alt="evaluchat Logo"
          />
          <span className="text-5xl font-semibold tracking-tight">
            evaluchat
          </span>
        </div>
        {/* Brand copy + workspace demo (desktop left panel) */}
        <div className="relative z-20 flex-1 flex flex-col justify-start min-h-0 gap-6 pt-10 pb-4"></div>
        <div className="relative z-20 shrink-0 space-y-3 pt-4 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-white/80">
            <DocsLink
              className={`inline-flex items-center gap-1.5 ${SALMON_ON_BRAND} transition-colors`}
            />
            <span className="text-white/35" aria-hidden>
              ·
            </span>
            <a
              href={PRIVACY_PATH}
              className={`${SALMON_ON_BRAND} transition-colors`}
            >
              Privacy
            </a>
            <span className="text-white/35" aria-hidden>
              ·
            </span>
            <a
              href={TERMS_PATH}
              className={`${SALMON_ON_BRAND} transition-colors`}
            >
              Terms
            </a>
          </div>
          <p className="text-xs text-white/45 tracking-wide">
            {COPYRIGHT_NOTICE}
          </p>
        </div>
      </div>
      <div className="lg:p-8 h-full flex flex-col justify-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          </div>
          {errorMessage && (
            <p className="text-red-500 text-sm text-center" role="alert">
              {errorMessage}
            </p>
          )}
          <UserAuthForm onLoginWithOauth={onLoginWithOauth} />
          <Link
            href="/auth/signup"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Don&apos;t have an account? Sign up
          </Link>
          {/* Mobile: brand panel is hidden — surface beta scope + docs/legal here */}
          <div className="lg:hidden pt-2 text-center space-y-3 border-t">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium pt-1">
              <DocsLink
                className={`inline-flex items-center justify-center gap-1.5 ${SALMON_DARK} transition-colors`}
              />
              <span aria-hidden>·</span>
              <a
                href={PRIVACY_PATH}
                className={`${SALMON_DARK} transition-colors`}
              >
                Privacy
              </a>
              <span aria-hidden>·</span>
              <a
                href={TERMS_PATH}
                className={`${SALMON_DARK} transition-colors`}
              >
                Terms
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{COPYRIGHT_NOTICE}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
