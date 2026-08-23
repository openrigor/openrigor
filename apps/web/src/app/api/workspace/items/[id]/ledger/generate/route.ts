import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  createLedgerSnapshotItem,
  LedgerConfigValidationError,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

function candidateFrom(body: unknown): unknown {
  if (body && typeof body === "object" && "config" in body) {
    return (body as { config: unknown }).config;
  }
  return body && typeof body === "object" && "methodId" in body
    ? body
    : undefined;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  try {
    const { id } = await context.params;
    const result = await createLedgerSnapshotItem(
      auth.user.id,
      id,
      candidateFrom(body)
    );
    return NextResponse.json(
      { item: result.item, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Workspace item not found" },
        { status: 404 }
      );
    }
    if (error instanceof LedgerConfigValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[workspace] failed to generate ledger snapshot", error);
    return NextResponse.json(
      { error: "Could not generate ledger snapshot" },
      { status: 500 }
    );
  }
}
