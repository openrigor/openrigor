"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseClient } from "@/lib/supabase/client";
import { postLoginPath } from "@/lib/teaching/config";

function RegisterForm() {
  const router = useRouter();
  const { user, loading } = useUserContext();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (user.user_metadata?.registrationComplete === true) {
      router.replace(postLoginPath(user));
    }
  }, [user, loading, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const client = createSupabaseClient();
      const { error: updateError } = await client.auth.updateUser({
        data: {
          name,
          surname,
          full_name: `${name} ${surname}`.trim(),
          registrationComplete: true,
        },
      });

      if (updateError) {
        setError(updateError.message ?? "Failed to complete registration");
        return;
      }

      router.replace(postLoginPath(user));
    } catch {
      setError("Failed to complete registration");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete your registration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">First name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Surname</Label>
              <Input
                id="surname"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <UserProvider>
      <RegisterForm />
    </UserProvider>
  );
}
