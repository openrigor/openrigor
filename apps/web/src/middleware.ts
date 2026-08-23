import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // GoTrue SITE_URL can land confirmation codes on /auth/login instead of
  // /auth/confirm. Forward PKCE codes to the confirm exchanger so shared
  // SITE_URL (.com) still completes signup on whatever host received the code.
  const { pathname, searchParams } = request.nextUrl;
  if (
    (pathname === "/auth/login" || pathname === "/auth/login/") &&
    searchParams.has("code")
  ) {
    const confirm = request.nextUrl.clone();
    confirm.pathname = "/auth/confirm";
    return NextResponse.redirect(confirm);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Static assets + media stay public; everything else gets session refresh.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};
