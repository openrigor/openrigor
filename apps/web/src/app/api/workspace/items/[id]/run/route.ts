import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getMethodRun,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const item = await getMethodRun(auth.user.id, id);
    return NextResponse.json({ item, run: item.run });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[workspace] failed to load method run", error);
    return NextResponse.json({ error: "Could not load run" }, { status: 500 });
  }
}
