"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkspaceItem } from "@/lib/workspace/types";
import { isUsableResearchRepository } from "@/lib/workspace/types";
import type {
  PrivateMethodSummary,
  ResearchRepositoryWorkspaceItem,
} from "@/lib/workspace/research-repository/method-host-types";
import { repositorySettingsHref } from "@/lib/workspace/repository-settings-routes";
import { ResearchRepositoryStatus } from "@/components/workspace/research-repository-status";

export type GithubRepositoryOption = {
  id: number;
  nameWithOwner: string;
};

type GithubRepositoriesResponse = {
  connected: boolean;
  installationId?: number;
  login?: string;
  repositories: GithubRepositoryOption[];
};

const CSRF_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

type PrivateMethodsResponse = {
  methods?: PrivateMethodSummary[];
  selectedMethodIds?: string[];
};

type RepositoryItem = Extract<WorkspaceItem, { kind: "research_repository" }>;

type TranslateFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

function readableStatus(value: string, translate?: TranslateFn): string {
  return translate?.(`repositoryReason.${value}`) ?? value.replaceAll("_", " ");
}

function repositoryId(item: RepositoryItem): number | undefined {
  return item.binding?.repositoryId;
}

function repositoryName(
  item: RepositoryItem,
  repositories: GithubRepositoryOption[],
  translate?: TranslateFn
): string {
  const id = repositoryId(item);
  return (
    repositories.find((repository) => repository.id === id)?.nameWithOwner ??
    (id === undefined
      ? (translate?.("unavailableRepository") ?? "Unavailable repository")
      : (translate?.("repositoryFallback", { id }) ?? `Repository #${id}`))
  );
}

export function shortRepositoryName(nameWithOwner: string): string {
  return nameWithOwner.split("/").at(-1) || nameWithOwner;
}

