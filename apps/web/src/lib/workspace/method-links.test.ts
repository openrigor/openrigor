import { describe, expect, it } from "vitest";
import { publicMethodPageUrl } from "./method-links";

describe("publicMethodPageUrl", () => {
  it("points at the published research method page", () => {
    expect(publicMethodPageUrl("ai-assisted-essay")).toBe(
      "https://research.evaluchat.org/methods/ai-assisted-essay.html"
    );
  });
});
