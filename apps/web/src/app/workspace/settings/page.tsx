"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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
import { AiModeSettingsCard } from "@/components/workspace/ai-mode-settings-card";
import { PrivateResearchRepositoriesCard } from "@/components/settings/private-research-repositories-card";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

function SettingsForm() {
  const { user, loading } = useUserContext();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("settings");
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
          title: t("couldNotSave"),
          description: error.message ?? t("pleaseTryAgain"),
          variant: "destructive",
        });
        return;
      }

      toast({ title: t("saved") });
    } catch {
      toast({
        title: t("couldNotSave"),
        description: t("pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <WorkspaceSiteHeader
        workspaceLabel={t("settings")}
        maxWidthClass="max-w-3xl"
      >
        <Link href="/workspace/settings" className={workspaceNavGhostClass}>
          {t("settings")}
        </Link>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={workspaceNavGhostClass}
        >
          {t("docs")}
        </a>
      </WorkspaceSiteHeader>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <SettingsBreadcrumb />
        </div>
        <div className="space-y-6">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("yourName")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("firstName")}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surname">{t("lastName")}</Label>
                  <Input
                    id="surname"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
                <Button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? t("saving") : t("save")}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("language")}</CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>
          <PrivateResearchRepositoriesCard />
          <AiModeSettingsCard />
          <ByokSettingsCard />
        </div>
      </section>
    </main>
  );
}

export default function WorkspaceSettingsPage() {
  const t = useTranslations("settings");
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <UserProvider>
        <SettingsForm />
      </UserProvider>
    </Suspense>
  );
}
