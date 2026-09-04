"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DOCS_URL } from "@/components/auth/login/login-branding";
import { RepositoryPanel } from "@/components/research-repository/repository-panel";
import { shortRepositoryName } from "@/components/settings/private-research-repositories-card";
import {
  workspaceNavGhostClass,
  WorkspaceSiteHeader,
} from "@/components/teaching/workspace-site-header";
import { SettingsBreadcrumb } from "@/components/workspace/settings-breadcrumb";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import {
  WorkspaceItemProvider,
  useWorkspaceItem,
} from "@/contexts/WorkspaceItemContext";
import { isUsableResearchRepository } from "@/lib/workspace/types";
import { useTranslations } from "next-intl";

type GithubRepositoriesResponse = {
  repositories?: Array<{ id: number; nameWithOwner: string }>;
};

function RepositorySettingsDetail() {
  const t = useTranslations("settings");
  const { user, loading: userLoading } = useUserContext();
  const { item, loading } = useWorkspaceItem();
  const router = useRouter();
  const repositoryId =
    item?.kind === "research_repository"
      ? item.binding?.repositoryId
      : undefined;
  const fallbackName =
    repositoryId === undefined
      ? t("privateResearchRepository")
      : `Repository #${repositoryId}`;
  const [name, setName] = useState(fallbackName);

  useEffect(() => {
    if (!userLoading && !user) router.replace("/auth/login");
  }, [router, user, userLoading]);

  useEffect(() => {
    if (!loading && (!item || item.kind !== "research_repository")) {
      router.replace("/workspace/settings");
    }
  }, [item, loading, router]);

  useEffect(() => {
    setName(fallbackName);
    if (repositoryId === undefined) return;
    let cancelled = false;
    fetch("/api/workspace/github/repositories", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("couldNotLoadRepositoryName"));
        return response.json() as Promise<GithubRepositoriesResponse>;
      })
      .then((body) => {
        const nameWithOwner = body.repositories?.find(
          (repository) => repository.id === repositoryId
        )?.nameWithOwner;
        if (!cancelled && nameWithOwner) {
          setName(shortRepositoryName(nameWithOwner));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fallbackName, repositoryId]);

  if (userLoading || !user || loading || !item) {
    return (
      <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
    );
  }
  if (item.kind !== "research_repository") return null;

  return (
    <main className="min-h-screen bg-slate-50">
      <WorkspaceSiteHeader workspaceLabel={name} maxWidthClass="max-w-6xl">
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
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <SettingsBreadcrumb
            trailingSegments={[
              {
                label: name,
                testId: "settings-breadcrumb-repository",
              },
            ]}
          />
        </div>
        {isUsableResearchRepository(item) ? (
          <RepositoryPanel item={item} />
        ) : (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            {t("repositoryBindingUnusable")}
          </section>
        )}
      </section>
    </main>
  );
}

export default function RepositorySettingsPage() {
  const t = useTranslations("settings");
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <UserProvider>
        <WorkspaceItemProvider itemId={id}>
          <RepositorySettingsDetail />
        </WorkspaceItemProvider>
      </UserProvider>
    </Suspense>
  );
}
