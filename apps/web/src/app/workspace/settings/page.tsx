"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  workspaceNavGhostClass,
  WorkspaceSiteHeader,
} from "@/components/teaching/workspace-site-header";
import { DOCS_URL } from "@/components/auth/login/login-branding";
import { SettingsBreadcrumb } from "@/components/workspace/settings-breadcrumb";
import { ByokSettingsCard } from "@/components/workspace/byok-settings-card";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

function SettingsForm() {
  const { user, loading } = useUserContext();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setName(
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : ""
    );
    setSurname(
      typeof user.user_metadata?.surname === "string"
        ? user.user_metadata.surname
        : ""
    );
  }, [user]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSubmitting(true);
    try {
      const client = createSupabaseClient();
      const { error } = await client.auth.updateUser({
        data: {
          name: trimmedName,
          surname: surname.trim(),
          full_name: `${trimmedName} ${surname.trim()}`.trim(),
        },
      });

      if (error) {
        toast({
          title: "Could not save",
          description: error.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Saved" });
    } catch {
      toast({
        title: "Could not save",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <WorkspaceSiteHeader workspaceLabel="Settings" maxWidthClass="max-w-3xl">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={workspaceNavGhostClass}
        >
          Docs
        </a>
      </WorkspaceSiteHeader>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <SettingsBreadcrumb />
        </div>
        <div className="space-y-6">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Your name</CardTitle>
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
                  <Label htmlFor="surname">Last name</Label>
                  <Input
                    id="surname"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
                <Button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <ByokSettingsCard />
        </div>
      </section>
    </main>
  );
}

export default function WorkspaceSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <SettingsForm />
      </UserProvider>
    </Suspense>
  );
}