function RepositoryMethods({
  item,
  disconnected,
}: {
  item: ResearchRepositoryWorkspaceItem;
  disconnected: boolean;
}) {
  const t = useTranslations("settings");
  const [methods, setMethods] = useState<PrivateMethodSummary[]>();
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>(
    item.selectedMethodIds
  );
  const [savingMethods, setSavingMethods] = useState(false);
  const [methodError, setMethodError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/workspace/items/${encodeURIComponent(item.id)}/repository/methods`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(t("couldNotDiscoverMethods"));
        return response.json() as Promise<PrivateMethodsResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setMethods(body.methods ?? []);
        setSelectedMethodIds(body.selectedMethodIds ?? []);
        setMethodError(false);
      })
      .catch(() => {
        if (!cancelled) setMethodError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function setMethodSelected(methodId: string, selected: boolean) {
    if (disconnected) return;
    const previous = selectedMethodIds;
    const next = selected
      ? [...new Set([...previous, methodId])]
      : previous.filter((id) => id !== methodId);
    setSelectedMethodIds(next);
    setSavingMethods(true);
    setMethodError(false);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/repository/methods`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedMethodIds: next }),
        }
      );
      if (!response.ok) throw new Error(t("couldNotSaveMethodSelection"));
      const body = (await response.json()) as PrivateMethodsResponse;
      setSelectedMethodIds(body.selectedMethodIds ?? next);
    } catch {
      setSelectedMethodIds(previous);
      setMethodError(true);
    } finally {
      setSavingMethods(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">
          {t("repositoryAccess")}
        </span>
      </div>
      <div
        className="rounded-md border border-slate-200 bg-white p-3"
        role="group"
        aria-labelledby={`private-methods-${item.id}`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span
            id={`private-methods-${item.id}`}
            className="font-medium text-slate-800"
          >
            {t("methodsAvailableInCreate")}
          </span>
          <a
            href="https://knowledge.openrigor.org/concepts/private-method-hosts.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline underline-offset-2"
          >
            {t("whyCannotSeeMethod")}
          </a>
        </div>
        {methods === undefined && !methodError ? (
          <p>{t("discoveringMethods")}</p>
        ) : methods && methods.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((method) => (
              <label
                key={method.id}
                className="flex min-w-0 items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5"
              >
                <Checkbox
                  checked={selectedMethodIds.includes(method.id)}
                  disabled={savingMethods || disconnected}
                  onCheckedChange={(checked) =>
                    void setMethodSelected(method.id, checked === true)
                  }
                  aria-label={`Select ${method.title ?? method.id}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">
                    {method.title ?? method.id}
                  </span>
                  {method.title && (
                    <code className="block truncate text-[11px]">
                      {method.id}
                    </code>
                  )}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p>{t("noConformingMethods")}</p>
        )}
        {methodError && (
          <p className="mt-2 text-red-700">{t("couldNotLoadOrSaveMethods")}</p>
        )}
      </div>
    </div>
  );
}

function RepositoryRow({
  item,
  repositories,
  disconnected,
  onRemove,
  removeError,
}: {
  item: RepositoryItem;
  repositories: GithubRepositoryOption[];
  disconnected: boolean;
  onRemove: (item: RepositoryItem, nameWithOwner: string) => void;
  removeError?: string;
}) {
  const t = useTranslations("settings");
  const [expanded, setExpanded] = useState(false);
  const nameWithOwner = repositoryName(item, repositories, t);
  const usable = isUsableResearchRepository(item);
  const initialized = usable && item.binding.initialized;
  const failureReason = usable
    ? item.binding.initializationFailureReason
    : "binding_unavailable";
  const detailsId = `private-repository-details-${item.id}`;

  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={repositorySettingsHref(item.id)}
              className="font-medium text-slate-950 hover:underline"
            >
              {shortRepositoryName(nameWithOwner)}
            </Link>
            <Badge variant="secondary">{t("private")}</Badge>
            <Badge variant={initialized ? "outline" : "destructive"}>
              {initialized ? t("initialized") : t("notInitialized")}
            </Badge>
            {failureReason && (
              <Badge variant="destructive">
                {readableStatus(failureReason, t)}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-slate-600">
            {nameWithOwner} ({t("private")})
          </p>
          {usable && <ResearchRepositoryStatus item={item} />}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`Manage ${nameWithOwner}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {t("manage")}
          <ChevronDown
            className={`ml-2 h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </Button>
      </div>
      {expanded && (
        <div
          id={detailsId}
          data-testid={`private-repository-details-${item.id}`}
        >
          {usable ? (
            <RepositoryMethods item={item} disconnected={disconnected} />
          ) : (
            <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
              <p>{t("storedBindingUnavailable")}</p>
              <Button asChild variant="outline" size="sm">
                <a href="/api/workspace/github/authorize">
                  {t("connectGithub")}
                </a>
              </Button>
            </div>
          )}
          <div className="space-y-2 border-t border-slate-200 bg-slate-50/70 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-700"
              data-testid={`remove-repository-${item.id}`}
              aria-label={`Remove ${nameWithOwner}`}
              onClick={() => onRemove(item, nameWithOwner)}
            >
              {t("remove")}
            </Button>
            {removeError && (
              <p role="alert" className="text-sm text-red-700">
                {removeError}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function PrivateResearchRepositoriesCard() {
  const t = useTranslations("settings");
  const [items, setItems] = useState<RepositoryItem[]>();
  const [githubRepositories, setGithubRepositories] =
    useState<GithubRepositoriesResponse>();
  const [featureAvailable, setFeatureAvailable] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addExpanded, setAddExpanded] = useState(false);
  const [creatingRepositoryId, setCreatingRepositoryId] = useState<number>();
  const [addError, setAddError] = useState<string>();
  const [removeErrorById, setRemoveErrorById] = useState<
    Record<string, string>
  >({});
  const [disconnectError, setDisconnectError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/workspace/items", { credentials: "include" }),
      fetch("/api/workspace/github/repositories", { credentials: "include" }),
    ])
      .then(async ([itemsResponse, repositoriesResponse]) => {
        if (repositoriesResponse.status === 404) {
          return { featureAvailable: false as const };
        }
        if (!itemsResponse.ok || !repositoriesResponse.ok) {
          throw new Error(t("couldNotLoadPrivateRepositories"));
        }
        const itemsBody = (await itemsResponse.json()) as {
          items?: WorkspaceItem[];
        };
        const repositoriesBody =
          (await repositoriesResponse.json()) as GithubRepositoriesResponse;
        return {
          featureAvailable: true as const,
          items: (itemsBody.items ?? []).filter(
            (item): item is RepositoryItem =>
              item.kind === "research_repository"
          ),
          repositories: repositoriesBody,
        };
      })
      .then((result) => {
        if (cancelled) return;
        setFeatureAvailable(result.featureAvailable);
        if (result.featureAvailable) {
          setItems(result.items);
          setGithubRepositories(result.repositories);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function bindRepository(repository: GithubRepositoryOption) {
    if (githubRepositories?.installationId === undefined) {
      setAddError(t("githubInstallationUnavailable"));
      return;
    }
    setCreatingRepositoryId(repository.id);
    setAddError(undefined);
    try {
      const response = await fetch("/api/workspace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "research_repository",
          installationId: githubRepositories.installationId,
          repositoryId: repository.id,
        }),
      });
      const body = (await response.json()) as {
        item?: WorkspaceItem;
        error?: string;
      };
      if (!response.ok || body.item?.kind !== "research_repository") {
        throw new Error(body.error || t("couldNotBindRepository"));
      }
      setItems((current) => [...(current ?? []), body.item as RepositoryItem]);
    } catch (cause) {
      setAddError(
        cause instanceof Error ? cause.message : t("couldNotBindRepository")
      );
    } finally {
      setCreatingRepositoryId(undefined);
    }
  }

  async function refetchGithubRepositories() {
    const response = await fetch("/api/workspace/github/repositories", {
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as GithubRepositoriesResponse;
    setGithubRepositories(body);
  }

  async function removeRepository(item: RepositoryItem, nameWithOwner: string) {
    if (
      !window.confirm(t("removeRepositoryConfirm", { name: nameWithOwner }))
    ) {
      return;
    }
    setRemoveErrorById((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: CSRF_HEADERS,
        }
      );
      if (response.status !== 204) {
        throw new Error(t("couldNotRemoveRepository"));
      }
      setItems((current) =>
        (current ?? []).filter((entry) => entry.id !== item.id)
      );
      await refetchGithubRepositories();
    } catch {
      setRemoveErrorById((current) => ({
        ...current,
        [item.id]: t("couldNotRemoveRepository"),
      }));
    }
  }

  async function disconnectGithub() {
    if (!window.confirm(t("disconnectGithubConfirm"))) {
      return;
    }
    setDisconnectError(undefined);
    try {
      const response = await fetch("/api/workspace/github/disconnect", {
        method: "POST",
        credentials: "include",
        headers: CSRF_HEADERS,
      });
      if (response.status !== 204) {
        throw new Error(t("couldNotDisconnectGithub"));
      }
      setGithubRepositories({
        connected: false,
        repositories: githubRepositories?.repositories ?? [],
      });
      setAddExpanded(true);
    } catch {
      setDisconnectError(t("couldNotDisconnectGithub"));
    }
  }

  if (!featureAvailable) return null;

  const boundRepositoryIds = new Set(
    (items ?? [])
      .map((item) => repositoryId(item))
      .filter((id): id is number => id !== undefined)
  );

  return (
    <Card className="bg-white" data-testid="private-repositories-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>{t("privateResearchRepositories")}</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={addExpanded}
          aria-controls="add-private-repository"
          onClick={() => setAddExpanded((current) => !current)}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {t("addPrivateResearchRepository")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p className="text-sm text-red-700">
            {t("couldNotLoadPrivateRepositories")}
          </p>
        ) : items === undefined ? (
          <p className="text-sm text-muted-foreground">
            {t("loadingPrivateRepositories")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noPrivateRepositories")}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <RepositoryRow
                key={item.id}
                item={item}
                repositories={githubRepositories?.repositories ?? []}
                disconnected={githubRepositories?.connected === false}
                onRemove={removeRepository}
                removeError={removeErrorById[item.id]}
              />
            ))}
          </ul>
        )}

        {githubRepositories?.connected === true && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span data-testid="connected-as">
              {githubRepositories.login
                ? t("connectedAs", { login: githubRepositories.login })
                : t("connected")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="disconnect-github"
              onClick={() => void disconnectGithub()}
            >
              {t("disconnectGithub")}
            </Button>
            {disconnectError && (
              <p role="alert" className="w-full text-sm text-red-700">
                {disconnectError}
              </p>
            )}
          </div>
        )}

        {addExpanded && (
          <div
            id="add-private-repository"
            className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4"
            data-testid="add-private-repository"
          >
            {!githubRepositories?.connected ? (
              <>
                <p className="text-sm text-slate-600">
                  {t("connectGithubChooseRepository")}{" "}
                  {t("repositoryTrustCopy")}
                </p>
                <Button asChild size="sm">
                  <a href="/api/workspace/github/authorize">
                    {t("connectGithub")}
                  </a>
                </Button>
              </>
            ) : (
              <>
                {githubRepositories.repositories.length === 0 ? (
                  <div className="rounded-lg border bg-white p-3">
                    <p className="text-sm text-slate-600">
                      {t("noInstallationRepositories")}
                    </p>
                    <Button asChild className="mt-3" size="sm">
                      <a href="/api/workspace/github/authorize">
                        {t("connectGithub")}
                      </a>
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {githubRepositories.repositories.map((repository) => {
                      const bound = boundRepositoryIds.has(repository.id);
                      return (
                        <li
                          key={repository.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"
                        >
                          <span className="font-medium text-slate-900">
                            {repository.nameWithOwner}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              bound || creatingRepositoryId !== undefined
                            }
                            onClick={() => void bindRepository(repository)}
                            aria-label={`Bind ${repository.nameWithOwner}`}
                          >
                            {bound
                              ? t("bound")
                              : creatingRepositoryId === repository.id
                                ? t("binding")
                                : t("bindRepository")}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {addError && (
              <p role="alert" className="text-sm text-red-700">
                {addError}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
