import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  getResearchRepositoryStatus: vi.fn(),
  replaceResearchRepositoryBinding: vi.fn(),
  ResearchRepositoryBindingError: class ResearchRepositoryBindingError extends Error {
    constructor(
      public readonly code: string,
      message: string
    ) {
      super(message);
    }
  },
  WorkspaceItemNotFoundError: class WorkspaceItemNotFoundError extends Error {},
}));

vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
  getResearchRepositoryStatus: harness.getResearchRepositoryStatus,
  replaceResearchRepositoryBinding: harness.replaceResearchRepositoryBinding,
  ResearchRepositoryBindingError: harness.ResearchRepositoryBindingError,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
}));

import { GET, POST, PUT } from "./route";

const context = (id = "wi_repository") => ({
  params: Promise.resolve({ id }),
});

describe("GET /api/workspace/items/[id]/repository", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) {
      if (vi.isMockFunction(method)) method.mockReset();
    }
    harness.enabled.mockReturnValue(true);
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.replaceResearchRepositoryBinding.mockReset();
  });

  it("returns 404 while the feature flag is off", async () => {
    harness.enabled.mockReturnValue(false);

    expect((await GET(new Request("http://localhost"), context())).status).toBe(
      404
    );
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("returns 401 without an authenticated user", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    expect((await GET(new Request("http://localhost"), context())).status).toBe(
      401
    );
  });

  it("returns 404 for a missing or different item kind", async () => {
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_repository",
      kind: "markdown_template",
    });

    expect((await GET(new Request("http://localhost"), context())).status).toBe(
      404
    );
  });

  it("returns the current repository status", async () => {
    const item = { id: "wi_repository", kind: "research_repository" };
    const status = {
      workspaceId: "wi_repository",
      repositoryId: 101,
      state: "ready",
    };
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.getResearchRepositoryStatus.mockResolvedValue(status);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(harness.getResearchRepositoryStatus).toHaveBeenCalledWith(
      "user-1",
      item
    );
  });

  it("surfaces a deleted repository as REPOSITORY_UNAVAILABLE", async () => {
    const item = { id: "wi_repository", kind: "research_repository" };
    const status = {
      workspaceId: "wi_repository",
      repositoryId: 101,
      state: "blocked",
      reason: "repository_deleted",
    };
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.getResearchRepositoryStatus.mockResolvedValue(status);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "REPOSITORY_UNAVAILABLE",
      status,
    });
  });

  it("rejects a public repository at bind time", async () => {
    harness.replaceResearchRepositoryBinding.mockRejectedValue(
      new harness.ResearchRepositoryBindingError(
        "repository_public",
        "Research repositories must be private"
      )
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ installationId: 99, repositoryId: 101 }),
        headers: { "Content-Type": "application/json" },
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Research repositories must be private",
      code: "repository_public",
    });
  });

  it("uses the atomic replace binding operation for an existing item", async () => {
    const item = {
      id: "wi_repository",
      kind: "research_repository",
      binding: {
        repositoryId: 202,
        installationId: 99,
        branch: "openrigor/workspace",
        headCommitSha: "a".repeat(40),
      },
    };
    harness.replaceResearchRepositoryBinding.mockResolvedValue(item);

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ installationId: 99, repositoryId: 202 }),
        headers: { "Content-Type": "application/json" },
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item });
    expect(harness.replaceResearchRepositoryBinding).toHaveBeenCalledWith(
      "user-1",
      "wi_repository",
      { installationId: 99, repositoryId: 202 }
    );
  });
});
