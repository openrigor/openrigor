import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class FormValidationError extends Error {
    issues = [{ fieldId: "title", message: "Title is required." }];
  }
  class WorkspaceFormAlreadySubmittedError extends Error {}
  return {
    rpc: vi.fn(),
    createClient: vi.fn(),
    verifyUserAuthenticated: vi.fn(),
    submitWorkspaceForm: vi.fn(),
    WorkspaceItemNotFoundError,
    FormValidationError,
    WorkspaceFormAlreadySubmittedError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: harness.createClient,
}));
vi.mock("@/lib/workspace/store", () => ({
  submitWorkspaceForm: harness.submitWorkspaceForm,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceFormAlreadySubmittedError:
    harness.WorkspaceFormAlreadySubmittedError,
}));
vi.mock("@/lib/workspace/form-validation", () => ({
  FormValidationError: harness.FormValidationError,
}));

import { POST } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (values: unknown, extra: Record<string, unknown> = {}) =>
  new NextRequest("http://localhost/api/workspace/items/wi_1/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values, ...extra }),
  });
const malformedRequest = () =>
  new NextRequest("http://localhost/api/workspace/items/wi_1/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

describe("POST /api/workspace/items/[id]/submit", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.submitWorkspaceForm.mockReset();
    harness.rpc.mockReset().mockResolvedValue({ error: null });
    harness.createClient.mockReset().mockResolvedValue({
      rpc: harness.rpc,
    });
  });

  it("requires authentication", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);
    const response = await POST(request({}), context("wi_1"));
    expect(response.status).toBe(401);
    expect(harness.submitWorkspaceForm).not.toHaveBeenCalled();
  });

  it("submits an owned form and exposes the idempotency result", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: {
        id: "wi_1",
        kind: "form_template",
        submission: { status: "submitted" },
      },
      idempotent: false,
    });
    const response = await POST(request({ title: "Brief" }), context("wi_1"));
    expect(response.status).toBe(201);
    expect(harness.submitWorkspaceForm).toHaveBeenCalledWith(
      "user-1",
      "wi_1",
      {
        title: "Brief",
      },
      {
        profileId: undefined,
        threadId: undefined,
      }
    );
    expect(await response.json()).toMatchObject({ idempotent: false });
  });

  it("records a BYOK share when launching with sharing enabled", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: { id: "wi_1", kind: "method" },
      idempotent: false,
    });

    const response = await POST(
      request({ title: "Brief" }, { shareByok: true }),
      context("wi_1")
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).toHaveBeenCalledWith("byok_append_share", {
      p_user_id: "user-1",
      p_item_id: "wi_1",
    });
  });

  it("does not record a BYOK share when sharing is unchecked", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: { id: "wi_1", kind: "method" },
      idempotent: false,
    });

    const response = await POST(
      request({ title: "Brief" }, { shareByok: false }),
      context("wi_1")
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not record a BYOK share when the option is absent", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: { id: "wi_1", kind: "method" },
      idempotent: false,
    });

    const response = await POST(request({ title: "Brief" }), context("wi_1"));

    expect(response.status).toBe(201);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("succeeds when the BYOK share RPC errors", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: { id: "wi_1", kind: "method" },
      idempotent: false,
    });
    harness.rpc.mockResolvedValue({ error: new Error("rpc unavailable") });

    const response = await POST(
      request({ title: "Brief" }, { shareByok: true }),
      context("wi_1")
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON without submitting the form", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });

    const response = await POST(malformedRequest(), context("wi_1"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(harness.submitWorkspaceForm).not.toHaveBeenCalled();
  });

  it("returns validation issues without writing", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockRejectedValue(
      new harness.FormValidationError()
    );
    const response = await POST(request({}), context("wi_1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      issues: [{ fieldId: "title" }],
    });
  });

  it("rejects a changed retry after final submission", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockRejectedValue(
      new harness.WorkspaceFormAlreadySubmittedError()
    );
    const response = await POST(request({ title: "Changed" }), context("wi_1"));
    expect(response.status).toBe(409);
  });
});
