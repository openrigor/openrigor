import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verify: vi.fn(),
  Webhooks: vi.fn(function WebhooksMock() {
    return { verify: harness.verify };
  }),
  findOwners: vi.fn(),
  findOwnersByGithubUser: vi.fn(),
  claimDelivery: vi.fn(),
  releaseDelivery: vi.fn(),
  deleteCredentials: vi.fn(),
  revokeAuthorization: vi.fn(),
  updateInstallation: vi.fn(),
  updateRepositories: vi.fn(),
  recordPush: vi.fn(),
  listItems: vi.fn(),
  updateHead: vi.fn(),
}));

vi.mock("@octokit/webhooks", () => ({ Webhooks: harness.Webhooks }));
vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/workspace/research-repository/credentials", () => ({
  findGithubCredentialOwnersByInstallationId: harness.findOwners,
  findGithubCredentialOwnersByGithubUserId: harness.findOwnersByGithubUser,
  claimGithubWebhookDelivery: harness.claimDelivery,
  releaseGithubWebhookDelivery: harness.releaseDelivery,
  deleteGithubResearchCredentials: harness.deleteCredentials,
  revokeGithubAuthorization: harness.revokeAuthorization,
  updateGithubInstallation: harness.updateInstallation,
  updateGithubInstallationRepositories: harness.updateRepositories,
  recordGithubPush: harness.recordPush,
}));
vi.mock("@/lib/workspace/store", () => ({
  listWorkspaceItems: harness.listItems,
  updateResearchRepositoryBindingHead: harness.updateHead,
}));

import { POST } from "./route";

function request(
  body: unknown,
  headers: Record<string, string> = {},
  event = "push"
) {
  return new NextRequest("http://localhost/api/workspace/github/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-github-delivery": "delivery-1",
      "x-github-event": event,
      "x-hub-signature-256": "sha256=valid",
      ...headers,
    },
  });
}

