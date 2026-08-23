import { beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerPickerUnavailableError } from "@/lib/workspace/ledger-picker";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  listMergedLedgers: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/ledger-picker", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspace/ledger-picker")
  >("@/lib/workspace/ledger-picker");
  return {
    ...actual,
    listMergedLedgers: harness.listMergedLedgers,
  };
});

import { GET } from "./route";

describe("GET /api/workspace/published-ledgers", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.listMergedLedgers.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  it("lists merged ledgers", async () => {
    harness.listMergedLedgers.mockResolvedValue([
      {
        id: "ledger-k12-us",
        title: "Demo",
        path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
        method: { id: "demo-method", version: "1.0.0" },
        evidence_template: { id: "evidence-template", version: "1.2.0" },
        source_commit: "abc",
        input_fingerprint: "sha256:hash",
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ledgers: [expect.objectContaining({ id: "ledger-k12-us" })],
    });
  });

  it("renders picker unavailability", async () => {
    harness.listMergedLedgers.mockRejectedValue(
      new LedgerPickerUnavailableError()
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Ledger picker unavailable",
    });
  });

  it("rejects unauthenticated callers", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
