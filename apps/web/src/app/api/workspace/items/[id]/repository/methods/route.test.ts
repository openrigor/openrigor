import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  updateResearchRepositoryMethodSelection: vi.fn(),
  readGithubResearchCredentials: vi.fn(),
  loadInstallationRepository: vi.fn(),
  assertRepositoryPrivate: vi.fn(),
  getRepositoryBranchHead: vi.fn(),
  discoverPrivateMethods: vi.fn(),
}));

vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
  updateResearchRepositoryMethodSelection:
    harness.updateResearchRepositoryMethodSelection,
}));
vi.mock("@/lib/workspace/research-repository/credentials", () => ({
  readGithubResearchCredentials: harness.readGithubResearchCredentials,
}));
vi.mock(
  "@/lib/workspace/research-repository/access",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/workspace/research-repository/access")
      >();
    return {
      ...actual,
      loadInstallationRepository: harness.loadInstallationRepository,
      assertRepositoryPrivate: harness.assertRepositoryPrivate,
    };
  }
);
vi.mock("@/lib/workspace/research-repository/git-adapter", () => ({
  getRepositoryBranchHead: harness.getRepositoryBranchHead,
  discoverPrivateMethods: harness.discoverPrivateMethods,
}));

import { GET, PATCH } from "./route";

const headCommitSha = "a".repeat(40);
const repository = {
  id: 101,
  owner: "octocat",
  name: "private",
  private: true,
};
const item = {
  id: "wi_repository",
  ownerId: "user-1",
  kind: "research_repository",
  selectedMethodIds: ["method-a", "removed-method"],
  binding: {
    installationId: 99,
    repositoryId: 101,
    branch: "openrigor/workspace",
  },
};
const methods = [
  { id: "method-a", title: "Method A" },
  { id: "method-b", title: "Method B" },
];
const context = (id = item.id) => ({ params: Promise.resolve({ id }) });

describe("private repository Method discovery route", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) method.mockReset();
    harness.enabled.mockReturnValue(true);
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
    });
    harness.loadInstallationRepository.mockResolvedValue(repository);
    harness.getRepositoryBranchHead.mockResolvedValue(headCommitSha);
    harness.discoverPrivateMethods.mockResolvedValue({
      initialization: { initialized: true },
      methods,
    });
    harness.updateResearchRepositoryMethodSelection.mockResolvedValue({
      ...item,
      selectedMethodIds: ["method-a", "method-b"],
    });
  });

  it("returns only qualifying methods and filters stale selections", async () => {
    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      initialization: { initialized: true },
      methods,
      headCommitSha,
      selectedMethodIds: ["method-a"],
    });
    expect(harness.discoverPrivateMethods).toHaveBeenCalledWith(
      99,
      repository,
      headCommitSha
    );
  });

  it("persists a selection only after server-side discovery validation", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selectedMethodIds: ["method-a", "method-b"] }),
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(
      harness.updateResearchRepositoryMethodSelection
    ).toHaveBeenCalledWith("user-1", item.id, ["method-a", "method-b"]);
  });

  it("rejects a non-conforming or disappeared Method", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selectedMethodIds: ["hidden-method"] }),
      }),
      context()
    );

    expect(response.status).toBe(422);
    expect(
      harness.updateResearchRepositoryMethodSelection
    ).not.toHaveBeenCalled();
  });

  it("rejects a disconnected binding server-side", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 100,
      repositoryIds: [101],
    });

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("REPOSITORY_DISCONNECTED");
    expect(harness.loadInstallationRepository).not.toHaveBeenCalled();
  });

  it("returns 404 when the authenticated user does not own the binding", async () => {
    harness.getWorkspaceItem.mockResolvedValue(undefined);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(404);
    expect(harness.readGithubResearchCredentials).not.toHaveBeenCalled();
  });
});
