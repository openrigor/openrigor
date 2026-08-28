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
    canonicalizeEvidenceSubmissionKey: vi.fn((value: string) => value),
    openEvidencePullRequest: vi.fn(),
    findExistingEvidencePullRequest: vi.fn(),
    commitPrivateMethodEvidence: vi.fn(),
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
  canonicalizeEvidenceSubmissionKey: harness.canonicalizeEvidenceSubmissionKey,
}));
vi.mock("@/lib/workspace/evidence-github", () => ({
  openEvidencePullRequest: harness.openEvidencePullRequest,
  findExistingEvidencePullRequest: harness.findExistingEvidencePullRequest,
}));
vi.mock("@/lib/workspace/research-repository/private-method-writeback", () => ({
  commitPrivateMethodEvidence: harness.commitPrivateMethodEvidence,
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
      .mockReturnValue("2026-08-18t12-34-56z");
    harness.openEvidencePullRequest.mockReset();
    harness.commitPrivateMethodEvidence.mockReset();
    harness.findExistingEvidencePullRequest
      .mockReset()
      .mockResolvedValue(undefined);
    harness.claimEvidenceSubmission.mockResolvedValue({
      status: "submitting",
      submissionKey: "2026-08-18t12-34-56z",
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
      url: "https://github.com/openrigor/research/pull/12",
    });

    const values = {
      narrative: "Account",
      publication_authorisation: "confirmed-authorised-to-publish",
      anonymisation_status:
        "confirmed-no-student-identifiers-or-raw-student-material",
      data_sharing_limits: "Aggregate counts only.",
    };
    const response = await POST(request(values), context("wi_1", "thread-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "filed",
      pullRequestNumber: 12,
      filePath: "methods/test-method/evidence/file.en.md",
    });
    expect(harness.validateEvidenceSubmission).toHaveBeenCalledWith(
      { methodId: "test-method" },
      values
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

  it("commits adopted Method evidence directly to its private repository", async () => {
    const privateRepository = {
      repositoryItemId: "wi_repo",
      repositoryId: 101,
      commitSha: "a".repeat(40),
    };
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getEvidenceSnapshot.mockResolvedValue({
      item: { methodSource: { privateRepository } },
      snapshot: { methodId: "test-method" },
      reference: { status: "draft" },
    });
    harness.validateEvidenceSubmission.mockReturnValue({
      values: { narrative: "Account" },
      stage: "documented-experience",
    });
    harness.assembleEvidenceMarkdown.mockReturnValue("private markdown");
    harness.evidenceFilePath.mockReturnValue(
      "methods/test-method/evidence/file.en.md"
    );
    harness.commitPrivateMethodEvidence.mockResolvedValue({
      commitSha: "b".repeat(40),
    });

    const values = {
      narrative: "Account",
      publication_authorisation: "confirmed-authorised-to-publish",
      anonymisation_status:
        "confirmed-no-student-identifiers-or-raw-student-material",
      data_sharing_limits: "Aggregate counts only.",
    };
    const response = await POST(request(values), context("wi_1", "thread-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "filed",
      private: true,
      commitSha: "b".repeat(40),
      filePath: "methods/test-method/evidence/file.en.md",
    });
    expect(harness.commitPrivateMethodEvidence).toHaveBeenCalledWith({
      userId: "user-1",
      provenance: privateRepository,
      methodId: "test-method",
      filePath: "methods/test-method/evidence/file.en.md",
      markdown: "private markdown",
    });
    expect(harness.validateEvidenceSubmission).toHaveBeenCalledWith(
      { methodId: "test-method" },
      values
    );
    expect(harness.openEvidencePullRequest).not.toHaveBeenCalled();
    expect(harness.updateEvidenceThreadReference).toHaveBeenCalledWith(
      "user-1",
      "wi_1",
      "thread-1",
      expect.objectContaining({ status: "filed" })
    );
  });
});
