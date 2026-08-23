import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    getMethodRun: vi.fn(),
    getMethodParticipantReview: vi.fn(),
    WorkspaceItemNotFoundError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getMethodRun: harness.getMethodRun,
  getMethodParticipantReview: harness.getMethodParticipantReview,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
}));

import { GET as getRun } from "../../run/route";
import { GET as getReview } from "./route";

const runContext = (id: string) => ({ params: Promise.resolve({ id }) });
const reviewContext = (id: string, participantItemId: string) => ({
  params: Promise.resolve({ id, participantItemId }),
});

describe("method run review APIs", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getMethodRun.mockReset();
    harness.getMethodParticipantReview.mockReset();
  });

  it("forbids a non-operator from reading a run", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-2" },
    });
    harness.getMethodRun.mockRejectedValue(
      new harness.WorkspaceItemNotFoundError()
    );
    const response = await getRun(
      new Request("http://localhost"),
      runContext("wi_op")
    );
    expect(response.status).toBe(403);
  });

  it("forbids a non-operator from reading a participant review", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-2" },
    });
    harness.getMethodParticipantReview.mockRejectedValue(
      new harness.WorkspaceItemNotFoundError()
    );
    const response = await getReview(
      new Request("http://localhost"),
      reviewContext("wi_op", "wi_part")
    );
    expect(response.status).toBe(403);
    expect(harness.getMethodParticipantReview).toHaveBeenCalledWith(
      "user-2",
      "wi_op",
      "wi_part"
    );
  });

  it("returns messages for the operator", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getMethodParticipantReview.mockResolvedValue({
      thread: { messages: [{ type: "human", content: "hello" }] },
    });
    const response = await getReview(
      new Request("http://localhost"),
      reviewContext("wi_op", "wi_part")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      thread: { messages: [{ content: "hello" }] },
    });
  });
});
