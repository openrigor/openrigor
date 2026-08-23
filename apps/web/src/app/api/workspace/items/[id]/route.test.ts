import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class WorkspaceThreadOwnershipError extends Error {}
  class WorkspaceItemThreadNotAllowedError extends Error {}

  return {
    verifyUserAuthenticated: vi.fn(),
    deleteWorkspaceItem: vi.fn(),
    getWorkspaceItem: vi.fn(),
    reconcileWorkspaceItemThread: vi.fn(),
    WorkspaceItemNotFoundError,
    WorkspaceThreadOwnershipError,
    WorkspaceItemThreadNotAllowedError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  deleteWorkspaceItem: harness.deleteWorkspaceItem,
  getWorkspaceItem: harness.getWorkspaceItem,
  reconcileWorkspaceItemThread: harness.reconcileWorkspaceItemThread,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError: harness.WorkspaceThreadOwnershipError,
  WorkspaceItemThreadNotAllowedError:
    harness.WorkspaceItemThreadNotAllowedError,
}));

import { NextRequest } from "next/server";
import { DELETE, PATCH } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/workspace/items/wi_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const malformedRequest = () =>
  new NextRequest("http://localhost/api/workspace/items/wi_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{",
  });

describe("DELETE /api/workspace/items/[id]", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.deleteWorkspaceItem.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.reconcileWorkspaceItemThread.mockReset();
  });

  it("rejects unauthenticated deletion", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(401);
    expect(harness.deleteWorkspaceItem).not.toHaveBeenCalled();
  });

  it("deletes an owned item with a 204 response", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(204);
    expect(harness.deleteWorkspaceItem).toHaveBeenCalledWith("user-1", "wi_1");
  });

  it("returns not found without leaking ownership", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.deleteWorkspaceItem.mockRejectedValue(
      new harness.WorkspaceItemNotFoundError()
    );

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(404);
  });

  it("returns forbidden when the attached thread is not owned", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.deleteWorkspaceItem.mockRejectedValue(
      new harness.WorkspaceThreadOwnershipError()
    );

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/workspace/items/[id]", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getWorkspaceItem.mockResolvedValue({ id: "wi_1" });
  });

  it("rejects malformed JSON without reconciling the thread", async () => {
    const response = await PATCH(malformedRequest(), context("wi_1"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(harness.reconcileWorkspaceItemThread).not.toHaveBeenCalled();
  });

  it.each([
    [
      "not found",
      new harness.WorkspaceItemNotFoundError(),
      404,
      "Workspace item not found",
    ],
    [
      "forbidden",
      new harness.WorkspaceThreadOwnershipError(),
      403,
      "Forbidden",
    ],
    [
      "unsupported thread",
      new harness.WorkspaceItemThreadNotAllowedError(),
      400,
      "This item does not support an assistant thread",
    ],
    [
      "unexpected error",
      new Error("disk full"),
      500,
      "Could not attach workspace thread",
    ],
  ])(
    "maps reconcile %s errors correctly",
    async (_label, error, status, message) => {
      harness.reconcileWorkspaceItemThread.mockRejectedValue(error);

      const response = await PATCH(
        request({ threadId: "thread-1" }),
        context("wi_1")
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
    }
  );
});