describe("POST /api/workspace/github/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_RESEARCH_APP_WEBHOOK_SECRET", "webhook-secret");
    for (const method of Object.values(harness)) method.mockReset();
    harness.enabled.mockReturnValue(true);
    harness.verify.mockResolvedValue(true);
    harness.findOwners.mockResolvedValue(["user-1"]);
    harness.findOwnersByGithubUser.mockResolvedValue([]);
    harness.claimDelivery.mockResolvedValue(true);
    harness.releaseDelivery.mockResolvedValue(undefined);
    harness.revokeAuthorization.mockResolvedValue(undefined);
    harness.listItems.mockResolvedValue([]);
    harness.updateHead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 while the feature flag is off", async () => {
    harness.enabled.mockReturnValue(false);
    expect((await POST(request({ installation: { id: 99 } }))).status).toBe(
      404
    );
    expect(harness.verify).not.toHaveBeenCalled();
  });

  it("rejects a missing HMAC signature before handling the payload", async () => {
    const req = request({ installation: { id: 99 } });
    req.headers.delete("x-hub-signature-256");
    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.findOwners).not.toHaveBeenCalled();
  });

  it("rejects a missing HMAC signature without consuming the request body", async () => {
    const req = request({ installation: { id: 99 } });
    req.headers.delete("x-hub-signature-256");
    req.text = async () => {
      throw new Error("body must not be consumed");
    };
    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(harness.verify).not.toHaveBeenCalled();
  });

  it("rejects an HMAC failure before handling the payload", async () => {
    harness.verify.mockResolvedValue(false);
    const response = await POST(request({ installation: { id: 99 } }));
    expect(response.status).toBe(401);
    expect(harness.findOwners).not.toHaveBeenCalled();
  });

  it("ignores a duplicate delivery", async () => {
    harness.claimDelivery.mockResolvedValue(false);
    const response = await POST(request({ installation: { id: 99 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(harness.recordPush).not.toHaveBeenCalled();
  });

  it("handles push without retaining its raw payload", async () => {
    const response = await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/main",
        before: "abc",
        after: "def",
        commits: [{ message: "must not be persisted" }],
      })
    );
    expect(response.status).toBe(200);
    expect(harness.claimDelivery).toHaveBeenCalledWith("user-1", "delivery-1");
    expect(harness.recordPush).toHaveBeenCalledWith("user-1", {
      repositoryId: 101,
      ref: "refs/heads/main",
      before: "abc",
      after: "def",
      pathScope: "unknown",
    });
    expect(JSON.stringify(harness.recordPush.mock.calls)).not.toContain(
      "must not be persisted"
    );
  });

  it("leaves the binding head unchanged for an outside-only push", async () => {
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "1.0",
        },
      },
    ]);
    const after = "b".repeat(40);

    const response = await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        after,
        commits: [{ added: ["docs/readme.md"], removed: [], modified: [] }],
      })
    );

    expect(response.status).toBe(200);
    expect(harness.recordPush).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ repositoryId: 101, pathScope: "outside" })
    );
    expect(harness.updateHead).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a managed path",
      [{ added: ["openrigor/index.md"], removed: [], modified: [] }],
      "inside",
    ],
    [
      "a mixed path set",
      [
        {
          added: ["docs/readme.md"],
          removed: [],
          modified: ["openrigor/index.md"],
        },
      ],
      "inside",
    ],
    ["an unknown path set", undefined, "unknown"],
  ] as const)(
    "advances the binding for %s",
    async (_name, commits, pathScope) => {
      const item = {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "1.0",
          headCommitSha: "a".repeat(40),
        },
      };
      harness.listItems.mockResolvedValue([item]);
      const before = "a".repeat(40);
      const after = "c".repeat(40);

      const response = await POST(
        request({
          installation: { id: 99 },
          repository: { id: 101 },
          ref: "refs/heads/openrigor/workspace",
          before,
          after,
          ...(commits === undefined ? {} : { commits }),
        })
      );

      expect(response.status).toBe(200);
      expect(harness.recordPush).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ pathScope })
      );
      expect(harness.updateHead).toHaveBeenCalledWith(
        "user-1",
        "workspace-one",
        after
      );
    }
  );

  it("treats a capped commit list as unknown and advances safely", async () => {
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "2.0",
          headCommitSha: "a".repeat(40),
        },
      },
    ]);
    const after = "d".repeat(40);
    const commits = Array.from({ length: 2048 }, () => ({
      added: ["docs/readme.md"],
      removed: [],
      modified: [],
    }));

    await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        before: "a".repeat(40),
        after,
        commits,
      })
    );

    expect(harness.recordPush).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ pathScope: "unknown" })
    );
    expect(harness.updateHead).toHaveBeenCalledWith(
      "user-1",
      "workspace-one",
      after
    );
  });

  it("leaves the binding head unchanged for a 20-commit outside-only push", async () => {
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "2.0",
          headCommitSha: "a".repeat(40),
        },
      },
    ]);

    const response = await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        before: "a".repeat(40),
        after: "e".repeat(40),
        commits: Array.from({ length: 20 }, () => ({
          added: ["docs/readme.md"],
          removed: [],
          modified: [],
        })),
      })
    );

    expect(response.status).toBe(200);
    expect(harness.recordPush).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ pathScope: "outside" })
    );
    expect(harness.updateHead).not.toHaveBeenCalled();
  });

  it("does not sync the binding head when the branch is deleted", async () => {
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "2.0",
          headCommitSha: "a".repeat(40),
        },
      },
    ]);

    const response = await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        deleted: true,
        before: "a".repeat(40),
        after: "0".repeat(40),
        commits: [],
      })
    );

    expect(response.status).toBe(200);
    expect(harness.updateHead).not.toHaveBeenCalled();
  });

  it("ignores a stale push whose before does not match the stored head", async () => {
    const newer = "b".repeat(40);
    const staleAfter = "c".repeat(40);
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "2.0",
          headCommitSha: "a".repeat(40),
        },
      },
    ]);

    await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        before: "a".repeat(40),
        after: newer,
        commits: [{ added: ["openrigor/index.md"], removed: [], modified: [] }],
      })
    );
    expect(harness.updateHead).toHaveBeenCalledWith(
      "user-1",
      "workspace-one",
      newer
    );

    harness.updateHead.mockClear();
    harness.listItems.mockResolvedValue([
      {
        id: "workspace-one",
        kind: "research_repository",
        binding: {
          installationId: 99,
          repositoryId: 101,
          layoutVersion: "2.0",
          headCommitSha: newer,
        },
      },
    ]);

    await POST(
      request({
        installation: { id: 99 },
        repository: { id: 101 },
        ref: "refs/heads/openrigor/workspace",
        before: "a".repeat(40),
        after: staleAfter,
        commits: [{ added: ["openrigor/index.md"], removed: [], modified: [] }],
      })
    );

    expect(harness.updateHead).not.toHaveBeenCalled();
  });

  it("updates only repository ids for installation repository events", async () => {
    await POST(
      request(
        {
          installation: { id: 99 },
          repositories_added: [{ id: 102, full_name: "private/name" }],
          repositories_removed: [{ id: 101 }],
        },
        {},
        "installation_repositories"
      )
    );
    expect(harness.updateRepositories).toHaveBeenCalledWith(
      "user-1",
      [102],
      [101]
    );
  });

  it("does not clear repositories when an installation event omits them", async () => {
    const response = await POST(
      request(
        { action: "suspend", installation: { id: 99 } },
        {},
        "installation"
      )
    );

    expect(response.status).toBe(200);
    expect(harness.updateInstallation).not.toHaveBeenCalled();
  });

  it("replaces repository ids when an installation event includes them", async () => {
    const response = await POST(
      request(
        {
          action: "created",
          installation: { id: 99 },
          repositories: [{ id: 102, full_name: "private/name" }],
        },
        {},
        "installation"
      )
    );

    expect(response.status).toBe(200);
    expect(harness.updateInstallation).toHaveBeenCalledWith("user-1", 99, [
      102,
    ]);
  });

  it("deletes credentials when the installation is deleted", async () => {
    const response = await POST(
      request(
        { action: "deleted", installation: { id: 99 } },
        {},
        "installation"
      )
    );

    expect(response.status).toBe(200);
    expect(harness.deleteCredentials).toHaveBeenCalledWith("user-1");
    expect(harness.updateInstallation).not.toHaveBeenCalled();
  });

  it("deletes only the revoked user's credentials without requiring an installation id", async () => {
    harness.findOwnersByGithubUser.mockResolvedValue(["user-1"]);
    const response = await POST(
      request(
        { action: "revoked", sender: { id: 7 } },
        {},
        "github_app_authorization"
      )
    );

    expect(response.status).toBe(200);
    expect(harness.findOwnersByGithubUser).toHaveBeenCalledWith(7);
    expect(harness.findOwners).not.toHaveBeenCalled();
    expect(harness.revokeAuthorization).toHaveBeenCalledWith("user-1");
    expect(harness.deleteCredentials).not.toHaveBeenCalled();
    expect(harness.recordPush).not.toHaveBeenCalled();
    expect(harness.updateRepositories).not.toHaveBeenCalled();
  });

  it("does not delete credentials when the installation is created", async () => {
    const response = await POST(
      request(
        {
          action: "created",
          installation: { id: 99 },
          repositories: [{ id: 102, full_name: "private/name" }],
        },
        {},
        "installation"
      )
    );

    expect(response.status).toBe(200);
    expect(harness.deleteCredentials).not.toHaveBeenCalled();
    expect(harness.updateInstallation).toHaveBeenCalledWith("user-1", 99, [
      102,
    ]);
  });

  it("returns 500 when credential owner search is truncated", async () => {
    harness.findOwners.mockRejectedValue(
      Object.assign(new Error("truncated"), {
        name: "CredentialOwnerSearchTruncatedError",
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({ installation: { id: 99 } }));

    expect(response.status).toBe(500);
    expect(harness.claimDelivery).not.toHaveBeenCalled();
  });

  it("releases a delivery claim when handling fails and returns 500", async () => {
    harness.recordPush.mockRejectedValue(new Error("store unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({ installation: { id: 99 } }));

    expect(response.status).toBe(500);
    expect(harness.releaseDelivery).toHaveBeenCalledWith(
      "user-1",
      "delivery-1"
    );
  });

  it("logs only the error message when webhook handling fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    harness.recordPush.mockRejectedValue(
      Object.assign(new Error("store unavailable"), {
        secret: "webhook-secret",
      })
    );

    await POST(request({ installation: { id: 99 } }));

    expect(JSON.stringify(spy.mock.calls)).not.toContain("webhook-secret");
    expect(spy).toHaveBeenCalledWith(
      "[github-research] webhook handling failed",
      "store unavailable"
    );
  });
});
