import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { resolveMethodTrackingAccess } from "@/lib/workspace/store";
import {
  aggregateTrackingMetrics,
  readTrackingEvents,
} from "@/lib/workspace/method-tracking";
import { isValidTrackingId } from "@/lib/teaching/tracking-validation";

export async function GET(request: NextRequest) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = request.nextUrl.searchParams.get("threadId") || "";
  if (!isValidTrackingId(threadId)) {
    return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  }

  const access = await resolveMethodTrackingAccess(threadId, auth.user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await readTrackingEvents(threadId);
  return NextResponse.json(aggregateTrackingMetrics(threadId, events));
}
