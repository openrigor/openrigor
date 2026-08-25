import { describe, expect, it } from "vitest";
import type { WorkspaceItem } from "@/lib/workspace/types";
import { legacyRepositoryRedirectPath } from "@/lib/workspace/repository-settings-routes";

describe("legacy workspace item route", () => {
  it("redirects repository items into settings detail", () => {
    const repositoryItem = {
      id: "repository/one",
      kind: "research_repository",
    } as WorkspaceItem;

    expect(legacyRepositoryRedirectPath(repositoryItem)).toBe(
      "/workspace/settings/repositories/repository%2Fone"
    );
  });

  it("leaves ordinary workspace items on the canvas route", () => {
    const methodItem = { id: "method-one", kind: "method" } as WorkspaceItem;

    expect(legacyRepositoryRedirectPath(methodItem)).toBeUndefined();
  });
});
