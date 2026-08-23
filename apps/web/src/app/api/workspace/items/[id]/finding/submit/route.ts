import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  FindingValidationError,
  validateFindingSubmission,
} from "@/lib/workspace/finding-validation";
import { getWorkspaceItem } from "@/lib/workspace/store";
import { isFindingStarterTemplate } from "@/lib/workspace/template-catalog";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item) {
    return NextResponse.json(
      { error: "Workspace item not found" },
      { status: 404 }
    );
  }
  if (
    item.kind !== "markdown_template" ||
    !isFindingStarterTemplate(item.source.templateId)
  ) {
    return NextResponse.json(
      { error: "Not a Finding starter item" },
      { status: 400 }
    );
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
  const markdown =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).markdown
      : undefined;
  if (typeof markdown !== "string") {
    return NextResponse.json(
      { error: "Finding markdown is required" },
      { status: 400 }
    );
  }

  try {
    await validateFindingSubmission(markdown);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FindingValidationError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    console.error("[workspace] failed to validate finding", error);
    return NextResponse.json(
      { error: "Could not validate finding" },
      { status: 502 }
    );
  }
}
