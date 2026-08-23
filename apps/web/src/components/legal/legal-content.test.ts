import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyPolicyContent } from "./privacy-policy-content";
import { TermsOfServiceContent } from "./terms-of-service-content";

describe("legal page content fingerprints", () => {
  it("privacy names the operator, beta payment boundary, and AI disclosure", () => {
    const html = renderToStaticMarkup(
      React.createElement(PrivacyPolicyContent)
    );
    expect(html).toContain("Abraham van Heerden");
    expect(html).toContain("does not collect payment");
    expect(html).toMatch(/train/i);
    expect(html).toContain("hello@evaluchat.org");
    expect(html).toMatch(/Cookies/i);
    expect(html).toMatch(/advertising or cross-site tracking/i);
  });

  it("terms cover beta access and AI training cross-link", () => {
    const html = renderToStaticMarkup(
      React.createElement(TermsOfServiceContent)
    );
    expect(html).toContain("Abraham van Heerden");
    expect(html).toMatch(/public beta/i);
    expect(html).toContain("/privacy");
    expect(html).toMatch(/train/i);
    expect(html).toContain("hello@evaluchat.org");
  });
});
