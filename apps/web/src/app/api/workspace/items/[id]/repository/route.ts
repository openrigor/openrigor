import { NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getResearchRepositoryStatus,
  getWorkspaceItem,
  replaceResearchRepositoryBinding,
  ResearchRepositoryBindingError,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function bindingRequestBody(
  value: unknown
): { repositoryId: number; installationId: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const body = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(body.repositoryId) ||
    Number(body.repositoryId) <= 0 ||
    !Number.isSafeInteger(body.installationId) ||
    Number(body.installationId) <= 0
  ) {
    return undefined;
  }
  return {
    repositoryId: body.repositoryId as number,
    installationId: body.installationId as number,
  };
}

async function replaceBinding(request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  const binding = bindingRequestBody(body);
  if (!binding) {
    return NextResponse.json(
      { error: "Invalid repository binding" },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  try {
    const item = await replaceResearchRepositoryBinding(
      auth.user.id,
      id,
      binding
    );
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof ResearchRepositoryBindingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Research repository not found" },
        { status: 404 }
      );
    }
    console.error(
      "[github-research] failed to replace repository binding",
      error
    );
    return NextResponse.json(
      { error: "Could not replace research repository binding" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return replaceBinding(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return replaceBinding(request, context);
}

export async function GET(_request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item || item.kind !== "research_repository") {
    return NextResponse.json(
      { error: "Research repository not found" },
      { status: 404 }
    );
  }

  try {
    const status = await getResearchRepositoryStatus(auth.user.id, item);
    const body = {
      status,
      ...(status.readonlyReason
        ? { readonlyReason: status.readonlyReason }
        : {}),
    };
    if (status.reason === "repository_deleted") {
      return NextResponse.json(
        {
          ...body,
          error: "REPOSITORY_UNAVAILABLE",
          message: "Repository unavailable (deleted or access removed).",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(body);
  } catch (error) {
    console.error("[github-research] failed to check repository", error);
    return NextResponse.json(
      { error: "Could not check research repository" },
      { status: 500 }
    );
  }
}
