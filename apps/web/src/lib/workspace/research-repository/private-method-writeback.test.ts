import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getWorkspaceItem: vi.fn(),
  updateBindingHead: vi.fn(),
  readCredentials: vi.fn(),
  loadRepository: vi.fn(),
  getHead: vi.fn(),
  commitArtifacts: vi.fn(),
  commitProvenance: vi.fn(
    (
      repository: { owner: string; name: string; nameWithOwner?: string },
      branch: string,
      path: string,
      revision: string
    ) => ({
      repository:
        repository.nameWithOwner ?? `${repository.owner}/${repository.name}`,
      branch,
      path,
      revision,
    })
  ),
}));

vi.mock("../store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
  updateResearchRepositoryBindingHead: harness.updateBindingHead,
}));
vi.mock("./credentials", () => ({
  readGithubResearchCredentials: harness.readCredentials,
}));
vi.mock("./github-app", () => ({
  getGithubInstallationRepository: harness.loadRepository,
}));
vi.mock("./git-adapter", () => ({
  getRepositoryBranchHead: harness.getHead,
  commitArtifactBlobs: harness.commitArtifacts,
  repositoryCommitProvenance: harness.commitProvenance,
}));

import {
  REPOSITORY_DISCONNECTED,
  REPOSITORY_READ_ONLY,
  REPOSITORY_UNAVAILABLE,
} from "./access";
import {
  commitPrivateMethodEvidence,
  privateMethodRepositoryAccess,
} from "./private-method-writeback";

const headCommitSha = "a".repeat(40);
const committedSha = "b".repeat(40);
const provenance = {
  repositoryItemId: "wi_repo",
  repositoryId: 101,
  commitSha: "c".repeat(40),
};
const repositoryItem = {
  id: "wi_repo",
  ownerId: "user-1",
  kind: "research_repository",
  status: "active",
  binding: {
    provider: "github",
    repositoryId: 101,
    installationId: 99,
    branch: "openrigor/workspace",
    layoutVersion: "1.0",
    headCommitSha: provenance.commitSha,
    boundAt: "2026-08-24T00:00:00.000Z",
    initialized: true,
  },
};
const credentials = {
  tokens: { accessToken: "server-only-test-token" },
  installationId: 99,
  repositoryIds: [101],
  displayMetadata: { githubUserId: 7, login: "researcher" },
};

describe("private Method repository write-back authorization", () => {
  beforeEach(() => {
    for (const value of Object.values(harness)) value.mockReset();
    harness.getWorkspaceItem.mockResolvedValue(repositoryItem);
    harness.readCredentials.mockResolvedValue(credentials);
    harness.loadRepository.mockResolvedValue({
      owner: "researcher",
      name: "private-methods",
      private: true,
    });
    harness.getHead.mockResolvedValue(headCommitSha);
    harness.commitArtifacts.mockResolvedValue(committedSha);
  });

  it.each([
    ["wrong user", undefined],
    ["unusable binding", undefined],
  ])(
    "rejects a %s before credentials or repository access",
    async (_name, item) => {
      harness.getWorkspaceItem.mockResolvedValue(item);

      await expect(
        privateMethodRepositoryAccess("other-user", provenance)
      ).rejects.toMatchObject({ code: REPOSITORY_UNAVAILABLE });
      expect(harness.getWorkspaceItem).toHaveBeenCalledWith(
        "other-user",
        "wi_repo"
      );
      expect(harness.readCredentials).not.toHaveBeenCalled();
    }
  );

  it("rejects a disconnected binding", async () => {
    harness.readCredentials.mockResolvedValue(undefined);

    await expect(
      privateMethodRepositoryAccess("user-1", provenance)
    ).rejects.toMatchObject({ code: REPOSITORY_DISCONNECTED });
    expect(harness.loadRepository).not.toHaveBeenCalled();
  });

  it("rejects a repository that is no longer private", async () => {
    harness.loadRepository.mockResolvedValue({
      owner: "researcher",
      name: "private-methods",
      private: false,
    });

    await expect(
      privateMethodRepositoryAccess("user-1", provenance)
    ).rejects.toMatchObject({ code: REPOSITORY_READ_ONLY });
    expect(harness.getHead).not.toHaveBeenCalled();
  });

  it("commits evidence under the adopted Method and advances the binding head", async () => {
    const filePath = "methods/essay-review/evidence/2026-08-24T12-00-00Z.en.md";

    await expect(
      commitPrivateMethodEvidence({
        userId: "user-1",
        provenance,
        methodId: "essay-review",
        filePath,
        markdown: "---\ntype: Evidence\n---\n",
      })
    ).resolves.toMatchObject({
      commitSha: committedSha,
      provenance: {
        repository: "researcher/private-methods",
        branch: "openrigor/workspace",
        path: filePath,
        revision: committedSha,
      },
    });

    expect(harness.commitArtifacts).toHaveBeenCalledWith(
      99,
      { owner: "researcher", name: "private-methods", private: true },
      "openrigor/workspace",
      expect.objectContaining({
        baseSha: headCommitSha,
        files: [
          {
            path: filePath,
            content: "---\ntype: Evidence\n---\n",
          },
        ],
      })
    );
    expect(harness.updateBindingHead).toHaveBeenCalledWith(
      "user-1",
      "wi_repo",
      committedSha
    );
  });
});
