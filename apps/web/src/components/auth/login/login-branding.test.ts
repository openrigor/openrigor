import { describe, expect, it } from "vitest";
import {
  BRAND_PANEL_COLOR,
  COPYRIGHT_NOTICE,
  DOCS_URL,
  LEGAL_OPERATOR_NAME,
  LOGIN_PRICING_SUMMARY,
  PRIVACY_PATH,
  SALMON_DARK,
  SALMON_ON_BRAND,
  SUPPORT_EMAIL,
  TERMS_PATH,
} from "./login-branding";

describe("login-branding", () => {
  it("points docs to the public docs site", () => {
    expect(DOCS_URL).toBe(
      "https://knowledge.evaluchat.org/concepts/overview.html"
    );
  });

  it("uses the product copyright notice (pre-incorporation)", () => {
    expect(COPYRIGHT_NOTICE).toBe("© 2026 evaluchat. All rights reserved.");
  });

  it("matches docs/login brand panel blue", () => {
    expect(BRAND_PANEL_COLOR).toBe("#2c3e56");
  });

  it("exposes public legal paths and support contact", () => {
    expect(PRIVACY_PATH).toBe("/privacy");
    expect(TERMS_PATH).toBe("/terms");
    expect(SUPPORT_EMAIL).toBe("hello@evaluchat.org");
    expect(LEGAL_OPERATOR_NAME).toBe("Abraham van Heerden");
  });

  it("salmon accent classes stay in the AI-highlight family", () => {
    expect(SALMON_ON_BRAND).toContain("#F08080");
    expect(SALMON_DARK).toContain("#c2574b");
  });

  it("summarizes login pricing in one short line", () => {
    expect(LOGIN_PRICING_SUMMARY).toBe(
      "PUBLIC BETA - Open education research workspace; no billing in this release."
    );
  });
});
