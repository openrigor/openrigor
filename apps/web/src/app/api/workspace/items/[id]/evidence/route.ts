import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  createEvidenceThread,
  EvidenceRunNotConcludedError,
  EvidenceUnavailableError,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const result = await createEvidenceThread(auth.user.id, id);
    return NextResponse.json({
      threadId: result.threadId,
      status:
        result.item.evidenceThreads?.find(
          (reference) => reference.threadId === result.threadId
        )?.status ?? "draft",
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Evidence is not available for this workspace item" },
        { status: 404 }
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
    if (error instanceof WorkspaceThreadOwnershipError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[workspace] failed to create evidence thread", error);
    return NextResponse.json(
      { error: "Could not create evidence thread" },
      { status: 500 }
    );
  }
}
