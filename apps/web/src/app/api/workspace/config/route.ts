import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { getTemplateCatalog } from "@/lib/workspace/template-catalog";

export async function GET() {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    assistantId: process.env.EVALUCHAT_WORKSPACE_ASSISTANT_ID || "agent",
    catalogRevision: getTemplateCatalog().catalogRevision,
  });
}
