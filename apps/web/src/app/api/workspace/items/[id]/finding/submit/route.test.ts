import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FindingValidationError } from "@/lib/workspace/finding-validation";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  validateFindingSubmission: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
}));
vi.mock("@/lib/workspace/finding-validation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspace/finding-validation")
  >("@/lib/workspace/finding-validation");
  return {
    ...actual,
    validateFindingSubmission: harness.validateFindingSubmission,
  };
});

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "wi_finding" }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/workspace/items/[id]/finding/submit", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.validateFindingSubmission.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getWorkspaceItem.mockResolvedValue({
      kind: "markdown_template",
      source: { templateId: "finding-starter" },
    });
    harness.validateFindingSubmission.mockResolvedValue({ ok: true });
  });

  it("runs linked-ledger validation before treating the finding as submittable", async () => {
    const response = await POST(
      request({ markdown: "---\ntype: Finding\n---\n" }),
      context
    );
    expect(response.status).toBe(200);
    expect(harness.validateFindingSubmission).toHaveBeenCalledWith(
      "---\ntype: Finding\n---\n"
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns finding validation issues", async () => {
    harness.validateFindingSubmission.mockRejectedValue(
      new FindingValidationError([
        {
          fieldId: "evidence_ledgers",
          message: "evidence_ledgers must be a non-empty list.",
        },
      ])
    );
    const response = await POST(request({ markdown: "# Finding" }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Validation failed",
      issues: [
        {
          fieldId: "evidence_ledgers",
          message: "evidence_ledgers must be a non-empty list.",
        },
      ],
    });
  });
});
