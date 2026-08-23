import { describe, expect, it } from "vitest";
import { config } from "./middleware";
import {
  isPublicPath,
  shouldBounceSignedInFromAuth,
  unauthenticatedPageRedirect,
} from "./lib/supabase/middleware";

describe("middleware public routes", () => {
  it("keeps API routes behind the session-aware middleware", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/api/teaching/assignments")).toBe(true);
    expect(matcher.test("/api/tracking/events")).toBe(true);
    expect(matcher.test("/api/admin/dashboard")).toBe(true);
    expect(matcher.test("/admin")).toBe(true);
  });

  it("treats privacy, terms, and auth as unauthenticated public paths", () => {
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/auth/login")).toBe(true);
    expect(isPublicPath("/auth/signup")).toBe(true);
    expect(isPublicPath("/auth/forgot-password")).toBe(true);
    expect(isPublicPath("/auth/reset-password")).toBe(true);
    expect(isPublicPath("/invite/accept")).toBe(false);
    expect(isPublicPath("/teacher")).toBe(false);
    expect(isPublicPath("/student")).toBe(false);
    expect(isPublicPath("/privacy-extra")).toBe(false);
  });

  it("does not bounce signed-in users away from password-reset auth routes", () => {
    expect(shouldBounceSignedInFromAuth("/auth/login")).toBe(true);
    expect(shouldBounceSignedInFromAuth("/auth/signup")).toBe(true);
    expect(shouldBounceSignedInFromAuth("/auth/confirm")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/signout")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/forgot-password")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/reset-password")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/forgot-password/")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/reset-password?code=x")).toBe(
      false
    );
    expect(shouldBounceSignedInFromAuth("/workspace")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/authentic")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/signout-old")).toBe(true);
  });

  it("redirects unauthenticated page shells to login, but not API routes", () => {
    expect(unauthenticatedPageRedirect("/teacher")).toBe("/auth/login");
    expect(unauthenticatedPageRedirect("/student")).toBe("/auth/login");
    expect(unauthenticatedPageRedirect("/owner")).toBe("/auth/login");
    expect(unauthenticatedPageRedirect("/teacher?section=assignments")).toBe(
      "/auth/login"
    );

    expect(unauthenticatedPageRedirect("/")).toBeNull();
    expect(unauthenticatedPageRedirect("/auth/login")).toBeNull();
    expect(unauthenticatedPageRedirect("/auth/forgot-password")).toBeNull();
    expect(unauthenticatedPageRedirect("/auth/reset-password")).toBeNull();
    expect(unauthenticatedPageRedirect("/privacy")).toBeNull();
    expect(unauthenticatedPageRedirect("/terms")).toBeNull();
    expect(unauthenticatedPageRedirect("/invite/accept")).toBe("/auth/login");

    // Data APIs already 401 server-side — do not HTML-redirect them.
    expect(unauthenticatedPageRedirect("/api/teaching/assignments")).toBeNull();
    expect(unauthenticatedPageRedirect("/api/tracking/events")).toBeNull();
    expect(unauthenticatedPageRedirect("/admin")).toBeNull();
  });
});
