"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { requestPasswordReset, type ForgotPasswordResult } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
      Send reset link
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [result, setResult] = React.useState<ForgotPasswordResult | null>(null);

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-gray-600 mb-4">
            If an account exists for that address, we sent a password reset
            link. Open the link to choose a new password.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            If you don&apos;t see the email, please check your spam folder.
          </p>
          <Link
            href="/auth/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Back to sign in
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
            Forgot password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
        <form action={onSubmit} className="grid gap-4">
          <div className="grid gap-1 px-1">
            <Label htmlFor="email">Email</Label>
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
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
