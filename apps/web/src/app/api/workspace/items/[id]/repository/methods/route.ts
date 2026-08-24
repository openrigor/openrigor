import { NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getWorkspaceItem,
  updateResearchRepositoryMethodSelection,
} from "@/lib/workspace/store";
import { readGithubResearchCredentials } from "@/lib/workspace/research-repository/credentials";
import {
  REPOSITORY_DISCONNECTED,
  RepositoryAccessError,
  assertRepositoryPrivate,
  loadInstallationRepository,
  repositoryAccessBody,
  repositoryAccessHttpStatus,
} from "@/lib/workspace/research-repository/access";
import {
  discoverPrivateMethods,
  getRepositoryBranchHead,
} from "@/lib/workspace/research-repository/git-adapter";
import type { ResearchRepositoryWorkspaceItem } from "@/lib/workspace/research-repository/method-host-types";
import { repositoryRouteErrorDetails } from "@/lib/workspace/research-repository/route-errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function discover(userId: string, item: ResearchRepositoryWorkspaceItem) {
  const credentials = await readGithubResearchCredentials(userId);
  if (
    !credentials ||
    credentials.installationId !== item.binding.installationId ||
    !credentials.repositoryIds.includes(item.binding.repositoryId)
  ) {
    throw new RepositoryAccessError(
      REPOSITORY_DISCONNECTED,
      "Research repository is disconnected"
    );
  }
  const repository = await loadInstallationRepository(
    item.binding.installationId,
    item.binding.repositoryId
  );
  assertRepositoryPrivate(repository);
  const headCommitSha = await getRepositoryBranchHead(
    item.binding.installationId,
    repository,
    item.binding.branch
  );
  return {
    ...(await discoverPrivateMethods(
      item.binding.installationId,
      repository,
      headCommitSha
    )),
    headCommitSha,
  };
}

async function ownedItem(userId: string, id: string) {
  const item = await getWorkspaceItem(userId, id);
  return item?.kind === "research_repository" ? item : undefined;
}

function routeError(itemId: string, error: unknown) {
  console.error(
    "[github-research] failed to discover private methods",
    repositoryRouteErrorDetails(itemId, error)
  );
  if (error instanceof RepositoryAccessError) {
    return json(
      repositoryAccessBody(error),
      repositoryAccessHttpStatus(error.code)
    );
  }
  return json({ error: "Could not discover private methods" }, 500);
}

export async function GET(_request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return json({ error: "Not found" }, 404);
  }
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  const { id } = await context.params;
  const item = await ownedItem(auth.user.id, id);
  if (!item) return json({ error: "Research repository not found" }, 404);

  try {
    const result = await discover(auth.user.id, item);
    const qualifyingIds = new Set(result.methods.map((method) => method.id));
    return json({
      ...result,
      selectedMethodIds: item.selectedMethodIds.filter((methodId) =>
        qualifyingIds.has(methodId)
      ),
    });
  } catch (error) {
    return routeError(item.id, error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return json({ error: "Not found" }, 404);
  }
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  const { id } = await context.params;
  const item = await ownedItem(auth.user.id, id);
  if (!item) return json({ error: "Research repository not found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const selectedMethodIds =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { selectedMethodIds?: unknown }).selectedMethodIds
      : undefined;
  if (
    !Array.isArray(selectedMethodIds) ||
    selectedMethodIds.length > 1000 ||
    selectedMethodIds.some(
      (methodId) =>
        typeof methodId !== "string" ||
        methodId.length === 0 ||
        methodId.length > 256
    )
  ) {
    return json({ error: "Invalid Method selection" }, 400);
  }

  try {
    const result = await discover(auth.user.id, item);
    const qualifyingIds = new Set(result.methods.map((method) => method.id));
    if (selectedMethodIds.some((methodId) => !qualifyingIds.has(methodId))) {
      return json(
        { error: "Method is not available from this repository" },
        422
      );
    }
    const updated = await updateResearchRepositoryMethodSelection(
      auth.user.id,
      item.id,
      selectedMethodIds
    );
    return json({
      ...result,
      selectedMethodIds: updated.selectedMethodIds,
    });
  } catch (error) {
    return routeError(item.id, error);
  }
}
