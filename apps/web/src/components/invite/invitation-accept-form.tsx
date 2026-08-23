"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";
import { useUserContext } from "@/contexts/UserContext";
import { createSupabaseClient } from "@/lib/supabase/client";

interface PublicInvitation {
  token: string;
  email: string;
  role: "admin" | "teacher" | "student";
  classId: string | null;
  className: string | null;
  status: string;
  expires_at: string;
}

interface InvitationAcceptFormProps {
  token: string;
}

export function InvitationAcceptForm({ token }: InvitationAcceptFormProps) {
  const router = useRouter();
  const { user, loading: userLoading, getUser } = useUserContext();
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInvitation = async () => {
      setLoadingInvitation(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/invitations/${encodeURIComponent(token)}`
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Invitation not found");
          return;
        }

        setInvitation(data.invitation);
      } catch {
        setError("Failed to load invitation");
      } finally {
        setLoadingInvitation(false);
      }
    };

    loadInvitation();
  }, [token]);

  const acceptInvitation = async () => {
    const res = await fetch(
      `/api/invitations/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }
    );
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error ?? "Failed to accept invitation");
    }

    router.replace(data.redirectTo ?? "/student");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const client = createSupabaseClient();
      let currentUser = user ?? (await getUser());

      if (!currentUser && invitation) {
        if (!password) {
          setError("Enter a password to create your account");
          return;
        }

        const { data, error: signUpError } = await client.auth.signUp({
          email: invitation.email,
          password,
        });

        if (signUpError) {
          const { error: signInError } = await client.auth.signInWithPassword({
            email: invitation.email,
            password,
          });

          if (signInError) {
            setError(signInError.message);
            return;
          }
        } else if (data.user && !data.session) {
          setError(
            "Check your email to confirm your account, then return here."
          );
          return;
        }

        currentUser = (await getUser()) ?? data.user ?? undefined;
      } else if (currentUser && password) {
        const { error: updateError } = await client.auth.updateUser({
          password,
        });
        if (updateError) {
          setError(updateError.message);
          return;
        }
      }

      if (!currentUser) {
        setError("Sign in to continue");
        return;
      }

      await acceptInvitation();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to complete registration"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const client = createSupabaseClient();
      const currentOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${currentOrigin}/invite/accept?token=${encodeURIComponent(token)}`,
        },
      });
    } catch {
      setError("Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (userLoading || !user || !invitation || submitting) return;

    const metadataName =
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined) ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "");

    if (metadataName && !name) {
      setName(metadataName);
    }
  }, [user, userLoading, invitation, name, submitting]);

  if (loadingInvitation || userLoading) {
    return <p className="text-sm text-muted-foreground">Loading invitation…</p>;
  }

  if (error && !invitation) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={invitation.email} readOnly disabled />
      </div>

      <div className="flex items-center gap-2">
        <Label>Role</Label>
        <Badge variant="secondary">{invitation.role}</Badge>
        {invitation.className && (
          <Badge variant="outline">{invitation.className}</Badge>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          id="full-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          autoComplete="name"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {user ? "Set password (optional)" : "Password"}
        </Label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={user ? "Leave blank to skip" : "Create a password"}
          autoComplete={user ? "new-password" : "new-password"}
          required={!user}
          disabled={submitting || googleLoading}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || googleLoading}
      >
        {submitting && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
        {submitting ? "Completing…" : "Complete registration"}
      </Button>

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
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={submitting || googleLoading}
      >
        {googleLoading ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.google className="mr-2 h-4 w-4" />
        )}
        Google
      </Button>
    </form>
  );
}
