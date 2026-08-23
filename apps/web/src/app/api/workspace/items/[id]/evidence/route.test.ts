import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class WorkspaceThreadOwnershipError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    createEvidenceThread: vi.fn(),
    WorkspaceItemNotFoundError,
    WorkspaceThreadOwnershipError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  createEvidenceThread: harness.createEvidenceThread,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError: harness.WorkspaceThreadOwnershipError,
}));

import { POST } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/workspace/items/[id]/evidence", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.createEvidenceThread.mockReset();
  });

  it("requires authentication", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);
    const response = await POST(
      new Request("http://localhost"),
      context("wi_1")
    );
    expect(response.status).toBe(401);
    expect(harness.createEvidenceThread).not.toHaveBeenCalled();
  });

  it("creates an evidence thread and reports its draft status", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.createEvidenceThread.mockResolvedValue({
      threadId: "thread-evidence",
      item: {
        evidenceThreads: [
          {
            threadId: "thread-evidence",
            status: "draft",
            templateVersion: "1.0.0",
          },
        ],
      },
    });

    const response = await POST(
      new Request("http://localhost"),
      context("wi_1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      threadId: "thread-evidence",
      status: "draft",
    });
    expect(harness.createEvidenceThread).toHaveBeenCalledWith("user-1", "wi_1");
  });
});
