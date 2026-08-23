import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => {
  class FormValidationError extends Error {
    issues = [{ fieldId: "narrative", message: "Narrative is required." }];
  }
  class WorkspaceItemNotFoundError extends Error {}
  class WorkspaceThreadOwnershipError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    getEvidenceSnapshot: vi.fn(),
    updateEvidenceThreadReference: vi.fn(),
    claimEvidenceSubmission: vi.fn(),
    validateEvidenceSubmission: vi.fn(),
    assembleEvidenceMarkdown: vi.fn(),
    evidenceFilePath: vi.fn(),
    evidenceTimestampSlug: vi.fn(),
    openEvidencePullRequest: vi.fn(),
    findExistingEvidencePullRequest: vi.fn(),
    FormValidationError,
    WorkspaceItemNotFoundError,
    WorkspaceThreadOwnershipError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/form-validation", () => ({
  FormValidationError: harness.FormValidationError,
}));
vi.mock("@/lib/workspace/evidence", () => ({
  validateEvidenceSubmission: harness.validateEvidenceSubmission,
  assembleEvidenceMarkdown: harness.assembleEvidenceMarkdown,
  evidenceFilePath: harness.evidenceFilePath,
  evidenceTimestampSlug: harness.evidenceTimestampSlug,
}));
vi.mock("@/lib/workspace/evidence-github", () => ({
  openEvidencePullRequest: harness.openEvidencePullRequest,
  findExistingEvidencePullRequest: harness.findExistingEvidencePullRequest,
}));
vi.mock("@/lib/workspace/store", () => ({
  claimEvidenceSubmission: harness.claimEvidenceSubmission,
  getEvidenceSnapshot: harness.getEvidenceSnapshot,
  updateEvidenceThreadReference: harness.updateEvidenceThreadReference,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError: harness.WorkspaceThreadOwnershipError,
  WorkspaceEvidenceAlreadySubmittedError: class WorkspaceEvidenceAlreadySubmittedError extends Error {},
  WorkspaceEvidenceThreadMissingError: class WorkspaceEvidenceThreadMissingError extends Error {},
}));

import { POST } from "./route";

const context = (id: string, threadId: string) => ({
  params: Promise.resolve({ id, threadId }),
});
const request = (values: unknown) =>
  new NextRequest(
    "http://localhost/api/workspace/items/wi_1/evidence/thread-1/submit",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );

describe("POST /api/workspace/items/[id]/evidence/[threadId]/submit", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getEvidenceSnapshot.mockReset();
    harness.updateEvidenceThreadReference.mockReset();
    harness.claimEvidenceSubmission.mockReset();
    harness.validateEvidenceSubmission.mockReset();
    harness.assembleEvidenceMarkdown.mockReset();
    harness.evidenceFilePath.mockReset();
    harness.evidenceTimestampSlug
      .mockReset()
      .mockReturnValue("2026-08-18T12-34-56Z");
    harness.openEvidencePullRequest.mockReset();
    harness.findExistingEvidencePullRequest
      .mockReset()
      .mockResolvedValue(undefined);
    harness.claimEvidenceSubmission.mockResolvedValue({
      status: "submitting",
      submissionKey: "2026-08-18T12-34-56Z",
    });
  });

  it("validates, assembles, opens the PR, and stores its status", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getEvidenceSnapshot.mockResolvedValue({
      snapshot: { methodId: "test-method" },
      reference: { status: "draft" },
    });
    harness.validateEvidenceSubmission.mockReturnValue({
      values: { narrative: "Account" },
      stage: "documented-experience",
    });
    harness.assembleEvidenceMarkdown.mockReturnValue("markdown");
    harness.evidenceFilePath.mockReturnValue(
      "methods/test-method/evidence/file.en.md"
    );
    harness.openEvidencePullRequest.mockResolvedValue({
      status: "filed",
      number: 12,
      url: "https://github.com/evaluchat/research/pull/12",
    });

    const response = await POST(
      request({ narrative: "Account" }),
      context("wi_1", "thread-1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "filed",
      pullRequestNumber: 12,
      filePath: "methods/test-method/evidence/file.en.md",
    });
    expect(harness.validateEvidenceSubmission).toHaveBeenCalledWith(
      { methodId: "test-method" },
      { narrative: "Account" }
    );
    expect(harness.updateEvidenceThreadReference).toHaveBeenCalledWith(
      "user-1",
      "wi_1",
      "thread-1",
      expect.objectContaining({ status: "filed", pullRequestNumber: 12 })
    );
  });

  it("returns validation issues without opening a PR", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getEvidenceSnapshot.mockResolvedValue({
      snapshot: {},
      reference: { status: "draft" },
    });
    harness.validateEvidenceSubmission.mockImplementation(() => {
      throw new harness.FormValidationError();
    });

    const response = await POST(request({}), context("wi_1", "thread-1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Validation failed" });
    expect(harness.openEvidencePullRequest).not.toHaveBeenCalled();
  });
});
