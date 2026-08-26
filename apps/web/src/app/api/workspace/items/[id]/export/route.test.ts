import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    verifyUserAuthenticated: vi.fn(),
    getWorkspaceItem: vi.fn(),
    getGithubInstallationRepository: vi.fn(),
    readArtifactBlob: vi.fn(),
    createClient: vi.fn(() => ({ from })),
    maybeSingle,
    eq,
    select,
    from,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: harness.createClient,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
}));
vi.mock("@/lib/workspace/research-repository/github-app", () => ({
  getGithubInstallationRepository: harness.getGithubInstallationRepository,
}));
vi.mock("@/lib/workspace/research-repository/git-adapter", () => ({
  readArtifactBlob: harness.readArtifactBlob,
}));

import { GET } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const item = {
  id: "wi_1",
  ownerId: "user-1",
  kind: "markdown_template",
  status: "active",
  content: "# Export me\n",
  title: "Research draft",
};

describe("GET /api/workspace/items/[id]/export", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.createClient.mockClear();
    harness.maybeSingle
      .mockReset()
      .mockResolvedValue({ data: null, error: null });
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.getGithubInstallationRepository.mockReset();
    harness.readArtifactBlob.mockReset();
  });

  it("returns Markdown with the download content type by default", async () => {
    const response = await GET(
      new Request("http://localhost/api/workspace/items/wi_1/export"),
      context("wi_1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-disposition")).toMatch(
      /attachment; filename="Research-draft-\d{4}-\d{2}-\d{2}\.md"/
    );
    expect(await response.text()).toContain("repository:");
  });

  it("returns JSON for an evidence-packet request", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/workspace/items/wi_1/export?format=evidence-packet"
      ),
      context("wi_1")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toMatch(
      /Research-draft-evidence-\d{4}-\d{2}-\d{2}\.json/
    );
    expect(JSON.parse(await response.text())).toMatchObject({
      artifact: "# Export me\n",
      provenance: { llmMode: null, privacyNoticeVersion: null },
    });
  });

  it("reads a repository artifact and preserves its canonical Method metadata", async () => {
    const repositoryItem = {
      id: "repo_1",
      ownerId: "user-1",
      kind: "research_repository",
      status: "active",
      binding: {
        provider: "github",
        repositoryId: 101,
        installationId: 99,
        repositoryFullName: "openrigor/private-research",
        branch: "openrigor/workspace",
        layoutVersion: "1.0",
        headCommitSha: "a".repeat(40),
        boundAt: "2026-08-26T00:00:00.000Z",
      },
    };
    const method = `---\ntype: Method\nid: synthetic\nstatus: draft\nversion: 1.2.3\ntitle: Synthetic Method\ndescription: A synthetic method.\n---\n\n# Synthetic Method`;
    harness.getWorkspaceItem.mockResolvedValue(repositoryItem);
    harness.getGithubInstallationRepository.mockResolvedValue({
      id: 101,
      owner: "openrigor",
      name: "private-research",
      nameWithOwner: "openrigor/private-research",
    });
    harness.readArtifactBlob.mockResolvedValue({
      content: method,
      blobSha: "b".repeat(40),
      commitSha: "c".repeat(40),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/workspace/items/repo_1/export?artifactId=method.synthetic"
      ),
      context("repo_1")
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('repository: "openrigor/private-research"');
    expect(body).toContain('commit_sha: "' + "c".repeat(40) + '"');
    expect(body).toContain('method_name: "Synthetic Method"');
    expect(body).toContain('method_version: "1.2.3"');
    expect(harness.readArtifactBlob).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ id: 101 }),
      "openrigor/workspace",
      "methods/synthetic/synthetic.en.md"
    );
  });

  it("returns 404 for a nonexistent workspace item", async () => {
    harness.getWorkspaceItem.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/api/workspace/items/missing/export"),
      context("missing")
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when the request is not authenticated", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/api/workspace/items/wi_1/export"),
      context("wi_1")
    );

    expect(response.status).toBe(401);
    expect(harness.getWorkspaceItem).not.toHaveBeenCalled();
  });
});
