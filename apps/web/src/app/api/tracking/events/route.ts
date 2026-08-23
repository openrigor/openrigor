import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { resolveMethodTrackingAccess } from "@/lib/workspace/store";
import { appendTrackingEvents } from "@/lib/workspace/method-tracking";
import { isValidTrackingId } from "@/lib/teaching/tracking-validation";

export async function POST(request: NextRequest) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const events = Array.isArray(body?.events) ? body.events : [];
  const threadId =
    typeof body?.threadId === "string"
      ? body.threadId
      : typeof events[0]?.threadId === "string"
        ? events[0].threadId
        : "";
  if (!isValidTrackingId(threadId)) {
    return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  }

  const access = await resolveMethodTrackingAccess(threadId, auth.user.id);
  if (!access.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await appendTrackingEvents(threadId, events);
  return NextResponse.json({ ok: true });
}
