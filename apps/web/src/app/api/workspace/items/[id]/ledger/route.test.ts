import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class LedgerConfigValidationError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    previewLedgerConfig: vi.fn(),
    createLedgerSnapshotItem: vi.fn(),
    listLedgerSnapshots: vi.fn(),
    WorkspaceItemNotFoundError,
    LedgerConfigValidationError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  previewLedgerConfig: harness.previewLedgerConfig,
  createLedgerSnapshotItem: harness.createLedgerSnapshotItem,
  listLedgerSnapshots: harness.listLedgerSnapshots,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  LedgerConfigValidationError: harness.LedgerConfigValidationError,
}));

import { POST as previewPOST } from "./preview/route";
import { POST as generatePOST } from "./generate/route";
import { GET as snapshotsGET } from "./snapshots/route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown): NextRequest =>
  new NextRequest("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const RESOLUTION = {
  methods: [
    {
      id: "ledger-demo-method",
      version: "1.0.0",
      path: "methods/ledger-demo-method/ledger-demo-method.en.md",
      evidenceTemplate: {
        id: "evidence-template",
        version: "1.0.0",
        path: "methods/ledger-demo-method/evidence-template.en.md",
        dimensions: [],
      },
    },
  ],
  scope: {
    bucketCounts: {
      Included: 6,
      "Outside declared scope": 2,
      Unknown: 2,
      Unavailable: 2,
      "Resolver exclusion": 2,
    },
    baselineCount: 12,
    filters: [],
  },
  contributions: [{ path: "methods/x/evidence/p.en.md", bucket: "Included" }],
  manifest: { methods: [], filters: [], contributions: [] },
  manifestHash: "sha256:abc",
};

describe("ledger routes (server is the sole resolver)", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.previewLedgerConfig.mockReset();
    harness.createLedgerSnapshotItem.mockReset();
    harness.listLedgerSnapshots.mockReset();
  });

  describe("POST preview", () => {
    it("requires authentication", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue(undefined);
      const response = await previewPOST(json({ config: {} }), context("wi_1"));
      expect(response.status).toBe(401);
      expect(harness.previewLedgerConfig).not.toHaveBeenCalled();
    });

    it("rejects a forged filter (undeclared field) with 400", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      harness.previewLedgerConfig.mockRejectedValue(
        new harness.LedgerConfigValidationError(
          "Scope filter nope is not declared by the selected evidence template"
        )
      );
      const response = await previewPOST(
        json({
          config: {
            methodId: "ledger-demo-method",
            filters: [
              { fieldId: "nope", control: "multi-select", values: ["x"] },
            ],
          },
        }),
        context("wi_1")
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error:
          "Scope filter nope is not declared by the selected evidence template",
      });
    });

    it("returns 404 for a missing item", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      harness.previewLedgerConfig.mockRejectedValue(
        new harness.WorkspaceItemNotFoundError("missing")
      );
      const response = await previewPOST(json({}), context("wi_missing"));
      expect(response.status).toBe(404);
    });

    it("reports server-computed buckets, baseline, predicate and template on success", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      harness.previewLedgerConfig.mockResolvedValue({
        item: { id: "wi_1" },
        resolution: RESOLUTION,
        predicate: "context.education_level in [k12]",
      });
      const response = await previewPOST(json({ config: {} }), context("wi_1"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.baselineCount).toBe(12);
      expect(body.buckets.Included).toBe(6);
      expect(body.predicate).toBe("context.education_level in [k12]");
      expect(body.template.version).toBe("1.0.0");
    });
  });

  describe("POST generate", () => {
    it("requires authentication", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue(undefined);
      const response = await generatePOST(json({}), context("wi_1"));
      expect(response.status).toBe(401);
      expect(harness.createLedgerSnapshotItem).not.toHaveBeenCalled();
    });

    it("creates a snapshot (201) and returns idempotent repeats (200)", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      const snapshot = { id: "wi_snap", kind: "ledger_snapshot" };
      harness.createLedgerSnapshotItem
        .mockResolvedValueOnce({ item: snapshot, idempotent: false })
        .mockResolvedValueOnce({ item: snapshot, idempotent: true });
      const first = await generatePOST(json({ config: {} }), context("wi_1"));
      const second = await generatePOST(json({ config: {} }), context("wi_1"));
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(await first.json()).toEqual({ item: snapshot, idempotent: false });
      expect(await second.json()).toEqual({ item: snapshot, idempotent: true });
    });

    it("rejects a validation error with 400", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      harness.createLedgerSnapshotItem.mockRejectedValue(
        new harness.LedgerConfigValidationError("bad config")
      );
      const response = await generatePOST(json({}), context("wi_1"));
      expect(response.status).toBe(400);
    });
  });

  describe("GET snapshots", () => {
    it("lists snapshots newest-last", async () => {
      harness.verifyUserAuthenticated.mockResolvedValue({
        user: { id: "user-1" },
      });
      harness.listLedgerSnapshots.mockResolvedValue([
        { id: "wi_s1" },
        { id: "wi_s2" },
      ]);
      const response = await snapshotsGET(
        new Request("http://localhost"),
        context("wi_1")
      );
      expect(await response.json()).toEqual({
        snapshots: [{ id: "wi_s1" }, { id: "wi_s2" }],
      });
    });
  });
});
