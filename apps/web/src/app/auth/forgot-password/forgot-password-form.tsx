"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { requestPasswordReset, type ForgotPasswordResult } from "./actions";

function SubmitButton() {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
      {t("sendResetLink")}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [result, setResult] = React.useState<ForgotPasswordResult | null>(null);

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">{t("checkYourEmail")}</h1>
          <p className="text-gray-600 mb-4">{t("resetEmailDescription")}</p>
          <p className="text-sm text-gray-500 mb-6">{t("checkSpamFolder")}</p>
          <Link
            href="/auth/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {t("backToSignIn")}
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(formData: FormData) {
    const next = await requestPasswordReset(formData);
    setResult(next);
  }

  return (
    <div className="container relative h-full flex-col items-center justify-center flex">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("forgotPassword")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("forgotPasswordDescription")}
          </p>
        </div>
        <form action={onSubmit} className="grid gap-4">
          <div className="grid gap-1 px-1">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              required
            />
          </div>
          {result && !result.ok && (
            <p className="text-sm text-destructive text-center" role="alert">
              {result.error}
            </p>
          )}
          <SubmitButton />
        </form>
        <Link
          href="/auth/login"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          {t("backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
