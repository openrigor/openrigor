import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  request: vi.fn(),
  getHead: vi.fn(),
  createOctokit: vi.fn(),
}));

vi.mock("./github-app", () => ({
  createGithubInstallationOctokit: harness.createOctokit,
  getGithubRepositoryBranchHead: harness.getHead,
}));

import { createHash } from "node:crypto";
import {
  commitArtifactBlobs,
  GITHUB_RESEARCH_APP_COMMITTER,
  listRepositoryArtifactRefs,
  probeMethodHostInitialization,
  repositoryCommitProvenance,
  StaleRepositoryError,
} from "./git-adapter";
import { RepositoryLayoutError } from "./layout";

const repository = { owner: "octocat", name: "private" };
const baseSha = "a".repeat(40);
const baseTreeSha = "b".repeat(40);
const blobSha = "c".repeat(40);
const treeSha = "d".repeat(40);
const commitSha = "e".repeat(40);

describe("GitHub repository Git Data adapter", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) method.mockReset();
    harness.createOctokit.mockReturnValue({ request: harness.request });
    harness.getHead.mockResolvedValue(baseSha);
  });

  it("retains full repository commit provenance", () => {
    expect(
      repositoryCommitProvenance(
        {
          owner: "octocat",
          name: "private",
          fullName: "octocat/private",
        },
        "openrigor/workspace",
        "methods/example/example.en.md",
        commitSha
      )
    ).toEqual({
      repository: "octocat/private",
      branch: "openrigor/workspace",
      path: "methods/example/example.en.md",
      revision: commitSha,
    });
  });

  it.each([
    {
      name: "initialized",
      tree: [
        { path: "methods", mode: "040000", type: "tree", sha: treeSha },
        {
          path: "methods/index.md",
          mode: "100644",
          type: "blob",
          sha: blobSha,
        },
      ],
      expected: { initialized: true },
    },
    {
      name: "missing methods directory",
      tree: [{ path: "README.md", mode: "100644", type: "blob", sha: blobSha }],
      expected: {
        initialized: false,
        initializationFailureReason: "methods_directory_missing",
      },
    },
    {
      name: "missing methods index",
      tree: [
        { path: "methods", mode: "040000", type: "tree", sha: treeSha },
        {
          path: "methods/example/example.en.md",
          mode: "100644",
          type: "blob",
          sha: blobSha,
        },
      ],
      expected: {
        initialized: false,
        initializationFailureReason: "methods_index_missing",
      },
    },
  ])("probes Method-host initialization: $name", async ({ tree, expected }) => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "GET /repos/{owner}/{repo}/git/trees/{tree_sha}") {
        return { data: { tree } };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      probeMethodHostInitialization(99, repository, baseSha)
    ).resolves.toEqual(expected);
    expect(harness.request).toHaveBeenCalledTimes(2);
  });

  it("creates blob, tree, commit, and a non-forced CAS ref update", async () => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/blobs") {
        return { data: { sha: blobSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/trees") {
        return { data: { sha: treeSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/commits") {
        return { data: { sha: commitSha } };
      }
      if (route === "PATCH /repos/{owner}/{repo}/git/refs/{ref}") {
        return { data: {} };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      commitArtifactBlobs(99, repository, "openrigor/workspace", {
        authorUser: { name: "Researcher", email: "r@example.test" },
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).resolves.toBe(commitSha);

    expect(harness.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/trees",
      expect.objectContaining({
        base_tree: baseTreeSha,
        tree: [
          { path: "index.md", mode: "100644", type: "blob", sha: blobSha },
        ],
      })
    );
    expect(harness.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/commits",
      expect.objectContaining({
        tree: treeSha,
        parents: [baseSha],
        author: { name: "Researcher", email: "r@example.test" },
        committer: GITHUB_RESEARCH_APP_COMMITTER,
      })
    );
    expect(GITHUB_RESEARCH_APP_COMMITTER).toEqual({
      name: "OpenRigor GitHub App",
      email: "github-app@openrigor.org",
    });
    expect(harness.request).toHaveBeenCalledWith(
      "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
      expect.objectContaining({
        ref: "heads/openrigor/workspace",
        sha: commitSha,
        force: false,
      })
    );
  });

  it("uses the GitHub Contents API for an empty repository first commit", async () => {
    harness.getHead.mockRejectedValue(
      Object.assign(new Error("Not found"), { status: 404 })
    );
    harness.request.mockImplementation(async (route: string) => {
      if (route === "PUT /repos/{owner}/{repo}/contents/{path}") {
        return { data: { commit: { sha: commitSha } } };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      commitArtifactBlobs(99, repository, "main", {
        message: "Initialize Method host",
        baseSha: null,
        files: [{ path: "index.md", content: "# Methods\n" }],
      })
    ).resolves.toBe(commitSha);
    expect(harness.request).toHaveBeenCalledWith(
      "PUT /repos/{owner}/{repo}/contents/{path}",
      expect.objectContaining({
        path: "index.md",
        branch: "main",
        content: Buffer.from("# Methods\n").toString("base64"),
      })
    );
    expect(harness.request).not.toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/refs",
      expect.anything()
    );
  });

  it("uses the configured app identity for both author and committer when none is supplied", async () => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/blobs") {
        return { data: { sha: blobSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/trees") {
        return { data: { sha: treeSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/commits") {
        return { data: { sha: commitSha } };
      }
      if (route === "PATCH /repos/{owner}/{repo}/git/refs/{ref}") {
        return { data: {} };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await commitArtifactBlobs(99, repository, "openrigor/workspace", {
      message: "Update index",
      baseSha,
      files: [{ path: "index.md", content: "# Updated\n" }],
    });

    expect(harness.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/commits",
      expect.objectContaining({
        author: GITHUB_RESEARCH_APP_COMMITTER,
        committer: GITHUB_RESEARCH_APP_COMMITTER,
      })
    );
    expect(JSON.stringify(harness.request.mock.calls)).not.toContain("Valery");
    expect(JSON.stringify(harness.request.mock.calls)).not.toContain(
      "RIGEL_GITHUB_TOKEN"
    );
  });

  it("rejects a stale base before creating blobs", async () => {
    const currentHead = "f".repeat(40);
    harness.getHead.mockResolvedValue(currentHead);

    await expect(
      commitArtifactBlobs(99, repository, "openrigor/workspace", {
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).rejects.toMatchObject<Partial<StaleRepositoryError>>({
      currentHeadCommitSha: currentHead,
    });
    expect(harness.request).not.toHaveBeenCalled();
  });

  it("maps a non-fast-forward 422 to the refreshed current head", async () => {
    const refreshedHead = "f".repeat(40);
    harness.getHead
      .mockResolvedValueOnce(baseSha)
      .mockResolvedValue(refreshedHead);
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/blobs") {
        return { data: { sha: blobSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/trees") {
        return { data: { sha: treeSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/commits") {
        return { data: { sha: commitSha } };
      }
      throw Object.assign(new Error("Update is not a fast forward"), {
        status: 422,
      });
    });

    await expect(
      commitArtifactBlobs(99, repository, "openrigor/workspace", {
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).rejects.toMatchObject({ currentHeadCommitSha: refreshedHead });
  });

  it("ignores unsafe unmanaged names while loading only managed blobs", async () => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "GET /repos/{owner}/{repo}/git/trees/{tree_sha}") {
        return {
          data: {
            tree: [
              { path: "index.md", mode: "100644", type: "blob", sha: blobSha },
              {
                path: "notes.lnk",
                mode: "100644",
                type: "blob",
                sha: treeSha,
              },
              {
                path: "foo->bar.md",
                mode: "100644",
                type: "blob",
                sha: treeSha,
              },
            ],
          },
        };
      }
      if (route === "GET /repos/{owner}/{repo}/git/blobs/{file_sha}") {
        return {
          data: {
            content: Buffer.from("# Index\n").toString("base64"),
            encoding: "base64",
          },
        };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      listRepositoryArtifactRefs(99, repository, "openrigor/workspace")
    ).resolves.toMatchObject({
      commitSha: baseSha,
      artifacts: [
        {
          artifactId: "index",
          path: "index.md",
          commitSha: baseSha,
          blobSha,
        },
      ],
    });
    expect(harness.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      expect.objectContaining({ file_sha: blobSha })
    );
  });

  it("hashes managed blob bytes deterministically and ignores gitlink/submodule entries", async () => {
    const content = "# Index\n";
    const expectedHash = createHash("sha256").update(content).digest("hex");
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "GET /repos/{owner}/{repo}/git/trees/{tree_sha}") {
        return {
          data: {
            tree: [
              { path: "index.md", mode: "100644", type: "blob", sha: blobSha },
              {
                path: "vendor/lib",
                mode: "160000",
                type: "commit",
                sha: "0".repeat(40),
              },
              {
                path: ".gitmodules",
                mode: "100644",
                type: "blob",
                sha: treeSha,
              },
            ],
          },
        };
      }
      if (route === "GET /repos/{owner}/{repo}/git/blobs/{file_sha}") {
        return {
          data: {
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
          },
        };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    const first = await listRepositoryArtifactRefs(
      99,
      repository,
      "openrigor/workspace"
    );
    const second = await listRepositoryArtifactRefs(
      99,
      repository,
      "openrigor/workspace"
    );

    expect(first.artifacts).toEqual([
      {
        artifactId: "index",
        kind: "index",
        path: "index.md",
        commitSha: baseSha,
        blobSha,
        contentSha256: expectedHash,
      },
    ]);
    expect(first).toEqual(second);
    expect(first.artifacts[0]?.contentSha256).toBe(expectedHash);
  });

  it("rejects an unsafe sibling in a managed commit", async () => {
    await expect(
      commitArtifactBlobs(99, repository, "openrigor/workspace", {
        message: "Update index",
        baseSha,
        files: [
          { path: "index.md", content: "# Updated\n" },
          { path: "notes.lnk", content: "unsafe" },
        ],
      })
    ).rejects.toThrow(/Symbolic-link-looking/);
    expect(harness.getHead).not.toHaveBeenCalled();
    expect(harness.request).not.toHaveBeenCalled();
  });

  it("rejects duplicate artifact paths with a layout error code", async () => {
    const duplicatePath = "index.md";

    await expect(
      commitArtifactBlobs(99, repository, "openrigor/workspace", {
        message: "Update notes",
        baseSha,
        files: [
          { path: duplicatePath, content: "First\n" },
          { path: duplicatePath, content: "Second\n" },
        ],
      })
    ).rejects.toMatchObject<Partial<RepositoryLayoutError>>({
      code: "INVALID_ARTIFACT_PATH",
    });
    expect(harness.getHead).not.toHaveBeenCalled();
    expect(harness.request).not.toHaveBeenCalled();
  });
});
