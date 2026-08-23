import { NextResponse } from "next/server";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { isAdminDashboardEnabled, isPlatformAdmin } from "@/lib/admin/guard";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminDashboardEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let auth;
  try {
    auth = await verifyUserAuthenticated();
  } catch (error) {
    console.error("Failed to authenticate admin dashboard request", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPlatformAdmin(auth.user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return NextResponse.json(await getAdminDashboardData());
  } catch (error) {
    console.error("Failed to aggregate admin dashboard", error);
    return NextResponse.json(
      { error: "Failed to load admin dashboard" },
      { status: 500 }
    );
  }
}
