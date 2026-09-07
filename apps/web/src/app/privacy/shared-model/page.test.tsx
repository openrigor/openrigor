import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SharedModelPrivacyNoticePage from "./page";

describe("/privacy/shared-model", () => {
  it("renders the public versioned notice route", async () => {
    const html = renderToStaticMarkup(await SharedModelPrivacyNoticePage());

    expect(html).toContain("Shared-model privacy notice");
    expect(html).toContain("Version:");
    expect(html).toContain("Effective date:");
    expect(html).toMatch(/best.?effort availability/i);
    expect(html).toMatch(/hosted or processed in China/i);
  });
});
