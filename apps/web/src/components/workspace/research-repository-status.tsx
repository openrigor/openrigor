"use client";

import { useEffect, useState } from "react";
import type { RepositoryStatus } from "@opencanvas/shared/research-repository";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  PrivateMethodSummary,
  ResearchRepositoryWorkspaceItem,
} from "@/lib/workspace/research-repository/method-host-types";

type RepositoryListResponse = {
  connected?: boolean;
  repositories?: Array<{ id: number; nameWithOwner: string }>;
};

type PrivateMethodsResponse = {
  methods?: PrivateMethodSummary[];
  selectedMethodIds?: string[];
};

export function shortRepositoryCommit(sha: string): string {
  return sha.slice(0, 7);
}

export function shouldShowRepositoryConnect(
  status: RepositoryStatus | undefined
): boolean {
  return (
    status?.state === "disconnected" ||
    status?.reason === "permission_lost" ||
    status?.reason === "authorization_required"
  );
}

function statusLabel(status: RepositoryStatus): string {
  return status.reason
    ? `${status.state.replace("_", " ")} · ${status.reason.replaceAll("_", " ")}`
    : status.state.replace("_", " ");
}

export function ResearchRepositoryStatus({
  item,
}: {
  item: ResearchRepositoryWorkspaceItem;
}) {
  const [status, setStatus] = useState<RepositoryStatus>();
  const [repositoryName, setRepositoryName] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [methods, setMethods] = useState<PrivateMethodSummary[]>();
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>(
    item.selectedMethodIds
  );
  const [savingMethods, setSavingMethods] = useState(false);
  const [methodError, setMethodError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/workspace/items/${encodeURIComponent(item.id)}/repository`, {
        credentials: "include",
      }),
      fetch("/api/workspace/github/repositories", {
        credentials: "include",
      }),
    ])
      .then(async ([statusResponse, repositoriesResponse]) => {
        if (statusResponse.status === 404) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const statusBody = (await statusResponse.json()) as {
          status?: RepositoryStatus;
        };
        if (statusResponse.status === 409 && statusBody.status) {
          if (!cancelled) setStatus(statusBody.status);
          return;
        }
        if (!statusResponse.ok) throw new Error("Could not check repository");
        if (!statusBody.status) throw new Error("Could not check repository");
        const repositoriesBody = repositoriesResponse.ok
          ? ((await repositoriesResponse.json()) as RepositoryListResponse)
          : undefined;
        if (!cancelled) {
          setStatus(statusBody.status);
          setRepositoryName(
            repositoriesBody?.repositories?.find(
              (repository) => repository.id === item.binding.repositoryId
            )?.nameWithOwner
          );
        }
      })
      .catch(() => {
        if (!cancelled) setStatus(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.binding.repositoryId, item.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/workspace/items/${encodeURIComponent(item.id)}/repository/methods`,
      { credentials: "include" }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not discover Methods");
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
      if (!response.ok) throw new Error("Could not save Method selection");
      const body = (await response.json()) as PrivateMethodsResponse;
      setSelectedMethodIds(body.selectedMethodIds ?? next);
    } catch {
      setSelectedMethodIds(previous);
      setMethodError(true);
    } finally {
      setSavingMethods(false);
    }
  }

  if (unavailable) return null;

  const headCommitSha = status?.headCommitSha ?? item.binding.headCommitSha;
  return (
    <div className="mt-2 space-y-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium text-slate-800">
          {repositoryName ?? `Repository #${item.binding.repositoryId}`}
        </span>
        <Badge variant="secondary">Private</Badge>
        <span>{item.binding.branch}</span>
        <code className="rounded bg-slate-100 px-1.5 py-0.5">
          {shortRepositoryCommit(headCommitSha)}
        </code>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            status?.state === "ready"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {loading ? "checking…" : status ? statusLabel(status) : "unavailable"}
        </span>
        {shouldShowRepositoryConnect(status) && (
          <Button asChild variant="outline" size="sm" className="h-7">
            <a href="/api/workspace/github/authorize">Connect GitHub</a>
          </Button>
        )}
      </div>
      <div
        className="max-w-xl rounded-md border border-slate-200 bg-slate-50/70 p-3"
        role="group"
        aria-labelledby={`private-methods-${item.id}`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span
            id={`private-methods-${item.id}`}
            className="font-medium text-slate-800"
          >
            Methods available in Create
          </span>
          <a
            href="https://knowledge.openrigor.org/concepts/private-method-hosts.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline underline-offset-2"
          >
            Why can&apos;t I see my method?
          </a>
        </div>
        {methods === undefined && !methodError ? (
          <p>Discovering methods…</p>
        ) : methods && methods.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((method) => (
              <label
                key={method.id}
                className="flex min-w-0 items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5"
              >
                <Checkbox
                  checked={selectedMethodIds.includes(method.id)}
                  disabled={savingMethods}
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
          <p>No conforming methods found.</p>
        )}
        {methodError && (
          <p className="mt-2 text-red-700">Could not load or save methods.</p>
        )}
      </div>
    </div>
  );
}
