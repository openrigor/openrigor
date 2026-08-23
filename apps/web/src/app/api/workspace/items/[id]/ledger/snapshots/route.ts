import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  listLedgerSnapshots,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    return NextResponse.json({
      snapshots: await listLedgerSnapshots(auth.user.id, id),
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Workspace item not found" },
        { status: 404 }
      );
    }
    console.error("[workspace] failed to list ledger snapshots", error);
    return NextResponse.json(
      { error: "Could not list ledger snapshots" },
      { status: 500 }
    );
  }
}
