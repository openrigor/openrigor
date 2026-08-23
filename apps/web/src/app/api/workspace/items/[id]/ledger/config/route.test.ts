import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class LedgerConfigValidationError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    updateLedgerConfig: vi.fn(),
    WorkspaceItemNotFoundError,
    LedgerConfigValidationError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  updateLedgerConfig: harness.updateLedgerConfig,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  LedgerConfigValidationError: harness.LedgerConfigValidationError,
}));

import { PUT } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown): NextRequest =>
  new NextRequest("http://localhost", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const config = {
  methodId: "ledger-demo-method",
  methodVersion: "1.0.0",
  templateId: "evidence-template",
  templateVersion: "1.0.0",
  filters: [
    { fieldId: "education_level", control: "multi-select", values: ["k12"] },
  ],
};

describe("PUT ledger config", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.updateLedgerConfig.mockReset();
  });

  it("requires authentication", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    const response = await PUT(json({ config }), context("wi_1"));

    expect(response.status).toBe(401);
    expect(harness.updateLedgerConfig).not.toHaveBeenCalled();
  });

  it("returns 404 when the item is not owned by the current user", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.updateLedgerConfig.mockRejectedValue(
      new harness.WorkspaceItemNotFoundError("missing")
    );

    const response = await PUT(json({ config }), context("wi_missing"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when a filter is not declared by the evidence template", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.updateLedgerConfig.mockRejectedValue(
      new harness.LedgerConfigValidationError(
        "Scope filter nope is not declared by the selected evidence template"
      )
    );

    const response = await PUT(
      json({
        config: {
          ...config,
          filters: [
            { fieldId: "nope", control: "multi-select", values: ["x"] },
          ],
        },
      }),
      context("wi_1")
    );

    expect(response.status).toBe(400);
  });

  it("persists and returns the updated item", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    const item = { id: "wi_1", kind: "ledger", ledgerConfig: config };
    harness.updateLedgerConfig.mockResolvedValue(item);

    const response = await PUT(json({ config }), context("wi_1"));

    expect(response.status).toBe(200);
    expect(harness.updateLedgerConfig).toHaveBeenCalledWith(
      "user-1",
      "wi_1",
      config
    );
    expect(await response.json()).toEqual({ item });
  });
});
