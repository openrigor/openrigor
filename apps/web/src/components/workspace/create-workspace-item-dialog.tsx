"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceItem } from "@/lib/workspace/types";
import { useTranslations } from "next-intl";

export type CatalogResult = {
  id: string;
  title: string;
  description: string;
  kind: "template" | "method" | "ledger";
  templateKind?: "markdown" | "form";
  disabled?: boolean;
  status?: string;
  reason?: string;
  methodVersion?: string;
  evidenceTemplate?: { id: string; version: string };
  acceptedEvidenceCount?: number;
  private?: boolean;
  repositoryItemId?: string;
  commitSha?: string;
};

export function workspaceItemCreationKinds() {
  return ["template", "ledger", "method"] as const;
}

export function buildWorkspaceItemCreateBody(
  result: Pick<CatalogResult, "id" | "kind" | "private" | "repositoryItemId">
): Record<string, unknown> {
  if (result.kind === "method") {
    return {
      kind: "method",
      methodId: result.id,
      ...(result.private && result.repositoryItemId
        ? { repositoryItemId: result.repositoryItemId }
        : {}),
    };
  }
  if (result.kind === "ledger") {
    return {
      kind: "ledger",
      methodId: result.id,
      ...(result.private && result.repositoryItemId
        ? { repositoryItemId: result.repositoryItemId }
        : {}),
    };
  }
  return { kind: "template", templateId: result.id };
}

export function catalogResultTitle(
  result: Pick<CatalogResult, "title" | "private">
): string {
  return `${result.title}${result.private ? " (Private)" : ""}`;
}

export function catalogResultBadge(
  result: Pick<CatalogResult, "private">
): "Private" | undefined {
  return result.private ? "Private" : undefined;
}

export function CreateWorkspaceItemDialog({
  onCreated,
}: {
  onCreated: (item: WorkspaceItem) => void;
}) {
  const t = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"template" | "method" | "ledger">("method");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);
    fetch(
      `/api/workspace/catalog?kind=${kind}&q=${encodeURIComponent(query)}`,
      { credentials: "include" }
    )
      .then((response) => response.json())
      .then(
        (body: {
          kind: "template" | "method" | "ledger";
          results?: CatalogResult[];
        }) => {
          if (!cancelled) {
            setResults(
              (body.results || []).map((result) => ({
                ...result,
                kind: body.kind,
              }))
            );
          }
        }
      )
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, query]);

  async function create(result: CatalogResult) {
    return createWithBody(buildWorkspaceItemCreateBody(result));
  }

  async function createWithBody(requestBody: Record<string, unknown>) {
    setCreating(true);
    try {
      const response = await fetch("/api/workspace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error("Could not create workspace item");
      const responseBody = (await response.json()) as { item: WorkspaceItem };
      onCreated(responseBody.item);
      handleOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        title: t("couldNotCreateWorkspaceItem"),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setKind("method");
      setQuery("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("createWorkspaceItem")}</DialogTitle>
          <DialogDescription>
            {t("createWorkspaceItemDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchTemplates")}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          {workspaceItemCreationKinds().map((option) => (
            <Button
              key={option}
              variant={kind === option ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setKind(option);
              }}
            >
              {option === "template"
                ? t("templates")
                : option === "ledger"
                  ? t("evidenceLedger")
                  : t("methods")}
            </Button>
          ))}
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("searching")}
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noResults")}
            </p>
          )}
          {!loading &&
            results.map((result) => (
              <button
                key={`${result.id}:${result.repositoryItemId ?? "catalog"}`}
                type="button"
                disabled={result.disabled || creating}
                onClick={() => void create(result)}
                aria-label={catalogResultTitle(result)}
                className="w-full rounded-lg border p-4 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{result.title}</span>
                    {catalogResultBadge(result) && (
                      <Badge variant="secondary">{t("private")}</Badge>
                    )}
                  </span>
                  {result.status && (
                    <span className="text-xs text-muted-foreground">
                      {result.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.description}
                </p>
                {result.kind === "ledger" && result.evidenceTemplate && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {result.id}@{result.methodVersion} ·{" "}
                    {result.evidenceTemplate.id}@
                    {result.evidenceTemplate.version} ·{" "}
                    {t("acceptedEvidence", {
                      count: result.acceptedEvidenceCount ?? 0,
                    })}
                    {result.reason ? ` · ${result.reason}` : ""}
                  </p>
                )}
                {result.kind === "template" &&
                  result.templateKind === "form" && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      {t("protectedFormSubmitToLock")}
                    </p>
                  )}
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
