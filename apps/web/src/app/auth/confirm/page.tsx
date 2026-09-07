"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { createSupabaseClient } from "@/lib/supabase/client";
import { exchangeSignupCode } from "./actions";

type ConfirmStatus =
  | { kind: "working"; message: string }
  | { kind: "error"; message: string };

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function ConfirmEmailContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const [status, setStatus] = useState<ConfirmStatus>({
    kind: "working",
    message: t("confirmingEmail"),
  });
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // PKCE: ?code= in the query string
      if (code) {
        const result = await exchangeSignupCode(code, next);
        if (cancelled) return;
        if (result.ok) {
          // Strip ?code= so refresh / client auth cannot re-exchange it.
          window.history.replaceState(null, "", window.location.pathname);
          router.replace(result.redirectTo);
          return;
        }
        setStatus({ kind: "error", message: result.error });
        return;
      }

      const hashParams = parseHashParams();
      const hashError =
        hashParams.get("error") ||
        hashParams.get("error_code") ||
        hashParams.get("error_description");

      if (hashError) {
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled && user?.email) {
          setResendEmail(user.email);
        }
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: t("confirmationLinkInvalid"),
          });
        }
        return;
      }

      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      if (access_token && refresh_token) {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
        if (cancelled) return;
        if (error || !data.user) {
          setStatus({
            kind: "error",
            message: error?.message ?? t("confirmationLinkInvalid"),
          });
          return;
        }
        const path =
          (next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : null) ?? "/teacher";
        router.replace(path);
        return;
      }

      // No params yet — brief wait for late hash, then send to login.
      await new Promise((r) => setTimeout(r, 5_000));
      if (cancelled) return;
      router.replace("/auth/login");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, next, router, t]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResending(true);
    setResendMessage(null);
    setResendError(null);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/teacher")}`,
        },
      });
      if (!error) {
        setResendMessage(t("confirmationLinkSent"));
      } else {
        setResendError(error.message);
      }
    } catch {
      setResendError(t("couldNotResendConfirmation"));
    } finally {
      setResending(false);
    }
  };

  if (status.kind === "working") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("confirmingEmail")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icons.spinner className="h-4 w-4 animate-spin" />
            {status.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("emailConfirmationFailed")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-destructive" role="alert">
              {status.message}
            </p>
            <form onSubmit={handleResend} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="resend-email">
                  {t("resendConfirmationLink")}
                </Label>
                <Input
                  id="resend-email"
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                />
              </div>
              {resendError && (
                <p className="text-sm text-destructive" role="alert">
                  {resendError}
                </p>
              )}
              {resendMessage && (
                <p className="text-sm text-muted-foreground" role="status">
                  {resendMessage}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={resending}>
                {resending && (
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("resendConfirmationLink")}
              </Button>
            </form>
            <Link
              href="/auth/login"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              {t("signIn")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

export default function ConfirmEmailPage() {
  const t = useTranslations("auth");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          {t("confirmingEmail")}
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  );
}
