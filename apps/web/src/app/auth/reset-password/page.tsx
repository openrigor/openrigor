"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  MIN_PASSWORD_LENGTH,
  validatePasswords,
} from "@/lib/auth/password-validation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { resetPasswordWithCode } from "./actions";

type PageStatus =
  | { kind: "loading" }
  | {
      kind: "ready";
      mode: "code" | "token_hash";
      code?: string;
      tokenHash?: string;
    }
  | { kind: "error"; message: string }
  | { kind: "success" };

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function ResetPasswordContent() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code");
  const queryTokenHash = searchParams.get("token_hash");
  const queryType = searchParams.get("type");

  const [status, setStatus] = useState<PageStatus>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;

    const applyFromHash = (): boolean => {
      const hashParams = parseHashParams();
      const hashError =
        hashParams.get("error") ||
        hashParams.get("error_code") ||
        hashParams.get("error_description");

      if (hashError) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: t("resetLinkInvalid"),
          });
        }
        return true;
      }

      const tokenHash = hashParams.get("token_hash");
      const type = hashParams.get("type");
      if (tokenHash && type === "recovery") {
        // Strip the hash so refresh cannot re-use the one-time token.
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
        if (!cancelled) {
          setStatus({
            kind: "ready",
            mode: "token_hash",
            tokenHash,
          });
        }
        return true;
      }

      return false;
    };

    if (codeParam?.trim()) {
      setStatus({
        kind: "ready",
        mode: "code",
        code: codeParam.trim(),
      });
      return;
    }

    if (queryTokenHash && queryType === "recovery") {
      window.history.replaceState(null, "", window.location.pathname);
      setStatus({
        kind: "ready",
        mode: "token_hash",
        tokenHash: queryTokenHash,
      });
      return;
    }

    if (applyFromHash()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled || resolved) return;
      if (applyFromHash()) {
        resolved = true;
        return;
      }
      setStatus({
        kind: "error",
        message: t("resetLinkInvalid"),
      });
    }, 1_500);

    const onHashChange = () => {
      if (cancelled || resolved) return;
      if (applyFromHash()) {
        resolved = true;
        window.clearTimeout(timeoutId);
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [codeParam, queryTokenHash, queryType, t]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status.kind !== "ready") return;

    const validationError = validatePasswords(password, confirmPassword);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (status.mode === "code" && status.code) {
        const result = await resetPasswordWithCode(
          status.code,
          password,
          confirmPassword
        );
        if (result.ok) {
          window.history.replaceState(null, "", window.location.pathname);
          setStatus({ kind: "success" });
        } else {
          setFormError(result.error);
        }
        return;
      }

      if (status.mode === "token_hash" && status.tokenHash) {
        const supabase = createSupabaseClient();
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: status.tokenHash,
          type: "recovery",
        });
        if (verifyError) {
          setFormError(t("resetLinkInvalid"));
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) {
          setFormError(updateError.message || t("couldNotUpdatePassword"));
          return;
        }

        setStatus({ kind: "success" });
        return;
      }

      setFormError(t("resetLinkInvalid"));
    } catch {
      setFormError(t("couldNotUpdatePasswordTryAgain"));
    } finally {
      setSubmitting(false);
    }
  };

  if (status.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground gap-2">
        <Icons.spinner className="h-4 w-4 animate-spin" />
        {t("preparingPasswordReset")}
      </div>
    );
  }

  if (status.kind === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">{t("passwordUpdated")}</h1>
          <p className="text-gray-600 mb-6">
            {t("passwordChangedDescription")}
          </p>
          <Link
            href="/auth/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold">{t("resetLinkInvalidTitle")}</h1>
          <p className="text-sm text-destructive" role="alert">
            {status.message}
          </p>
          <Link
            href="/auth/forgot-password"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {t("requestNewResetLink")}
          </Link>
          <Link
            href="/auth/login"
            className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
          >
            {t("backToSignIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container relative h-full flex-col items-center justify-center flex min-h-screen">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("chooseNewPassword")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("newPasswordDescription")}
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1 px-1">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              autoCorrect="off"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1 px-1">
            <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              autoCorrect="off"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive text-center" role="alert">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("updatePassword")}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth");

  return (
    <main className="h-screen">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
            {t("preparingPasswordReset")}
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
