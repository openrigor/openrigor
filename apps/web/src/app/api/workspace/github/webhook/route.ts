import { Webhooks } from "@octokit/webhooks";
import { NextRequest, NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import {
  type GithubPushPathScope,
  claimGithubWebhookDelivery,
  deleteGithubResearchCredentials,
  findGithubCredentialOwnersByGithubUserId,
  findGithubCredentialOwnersByInstallationId,
  recordGithubPush,
  releaseGithubWebhookDelivery,
  revokeGithubAuthorization,
  updateGithubInstallation,
  updateGithubInstallationRepositories,
} from "@/lib/workspace/research-repository/credentials";
import {
  listWorkspaceItems,
  updateResearchRepositoryBindingHead,
} from "@/lib/workspace/store";
import { isUsableResearchRepository } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "installation",
  "installation_repositories",
  "github_app_authorization",
  "push",
]);

type WebhookPayload = {
  action?: unknown;
  installation?: { id?: unknown };
  sender?: { id?: unknown };
  repositories?: unknown;
  repositories_added?: unknown;
  repositories_removed?: unknown;
  repository?: { id?: unknown };
  ref?: unknown;
  before?: unknown;
  after?: unknown;
  deleted?: boolean;
  commits?: unknown;
};

const MANAGED_REPOSITORY_PREFIX = "openrigor/";
const MANAGED_BRANCH_REF = "refs/heads/openrigor/workspace";
const GITHUB_PUSH_COMMITS_LIMIT = 2048;
const MAX_PUSH_PATHS = 2000;

function repositoryIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      entry && typeof entry === "object"
        ? (entry as { id?: unknown }).id
        : undefined
    )
    .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0);
}

function installationId(payload: WebhookPayload): number | undefined {
  const value = payload.installation?.id;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function githubUserId(payload: WebhookPayload): number | undefined {
  const value = payload.sender?.id;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function pushPathScope(payload: WebhookPayload): GithubPushPathScope {
  if (!Array.isArray(payload.commits) || payload.commits.length === 0) {
    return "unknown";
  }
  // GitHub includes at most 2048 commits in a push payload. A full page can
  // be truncated, so treat the cap as unknown and advance the binding safely.
  if (payload.commits.length >= GITHUB_PUSH_COMMITS_LIMIT) return "unknown";

  let changedPathCount = 0;
  for (const commit of payload.commits) {
    if (!commit || typeof commit !== "object" || Array.isArray(commit)) {
      return "unknown";
    }
    const candidate = commit as Record<string, unknown>;
    for (const field of ["added", "removed", "modified"]) {
      const paths = candidate[field];
      if (!Array.isArray(paths)) return "unknown";
      for (const path of paths) {
        changedPathCount += 1;
        if (changedPathCount > MAX_PUSH_PATHS) return "unknown";
        if (typeof path !== "string" || path.length === 0) return "unknown";
        if (path.startsWith(MANAGED_REPOSITORY_PREFIX)) return "inside";
      }
    }
  }
  return "outside";
}

function commitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

async function updateResearchRepositoryHeads(
  userId: string,
  payload: WebhookPayload,
  scope: GithubPushPathScope
): Promise<void> {
  const after = payload.after;
  if (
    payload.deleted === true ||
    scope === "outside" ||
    payload.ref !== MANAGED_BRANCH_REF ||
    !commitSha(after)
  ) {
    return;
  }
  const repositoryId = payload.repository?.id;
  if (
    typeof repositoryId !== "number" ||
    !Number.isSafeInteger(repositoryId) ||
    repositoryId <= 0
  ) {
    return;
  }

  const items = await listWorkspaceItems(userId);
  const installation = installationId(payload);
  await Promise.all(
    items
      .filter(
        (item) =>
          isUsableResearchRepository(item) &&
          item.binding.installationId === installation &&
          item.binding.repositoryId === repositoryId
      )
      .map((item) => {
        if (item.binding.headCommitSha !== payload.before) {
          return Promise.resolve();
        }
        return updateResearchRepositoryBindingHead(userId, item.id, after);
      })
  );
}

async function handleDelivery(
  userId: string,
  event: string,
  payload: WebhookPayload,
  id?: number
): Promise<void> {
  if (event === "github_app_authorization") {
    if (payload.action === "revoked") {
      await revokeGithubAuthorization(userId);
    }
    return;
  }
  if (event === "installation") {
    if (id === undefined) return;
    if (payload.action === "deleted") {
      await deleteGithubResearchCredentials(userId);
      return;
    }
    if (Array.isArray(payload.repositories)) {
      await updateGithubInstallation(
        userId,
        id,
        repositoryIds(payload.repositories)
      );
    }
    return;
  }
  if (event === "installation_repositories") {
    if (id === undefined) return;
    await updateGithubInstallationRepositories(
      userId,
      repositoryIds(payload.repositories_added),
      repositoryIds(payload.repositories_removed)
    );
    return;
  }
  const scope = pushPathScope(payload);
  await recordGithubPush(userId, {
    repositoryId:
      typeof payload.repository?.id === "number"
        ? payload.repository.id
        : undefined,
    ref: typeof payload.ref === "string" ? payload.ref : undefined,
    before: typeof payload.before === "string" ? payload.before : undefined,
    after: typeof payload.after === "string" ? payload.after : undefined,
    pathScope: scope,
  });
  await updateResearchRepositoryHeads(userId, payload, scope);
}

export async function POST(request: NextRequest) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const webhookSecret = process.env.GITHUB_RESEARCH_APP_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "GitHub webhook is not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const rawPayload = await request.text();

  let verified = false;
  try {
    verified = await new Webhooks({ secret: webhookSecret }).verify(
      rawPayload,
      signature
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  if (!deliveryId || !event) {
    return NextResponse.json(
      { error: "Missing GitHub webhook headers" },
      { status: 400 }
    );
  }
  if (!HANDLED_EVENTS.has(event)) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawPayload) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }
  if (
    !parsedPayload ||
    typeof parsedPayload !== "object" ||
    Array.isArray(parsedPayload)
  ) {
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }
  const payload = parsedPayload as WebhookPayload;
  const id = installationId(payload);
  if (
    id === undefined &&
    !(
      event === "github_app_authorization" &&
      githubUserId(payload) !== undefined
    )
  ) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  try {
    const owners = new Set<string>();
    if (event === "github_app_authorization") {
      const userId = githubUserId(payload);
      if (userId !== undefined) {
        for (const owner of await findGithubCredentialOwnersByGithubUserId(
          userId
        )) {
          owners.add(owner);
        }
      } else if (id !== undefined) {
        for (const owner of await findGithubCredentialOwnersByInstallationId(
          id
        )) {
          owners.add(owner);
        }
      }
    } else if (id !== undefined) {
      for (const owner of await findGithubCredentialOwnersByInstallationId(
        id
      )) {
        owners.add(owner);
      }
    }
    const ownerList = [...owners];
    let handled = false;
    for (const userId of ownerList) {
      if (!(await claimGithubWebhookDelivery(userId, deliveryId))) continue;
      handled = true;
      try {
        await handleDelivery(userId, event, payload, id);
      } catch (error) {
        await releaseGithubWebhookDelivery(userId, deliveryId);
        throw error;
      }
    }
    return NextResponse.json({
      accepted: true,
      ignored: ownerList.length === 0,
      duplicate: ownerList.length > 0 && !handled,
    });
  } catch (error) {
    console.error(
      "[github-research] webhook handling failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "Could not handle GitHub webhook" },
      { status: 500 }
    );
  }
}
