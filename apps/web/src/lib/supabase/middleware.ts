import {
  SESSION_MARKER_COOKIE,
  sharedAuthCookieDomain,
} from "@/lib/teaching/home-routing";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

/**
 * Paths that must load without a Supabase session (marketing, legal, and
 * authentication). Workspace pages and APIs are session-protected.
 */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return (
    path === "/" ||
    path === "/privacy" ||
    path === "/terms" ||
    path.startsWith("/auth") ||
    path === "/api/methods"
  );
}

/**
 * Signed-in users on most /auth* pages bounce to /workspace. Confirm, password
 * reset, and sign-out must remain reachable (stale links, recovery tokens).
 */
export function shouldBounceSignedInFromAuth(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (path !== "/auth" && !path.startsWith("/auth/")) return false;
  if (path === "/auth/signout" || path.startsWith("/auth/signout/"))
    return false;
  if (
    path === "/auth/confirm" ||
    path === "/auth/forgot-password" ||
    path === "/auth/reset-password"
  ) {
    return false;
  }
  return true;
}

/**
 * Unauthenticated PAGE shells redirect to login. API routes are left alone so
 * handlers can return 401 JSON (do not HTML-redirect `/api/*`).
 */
export function unauthenticatedPageRedirect(
  pathname: string
): "/auth/login" | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (path.startsWith("/api/")) return null;
  // Let the route-level admin guard decide between a disabled 404 and the
  // normal auth redirect. This keeps the disabled surface inert even before
  // authentication is available to the middleware.
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  if (isPublicPath(path)) return null;
  return "/auth/login";
}

/** Prefer public Host / X-Forwarded-Host — nextUrl.hostname is often 127.0.0.1 behind the proxy. */
function requestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    return forwarded.split(",")[0].trim().split(":")[0].toLowerCase();
  }
  const host = request.headers.get("host");
  if (host) {
    return host.split(":")[0].toLowerCase();
  }
  return request.nextUrl.hostname.toLowerCase();
}

function applySessionMarker(
  response: NextResponse,
  request: NextRequest,
  authed: boolean
): NextResponse {
  const hostname = requestHostname(request);
  const domain = sharedAuthCookieDomain(hostname);
  const secure = request.nextUrl.protocol === "https:" || Boolean(domain);
  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure,
    ...(domain ? { domain } : {}),
  };
  if (authed) {
    response.cookies.set(SESSION_MARKER_COOKIE, "1", {
      ...base,
      maxAge: 60 * 60 * 24 * 400,
    });
  } else {
    response.cookies.set(SESSION_MARKER_COOKIE, "", {
      ...base,
      maxAge: 0,
    });
  }
  return response;
}

function redirectWithCookies(
  url: URL,
  supabaseResponse: NextResponse,
  request: NextRequest,
  authed: boolean
): NextResponse {
  const redirect = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie); // ResponseCookie carries name, value, and all attributes
  });
  return applySessionMarker(redirect, request, authed);
}

/** E2E bypass requires both server env gate and client cookie (fail closed). */
export function isE2eBypassRequest(
  envMode: string | undefined,
  cookieValue: string | undefined
): boolean {
  return envMode === "true" && cookieValue === "true";
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const removedPagePrefixes = [
    "/teacher",
    "/student",
    "/owner",
    "/researcher",
    "/invite",
  ];
  const removedApiPrefixes = [
    "/api/teacher",
    "/api/teaching",
    "/api/tracking",
    "/api/admin/invitations",
    "/api/admin/teachers",
    "/api/invitations",
  ];

  if (removedApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.json(
      { error: "This product surface is no longer available" },
      { status: 410 }
    );
  }

  // E2E test mode: skip Supabase auth check
  if (
    isE2eBypassRequest(
      process.env.E2E_TEST_MODE,
      request.cookies.get("__e2e_test__")?.value
    )
  ) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginRedirect = unauthenticatedPageRedirect(pathname);
    if (loginRedirect) {
      const url = request.nextUrl.clone();
      url.pathname = loginRedirect;
      url.search = "";
      return redirectWithCookies(url, supabaseResponse, request, false);
    }
    return applySessionMarker(supabaseResponse, request, false);
  }

  if (
    removedPagePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse, request, true);
  }

  // /auth/confirm and password-reset routes handle tokens themselves (including
  // for signed-in users on stale links). Do not bounce them away first.
  if (shouldBounceSignedInFromAuth(pathname)) {
    const targetPath = "/workspace";
    const url = new URL(targetPath, request.url);
    return redirectWithCookies(url, supabaseResponse, request, true);
  }

  return applySessionMarker(supabaseResponse, request, true);
}
