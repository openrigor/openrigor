import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
  readGithubResearchCredentials: vi.fn(),
  getGithubInstallationRepository: vi.fn(),
  listGithubInstallationRepositories: vi.fn(),
  updateGithubInstallationRepositories: vi.fn(),
}));

vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/research-repository/credentials", () => ({
  readGithubResearchCredentials: harness.readGithubResearchCredentials,
  updateGithubInstallationRepositories:
    harness.updateGithubInstallationRepositories,
}));
vi.mock("@/lib/workspace/research-repository/github-app", () => ({
  getGithubInstallationRepository: harness.getGithubInstallationRepository,
  listGithubInstallationRepositories:
    harness.listGithubInstallationRepositories,
}));

import { GET } from "./route";

describe("GET /api/workspace/github/repositories", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) method.mockReset();
    harness.enabled.mockReturnValue(true);
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.updateGithubInstallationRepositories.mockResolvedValue(undefined);
  });

  it("returns 404 while the feature flag is off", async () => {
    harness.enabled.mockReturnValue(false);

    expect((await GET()).status).toBe(404);
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });

  it("returns a connect state when credentials are absent", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue(null);

    expect(await (await GET()).json()).toEqual({
      connected: false,
      repositories: [],
    });
  });

  it("lists live installation repositories on success", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
      displayMetadata: {
        login: "octocat",
        repositories: [
          { id: 101, nameWithOwner: "octocat/private", private: true },
        ],
      },
    });
    harness.listGithubInstallationRepositories.mockResolvedValue([
      { id: 101, nameWithOwner: "octocat/private", private: true },
      { id: 202, nameWithOwner: "octocat/public", private: false },
      { id: 404, nameWithOwner: "octocat/new-private", private: true },
    ]);

    expect(await (await GET()).json()).toEqual({
      connected: true,
      installationId: 99,
      login: "octocat",
      repositories: [
        { id: 101, nameWithOwner: "octocat/private" },
        { id: 202, nameWithOwner: "octocat/public" },
        { id: 404, nameWithOwner: "octocat/new-private" },
      ],
    });
    expect(harness.listGithubInstallationRepositories).toHaveBeenCalledWith(99);
    expect(harness.updateGithubInstallationRepositories).toHaveBeenCalledWith(
      "user-1",
      [404],
      []
    );
  });

  it("reconciles the snapshot with private live entries only", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101, 303],
      displayMetadata: {
        login: "octocat",
        repositories: [
          { id: 101, nameWithOwner: "octocat/private", private: true },
          { id: 303, nameWithOwner: "octocat/gone", private: true },
        ],
      },
    });
    harness.listGithubInstallationRepositories.mockResolvedValue([
      { id: 101, nameWithOwner: "octocat/private", private: true },
      { id: 202, nameWithOwner: "octocat/public", private: false },
    ]);

    await GET();

    expect(harness.updateGithubInstallationRepositories).toHaveBeenCalledWith(
      "user-1",
      [],
      [303]
    );
  });

  it("falls back to the stored snapshot when the live listing throws", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101, 303],
      displayMetadata: {
        login: "octocat",
        repositories: [
          { id: 101, nameWithOwner: "octocat/private", private: true },
          { id: 202, nameWithOwner: "octocat/removed", private: true },
          { id: 303, nameWithOwner: "octocat/public", private: false },
        ],
      },
    });
    harness.listGithubInstallationRepositories.mockRejectedValue(
      new Error("GitHub unavailable")
    );

    expect(await (await GET()).json()).toEqual({
      connected: true,
      installationId: 99,
      login: "octocat",
      repositories: [{ id: 101, nameWithOwner: "octocat/private" }],
    });
    expect(harness.updateGithubInstallationRepositories).not.toHaveBeenCalled();
  });

  it("still returns the live list when snapshot reconciliation fails", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
      displayMetadata: { login: "octocat", repositories: [] },
    });
    harness.listGithubInstallationRepositories.mockResolvedValue([
      { id: 101, nameWithOwner: "octocat/private", private: true },
    ]);
    harness.updateGithubInstallationRepositories.mockRejectedValue(
      new Error("store unavailable")
    );

    expect(await (await GET()).json()).toEqual({
      connected: true,
      installationId: 99,
      login: "octocat",
      repositories: [{ id: 101, nameWithOwner: "octocat/private" }],
    });
  });

  it("resolves privacy for legacy display entries without a private field", async () => {
    harness.readGithubResearchCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
      displayMetadata: {
        login: "octocat",
        repositories: [{ id: 101, nameWithOwner: "octocat/private" }],
      },
    });
    harness.listGithubInstallationRepositories.mockRejectedValue(
      new Error("GitHub unavailable")
    );
    harness.getGithubInstallationRepository.mockResolvedValue({
      id: 101,
      name: "private",
      nameWithOwner: "octocat/private",
      owner: "octocat",
      private: true,
      defaultBranch: "main",
    });

    expect(await (await GET()).json()).toMatchObject({
      connected: true,
      repositories: [{ id: 101, nameWithOwner: "octocat/private" }],
    });
    expect(harness.getGithubInstallationRepository).toHaveBeenCalledWith(
      99,
      101
    );
  });
});
