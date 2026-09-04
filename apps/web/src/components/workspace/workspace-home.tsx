"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  FileText,
  FlaskConical,
  ListChecks,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  buildWorkspaceItemCreateBody,
  CreateWorkspaceItemDialog,
  type CatalogResult,
} from "./create-workspace-item-dialog";
import type { WorkspaceItem } from "@/lib/workspace/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  workspaceNavGhostClass,
  WorkspaceSiteHeader,
} from "@/components/teaching/workspace-site-header";
import { DOCS_URL } from "@/components/auth/login/login-branding";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";
import { UserMenu } from "./user-menu";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import {
  formatWorkspaceItemDate,
  workspaceItemDescription,
  workspaceItemHref,
  workspaceItemKicker,
  workspaceItemTitle,
  workspaceItemType,
} from "@/lib/workspace/display";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { AiModeOnboardingDialog } from "./ai-mode-settings-card";
import { useTranslations } from "next-intl";

export function shouldShowGithubResearchOnboarding(
  repositoriesResponse: Pick<Response, "ok" | "status">,
  items: Array<Pick<WorkspaceItem, "kind">>
): boolean {
  return (
    repositoriesResponse.ok &&
    repositoriesResponse.status !== 404 &&
    !items.some((item) => item.kind === "research_repository")
  );
}

