import { describe, expect, it } from "vitest";
import { methodSourcePageUrl, publicMethodPageUrl } from "./method-links";

describe("publicMethodPageUrl", () => {
  it("points at the published research method page", () => {
    expect(publicMethodPageUrl("ai-assisted-essay")).toBe(
      "https://research.openrigor.org/methods/ai-assisted-essay.html"
    );
  });

  it("does not map private Method provenance onto the public catalog", () => {
    expect(
      methodSourcePageUrl({
        id: "owner-method",
        version: "a".repeat(40),
        privateRepository: {
          repositoryItemId: "wi_repo",
          repositoryId: 101,
          commitSha: "a".repeat(40),
        },
      })
    ).toBeUndefined();
  });
});
