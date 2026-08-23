import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getMethodParticipantReview,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

type RouteContext = {
  params: Promise<{ id: string; participantItemId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, participantItemId } = await context.params;
  try {
    const review = await getMethodParticipantReview(
      auth.user.id,
      id,
      participantItemId
    );
    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[workspace] failed to load method review", error);
    return NextResponse.json(
      { error: "Could not load review" },
      { status: 500 }
    );
  }
}
