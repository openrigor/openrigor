"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";
import { Input } from "../../ui/input";
import { Button, buttonVariants } from "../../ui/button";
import { Icons } from "../../ui/icons";
import { Label } from "../../ui/label";
import { useState } from "react";
import { PasswordInput } from "../../ui/password-input";
import { login } from "./actions";

function LoginSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
      Login with Email
    </Button>
  );
}

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  onLoginWithOauth: (provider: "google" | "github") => Promise<void>;
}

export function UserAuthForm({
  className,
  onLoginWithOauth,
  ...props
}: UserAuthFormProps) {
  const [isGoogleLoading, setGoogleIsLoading] = useState(false);
  const [isGithubLoading, setGithubIsLoading] = useState(false);

  const enableGithubAuth =
    process.env.NEXT_PUBLIC_ENABLE_GITHUB_AUTH === "true";
  const isOauthLoading =
    isGoogleLoading || (enableGithubAuth && isGithubLoading);

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form action={login} method="post" className="grid gap-2">
        <div className="grid gap-1">
          <div className="pt-1 pb-[2px] px-1">
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
              disabled={isOauthLoading}
            />
          </div>
          <div className="pt-[2px] pb-1 px-1">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="Your password"
              autoComplete="current-password"
              autoCorrect="off"
              required
              disabled={isOauthLoading}
            />
            <div className="flex justify-end pt-1">
              <Link
                href="/auth/forgot-password"
                className={cn(
                  buttonVariants({ variant: "link" }),
                  "h-auto p-0 text-sm text-muted-foreground"
                )}
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>
        <LoginSubmitButton />
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>
      <Button
        onClick={async () => {
          setGoogleIsLoading(true);
          await onLoginWithOauth("google");
          setGoogleIsLoading(false);
        }}
        variant="outline"
        type="button"
        disabled={isOauthLoading}
      >
        {isOauthLoading ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.google className="mr-2 h-4 w-4" />
        )}{" "}
        Google
      </Button>
      {enableGithubAuth && (
        <Button
          onClick={async () => {
            setGithubIsLoading(true);
            await onLoginWithOauth("github");
            setGithubIsLoading(false);
          }}
          variant="outline"
          type="button"
          disabled={isOauthLoading}
        >
          {isOauthLoading ? (
            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Icons.gitHub className="mr-2 h-4 w-4" />
          )}{" "}
          GitHub
        </Button>
      )}
    </div>
  );
}