function GithubResearchOnboarding() {
  const t = useTranslations("workspace");
  return (
    <Card
      className="mb-4 border-blue-200 bg-blue-50/70"
      data-testid="github-research-onboarding"
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="font-medium text-slate-900">
            {t("connectPrivateResearchRepository")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("connectGithubResearchDescription")}
          </p>
        </div>
        <Button asChild>
          <a href="/api/workspace/github/authorize">{t("connectGithub")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}

function WorkspaceItemTypeIcon({ item }: { item: WorkspaceItem }) {
  const type = workspaceItemType(item);
  const Icon =
    item.kind === "form_template"
      ? ClipboardList
      : item.kind === "ledger" || item.kind === "ledger_snapshot"
        ? ListChecks
        : item.kind === "method" || item.kind === "method_participant"
          ? FlaskConical
          : FileText;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${type.colorClass}`}
            role="img"
            aria-label={type.label}
          >
            <Icon className={`h-5 w-5 ${type.iconClass}`} aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{type.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MethodCatalog({
  onCreated,
}: {
  onCreated: (item: WorkspaceItem) => void;
}) {
  const t = useTranslations("workspace");
  const [methods, setMethods] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string>();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/catalog?kind=method", {
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) throw new Error(t("couldNotLoadMethods"));
        return response.json() as Promise<{
          results?: Array<Omit<CatalogResult, "kind">>;
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        setMethods(
          (body.results || []).map((result) => ({
            ...result,
            kind: "method" as const,
          }))
        );
      })
      .catch((loadError) => {
        console.error("Failed to load Method catalog", loadError);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function startMethod(result: CatalogResult) {
    const key = `${result.id}:${result.repositoryItemId ?? "catalog"}`;
    setCreatingKey(key);
    try {
      const response = await fetch("/api/workspace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildWorkspaceItemCreateBody(result)),
      });
      if (!response.ok) throw new Error(t("couldNotCreateWorkspaceItem"));
      const responseBody = (await response.json()) as { item: WorkspaceItem };
      onCreated(responseBody.item);
    } catch (createError) {
      console.error("Failed to create workspace item from Method", createError);
      toast({
        title: t("couldNotCreateWorkspaceItem"),
        variant: "destructive",
      });
    } finally {
      setCreatingKey(undefined);
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-4"
      aria-labelledby="method-catalog-heading"
      data-testid="method-catalog"
    >
      <div>
        <h1
          id="method-catalog-heading"
          className="text-2xl font-semibold tracking-tight text-slate-900"
        >
          {t("startWithMethod")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          {t("chooseReviewedMethod")}
        </p>
      </div>

      {loading && (
        <Card className="border-dashed bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("loadingMethods")}
          </CardContent>
        </Card>
      )}
      {!loading && error && (
        <Card className="border-dashed bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("methodsCouldNotLoad")}
          </CardContent>
        </Card>
      )}
      {!loading && !error && methods.length === 0 && (
        <Card className="border-dashed bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("noMethodsAvailable")}
          </CardContent>
        </Card>
      )}
      {!loading && !error && methods.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            {methods.map((result) => {
              const key = `${result.id}:${result.repositoryItemId ?? "catalog"}`;
              return (
                <Card key={key} className="bg-white">
                  <CardContent className="flex h-full flex-col gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-medium text-slate-900">
                          {result.title}
                        </h2>
                        {result.private && (
                          <Badge variant="secondary">{t("private")}</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {result.description}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={creatingKey !== undefined}
                        aria-label={`Start ${result.title}`}
                        onClick={() => void startMethod(result)}
                      >
                        {creatingKey === key ? t("starting") : t("start")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function WorkspaceHome() {
  const t = useTranslations("workspace");
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [showGithubResearchOnboarding, setShowGithubResearchOnboarding] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [itemToDelete, setItemToDelete] = useState<WorkspaceItem>();
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user, loading: userLoading } = useUserContext();

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/items", { credentials: "include" }),
      fetch("/api/workspace/github/repositories", {
        credentials: "include",
      }),
    ])
      .then(async ([itemsResponse, repositoriesResponse]) => {
        if (!itemsResponse.ok) {
          throw new Error(t("couldNotLoadWorkspace"));
        }
        const body = (await itemsResponse.json()) as {
          items?: WorkspaceItem[];
        };
        const workspaceItems = body.items || [];
        setShowGithubResearchOnboarding(
          shouldShowGithubResearchOnboarding(
            repositoriesResponse,
            workspaceItems
          )
        );
        setItems(
          workspaceItems.filter((item) => item.kind !== "research_repository")
        );
      })
      .catch((error) => {
        console.error("Failed to load workspace", error);
        setShowGithubResearchOnboarding(false);
        toast({
          title: t("couldNotLoadWorkspace"),
          description: t("pleaseRefreshAndTryAgain"),
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  async function deleteItem() {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(itemToDelete.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error(t("couldNotDeleteWorkspaceItem"));
      setItems((current) =>
        current.filter((item) => item.id !== itemToDelete.id)
      );
      setItemToDelete(undefined);
    } catch (error) {
      console.error("Failed to delete workspace item", error);
      toast({
        title: t("couldNotDeleteItem"),
        description: t("pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AiModeOnboardingDialog />
      <WorkspaceSiteHeader
        workspaceLabel={t("workspace")}
        maxWidthClass="max-w-6xl"
      >
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={workspaceNavGhostClass}
        >
          {t("docs")}
        </a>
        {!userLoading && user ? <UserMenu user={user} /> : null}
      </WorkspaceSiteHeader>
      <section className="mx-auto flex h-[calc(100vh-60px)] max-w-5xl flex-col overflow-hidden px-4 py-6 sm:px-6">
        <div className="mb-4 flex justify-end">
          <CreateWorkspaceItemDialog
            onCreated={(item) => setItems((current) => [item, ...current])}
          />
        </div>
        {showGithubResearchOnboarding && <GithubResearchOnboarding />}
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("loadingWorkspace")}
          </p>
        ) : items.length === 0 ? (
          <MethodCatalog
            onCreated={(item) => setItems((current) => [item, ...current])}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {items.map((item) => (
              <Card
                key={item.id}
                className="shrink-0 bg-white transition-colors hover:bg-slate-50"
              >
                <CardContent className="flex items-center gap-3 px-4 py-3 sm:gap-4">
                  <WorkspaceItemTypeIcon item={item} />
                  <Link
                    href={workspaceItemHref(item)}
                    className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="truncate text-base font-medium text-slate-900">
                      {workspaceItemTitle(item)}
                    </p>
                    {workspaceItemKicker(item) && (
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          item.kind === "method" && item.run
                            ? "bg-violet-50 text-violet-700"
                            : item.kind === "method_participant"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.kind === "form_template" &&
                                  item.submission?.status === "submitted"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {workspaceItemKicker(item)}
                      </span>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p
                            className="truncate text-sm text-slate-500"
                            title={workspaceItemDescription(item)}
                          >
                            {workspaceItemDescription(item)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          {workspaceItemDescription(item)}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Link>
                  <time
                    dateTime={item.createdAt}
                    title={new Date(item.createdAt).toLocaleString()}
                    className="shrink-0 text-[11px] tabular-nums text-slate-500 sm:text-xs"
                  >
                    {formatWorkspaceItemDate(item.createdAt)}
                  </time>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${workspaceItemTitle(item)}`}
                    data-testid={`delete-workspace-item-${item.id}`}
                    onClick={() => setItemToDelete(item)}
                  >
                    <Trash2 className="h-4 w-4 text-slate-500" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      {itemToDelete && (
        <WorkspaceItemDeleteDialog
          open={Boolean(itemToDelete)}
          onOpenChange={(open) => !open && setItemToDelete(undefined)}
          onConfirm={() => void deleteItem()}
          itemTitle={workspaceItemTitle(itemToDelete)}
          isDeleting={isDeleting}
        />
      )}
    </main>
  );
}

export function AuthenticatedWorkspaceHome() {
  const t = useTranslations("workspace");
  const { user, loading } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
    );
  }
  return <WorkspaceHome />;
}

export function WorkspacePageClient() {
  return (
    <UserProvider>
      <AuthenticatedWorkspaceHome />
    </UserProvider>
  );
}
