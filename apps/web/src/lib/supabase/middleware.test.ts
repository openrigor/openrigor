import { describe, expect, it } from "vitest";
import {
  isE2eBypassRequest,
  isPublicPath,
  shouldBounceSignedInFromAuth,
} from "./middleware";

describe("isE2eBypassRequest", () => {
  it("requires both env gate and cookie (fail closed)", () => {
    expect(isE2eBypassRequest(undefined, "true")).toBe(false);
    expect(isE2eBypassRequest("true", undefined)).toBe(false);
    expect(isE2eBypassRequest("true", "true")).toBe(true);
    expect(isE2eBypassRequest("false", "true")).toBe(false);
    expect(isE2eBypassRequest(undefined, undefined)).toBe(false);
  });
});

describe("password-reset auth routes", () => {
  it("treats forgot/reset password as public paths", () => {
    expect(isPublicPath("/auth/forgot-password")).toBe(true);
    expect(isPublicPath("/auth/reset-password")).toBe(true);
  });

  it("does not bounce signed-in users from forgot/reset password", () => {
    expect(shouldBounceSignedInFromAuth("/auth/forgot-password")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/reset-password")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/login")).toBe(true);
  });

  it("uses path-boundary matching for auth bounce and sign-out exemption", () => {
    expect(shouldBounceSignedInFromAuth("/authentic")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/signout-old")).toBe(true);
    expect(shouldBounceSignedInFromAuth("/auth/signout")).toBe(false);
    expect(shouldBounceSignedInFromAuth("/auth/signout/")).toBe(false);
  });
});
