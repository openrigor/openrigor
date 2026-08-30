"use client";

import { useEffect, useState } from "react";
import type {
  RepositoryStatus,
  ResearchRepositoryWorkspaceItem,
} from "@opencanvas/shared/research-repository";
import { Button } from "@/components/ui/button";
import {
  REPOSITORY_LAYOUT_READ_ONLY_COPY,
  REPOSITORY_LAYOUT_V2_COPY,
} from "@/components/research-repository/copy";

type RepositoryListResponse = {
  connected?: boolean;
  repositories?: Array<{ id: number; nameWithOwner: string }>;
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

function repositoryConnectLabel(status: RepositoryStatus | undefined): string {
  return status?.reason === "authorization_required"
    ? "Re-authorize GitHub"
    : "Reconnect GitHub";
}

export function statusLabel(status: RepositoryStatus | undefined): string {
  if (!status) return "unavailable";
  if (status.state === "read_only" && status.layoutVersion === "1.0") {
    return REPOSITORY_LAYOUT_READ_ONLY_COPY;
  }
  if (status.state === "ready" && status.layoutVersion === "2.0") {
    return `ready · ${REPOSITORY_LAYOUT_V2_COPY}`;
  }
  const state = status.state.replace("_", " ");
  if (
    status.reason &&
    status.reason.replaceAll("_", "") !== status.state.replaceAll("_", "")
  ) {
    return `${state} · ${status.reason.replaceAll("_", " ")}`;
  }
  return state;
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/workspace/items/${encodeURIComponent(item.id)}/repository`, {
        credentials: "include",
        cache: "no-store",
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
            statusBody.status.repositoryFullName ??
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

  if (unavailable) return null;

  const headCommitSha = status?.headCommitSha ?? item.binding.headCommitSha;
  const fullName =
    repositoryName ??
    status?.repositoryFullName ??
    item.binding.repositoryFullName ??
    `Repository #${item.binding.repositoryId}`;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
      <span className="font-medium text-slate-800">{fullName}</span>
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
        {loading ? "checking…" : statusLabel(status)}
      </span>
      {shouldShowRepositoryConnect(status) && (
        <Button asChild variant="outline" size="sm" className="h-7">
          <a href="/api/workspace/github/authorize">
            {repositoryConnectLabel(status)}
          </a>
        </Button>
      )}
    </div>
  );
}
