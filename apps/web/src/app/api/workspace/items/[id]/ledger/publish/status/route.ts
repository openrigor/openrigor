import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { getLedgerPullRequestStatus } from "@/lib/workspace/evidence-github";
import {
  getLedgerSnapshotItem,
  updateLedgerSnapshotPublication,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Reconcile a draft publication only after GitHub confirms that this exact PR
 * merged. There is deliberately no local "mark merged" mutation.
 */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const item = await getLedgerSnapshotItem(auth.user.id, id);
    const publication = item.publication;
    if (!publication?.pullRequestNumber) {
      return NextResponse.json(
        { error: "Ledger snapshot has no publication pull request" },
        { status: 409 }
      );
    }
    const actual = await getLedgerPullRequestStatus(
      publication.pullRequestNumber
    );
    if (!actual.merged) {
      return NextResponse.json({ publication, actual });
    }
    const merged = {
      ...publication,
      status: "merged" as const,
      mergedAt: actual.mergedAt || new Date().toISOString(),
    };
    await updateLedgerSnapshotPublication(auth.user.id, id, {
      publication: merged,
    });
    return NextResponse.json({ publication: merged, actual });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Ledger snapshot not found" },
        { status: 404 }
      );
    }
    console.error("[workspace] failed to refresh ledger publication", error);
    return NextResponse.json(
      { error: "Could not refresh ledger publication status" },
      { status: 502 }
    );
  }
}
