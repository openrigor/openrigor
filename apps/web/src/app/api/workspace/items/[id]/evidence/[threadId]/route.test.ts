import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class WorkspaceThreadOwnershipError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    getEvidenceSnapshot: vi.fn(),
    WorkspaceItemNotFoundError,
    WorkspaceThreadOwnershipError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getEvidenceSnapshot: harness.getEvidenceSnapshot,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError: harness.WorkspaceThreadOwnershipError,
}));

import { GET } from "./route";

const context = (id: string, threadId: string) => ({
  params: Promise.resolve({ id, threadId }),
});

describe("GET /api/workspace/items/[id]/evidence/[threadId]", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getEvidenceSnapshot.mockReset();
  });

  it("returns the snapshot, frozen values, and PR status", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getEvidenceSnapshot.mockResolvedValue({
      reference: {
        status: "submitted",
        pullRequestUrl: "https://github.com/evaluchat/research/pull/9",
        pullRequestNumber: 9,
      },
      snapshot: {
        templateId: "evidence-template",
        templateVersion: "1.0.0",
        sourcePath: "methods/test/evidence-template.en.md",
        fields: {},
        layoutMarkdown: "# Evidence",
        guidance: "Guidance",
        frozenValues: { participant_count: 2 },
        methodId: "test-method",
        methodVersion: "1.0.0",
      },
    });

    const response = await GET(
      new Request("http://localhost"),
      context("wi_1", "thread-9")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      threadId: "thread-9",
      status: "submitted",
      pullRequestNumber: 9,
      frozenValues: { participant_count: 2 },
      method: { id: "test-method", version: "1.0.0" },
    });
  });
});
