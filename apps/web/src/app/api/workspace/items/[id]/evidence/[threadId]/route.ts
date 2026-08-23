import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  EvidenceRunNotConcludedError,
  EvidenceUnavailableError,
  getEvidenceSnapshot,
  WorkspaceItemNotFoundError,
  WorkspaceEvidenceThreadMissingError,
  WorkspaceThreadOwnershipError,
  updateEvidenceThreadReference,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string; threadId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId } = await context.params;
  try {
    const result = await getEvidenceSnapshot(auth.user.id, id, threadId);
    return NextResponse.json({
      threadId,
      status: result.reference.status,
      pullRequestUrl: result.reference.pullRequestUrl,
      pullRequestNumber: result.reference.pullRequestNumber,
      template: {
        id: result.snapshot.templateId,
        version: result.snapshot.templateVersion,
        defaultStage: result.snapshot.defaultStage,
        sourcePath: result.snapshot.sourcePath,
        fields: result.snapshot.fields,
        layoutMarkdown: result.snapshot.layoutMarkdown,
        guidance: result.snapshot.guidance,
      },
      fields: result.snapshot.fields,
      layoutMarkdown: result.snapshot.layoutMarkdown,
      guidance: result.snapshot.guidance,
      frozenValues: result.snapshot.frozenValues,
      values: result.reference.values,
      method: {
        id: result.snapshot.methodId,
        version: result.snapshot.methodVersion,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 }
      );
    }
    if (error instanceof WorkspaceThreadOwnershipError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof WorkspaceEvidenceThreadMissingError) {
      return NextResponse.json(
        {
          error:
            "Evidence thread no longer exists; create a new evidence contribution",
        },
        { status: 410 }
      );
    }
    if (error instanceof EvidenceRunNotConcludedError) {
      return NextResponse.json(
        { error: "Evidence requires a concluded method run" },
        { status: 409 }
      );
    }
    if (error instanceof EvidenceUnavailableError) {
      return NextResponse.json(
        { error: "Evidence is not available for this method" },
        { status: 404 }
      );
    }
    console.error("[workspace] failed to load evidence snapshot", error);
    return NextResponse.json(
      { error: "Could not load evidence snapshot" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, threadId } = await context.params;
  let body: { values?: unknown };
  try {
    body = (await request.json()) as { values?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  try {
    if (
      !body.values ||
      typeof body.values !== "object" ||
      Array.isArray(body.values)
    ) {
      return NextResponse.json(
        { error: "Invalid evidence values" },
        { status: 400 }
      );
    }
    await updateEvidenceThreadReference(auth.user.id, id, threadId, {
      values: body.values as Record<string, string>,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 }
      );
    }
    if (error instanceof WorkspaceThreadOwnershipError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof WorkspaceEvidenceThreadMissingError) {
      return NextResponse.json(
        {
          error:
            "Evidence thread no longer exists; create a new evidence contribution",
        },
        { status: 410 }
      );
    }
    console.error("[workspace] failed to save evidence values", error);
    return NextResponse.json(
      { error: "Could not save evidence values" },
      { status: 500 }
    );
  }
}
