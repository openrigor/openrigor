import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  listApparatuses: vi.fn(),
  searchTemplates: vi.fn(),
  listResearchedMethods: vi.fn(),
  listSelectedPrivateMethods: vi.fn(),
  githubResearchEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/apparatuses/registry", () => ({
  listApparatuses: harness.listApparatuses,
}));
vi.mock("@/lib/workspace/template-catalog", () => ({
  searchTemplates: harness.searchTemplates,
}));
vi.mock("@/lib/workspace/ledger-source", () => ({
  listResearchedMethods: harness.listResearchedMethods,
}));
vi.mock("@/lib/workspace/store", () => ({
  listSelectedPrivateMethods: harness.listSelectedPrivateMethods,
}));
vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.githubResearchEnabled,
}));

import { GET } from "./route";

describe("GET /api/workspace/catalog", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.listApparatuses.mockReset();
    harness.searchTemplates.mockReset();
    harness.listResearchedMethods.mockReset();
    harness.listSelectedPrivateMethods.mockReset();
    harness.githubResearchEnabled.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.listApparatuses.mockReturnValue([
      {
        id: "ai-assisted-essay",
        name: "AI-assisted essay",
        description: "Constrained dialogic drafting",
      },
    ]);
    harness.searchTemplates.mockReturnValue([]);
    harness.githubResearchEnabled.mockReturnValue(false);
    harness.listSelectedPrivateMethods.mockResolvedValue([]);
  });

  it("includes every selected private Method with pinned catalog provenance", async () => {
    harness.githubResearchEnabled.mockReturnValue(true);
    harness.listSelectedPrivateMethods.mockResolvedValue([
      {
        id: "private-method",
        title: "Private Method",
        description: "Private description",
        repositoryItemId: "wi_repository",
        repositoryId: 101,
        commitSha: "a".repeat(40),
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/workspace/catalog?kind=method")
    );

    expect(await response.json()).toMatchObject({
      kind: "method",
      results: [
        { id: "ai-assisted-essay" },
        {
          id: "private-method",
          title: "Private Method",
          private: true,
          repositoryItemId: "wi_repository",
          commitSha: "a".repeat(40),
        },
      ],
    });
    expect(harness.listSelectedPrivateMethods).toHaveBeenCalledWith("user-1");
  });

  it("returns selectable methods without an under-construction status", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/workspace/catalog?kind=method")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "method",
      results: [
        {
          id: "ai-assisted-essay",
          title: "AI-assisted essay",
          description: "Constrained dialogic drafting",
          disabled: false,
        },
      ],
    });
  });

  it("gets ledger catalog methods from the research source rather than the app mirror", async () => {
    harness.listResearchedMethods.mockResolvedValue([
      {
        id: "ledger-demo-method",
        title: "Ledger demo",
        version: "1.0.0",
        evidenceTemplate: { id: "evidence-template", version: "1.0.0" },
        acceptedEvidenceCount: 12,
      },
    ]);
    const response = await GET(
      new NextRequest("http://localhost/api/workspace/catalog?kind=ledger")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "ledger",
      results: [
        {
          id: "ledger-demo-method",
          kind: "ledger",
          status: "Ledger ready",
          acceptedEvidenceCount: 12,
        },
      ],
    });
  });
});
