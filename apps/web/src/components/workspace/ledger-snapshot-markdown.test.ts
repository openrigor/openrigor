import type { LedgerConfig, LedgerSnapshotData } from "@opencanvas/shared";
import { describe, expect, it } from "vitest";
import { renderLedgerBody } from "@/lib/workspace/ledger-publish";
import {
  renderLedgerSnapshotBody,
  renderLedgerSnapshotCanvasMarkdown,
} from "./ledger-snapshot-markdown";

const config: LedgerConfig = {
  methodId: "demo-method",
  methodVersion: "1.0.0",
  templateId: "evidence-template",
  templateVersion: "1.2.0",
  filters: [],
};

const snapshot: LedgerSnapshotData = {
  ledgerId: "ledger_demo",
  methodId: "demo-method",
  methodVersion: "1.0.0",
  templateId: "evidence-template",
  templateVersion: "1.2.0",
  filters: [],
  inputFingerprint: "sha256:input",
  renderHash: "sha256:render",
  sourceCommit: "abc1234",
  predicate: "all accepted evidence",
  generatedAt: "2026-08-20T10:00:00.000Z",
  resolverVersion: "1.0.0",
  buckets: { Included: 1, Unavailable: 1 },
  manifest: {
    contributions: [
      {
        id: "included",
        path: "evidence/included.md",
        sourceHash: "sha256:included",
        methodId: "demo-method",
        methodVersion: "1.0.0",
        templateVersion: "1.2.0",
        bucket: "Included",
        dimensionValues: {
          education_level: { status: "recorded", value: "k12" },
        },
        scopeValues: {},
      },
      {
        id: "gap",
        path: "evidence/gap.md",
        sourceHash: "sha256:gap",
        methodId: "demo-method",
        methodVersion: "1.0.0",
        templateVersion: "1.2.0",
        bucket: "Unavailable",
        dimensionValues: {},
        scopeValues: {},
      },
    ],
  },
};

describe("ledger snapshot markdown", () => {
  it("keeps the client-safe body byte-identical to the publication renderer", () => {
    expect(renderLedgerSnapshotBody(snapshot, config)).toBe(
      renderLedgerBody(snapshot, config)
    );
  });

  it("adds canvas-only, collapsed details groups without changing the body", () => {
    const markdown = renderLedgerSnapshotCanvasMarkdown(snapshot, config);

    expect(markdown.match(/<details/g)).toHaveLength(6);
    expect(markdown).toContain("<details open>\n<summary>Scope</summary>");
    expect(markdown).toContain(
      "<summary>Counterevidence and gaps (1)</summary>"
    );
    expect(renderLedgerBody(snapshot, config)).not.toContain("<details");
  });

  it("renders malformed missing dimension values without dropping their field", () => {
    const malformedSnapshot = structuredClone(snapshot);
    const contribution = (
      malformedSnapshot.manifest as unknown as {
        contributions: Array<{
          dimensionValues: Record<string, unknown>;
        }>;
      }
    ).contributions[0];
    contribution.dimensionValues = { education_level: undefined };

    expect(() =>
      renderLedgerSnapshotBody(malformedSnapshot, config)
    ).not.toThrow();
    expect(renderLedgerSnapshotBody(malformedSnapshot, config)).toContain(
      '"education_level": { status: "unavailable", value: "unavailable" }'
    );
  });
});
