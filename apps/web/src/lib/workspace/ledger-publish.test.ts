import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import type { LedgerConfig, LedgerSnapshotData } from "@opencanvas/shared";
import { FormValidationError } from "./form-validation";
import {
  ledgerRenderHash,
  renderLedgerMarkdown,
  validateLedgerPublicationDeclarations,
} from "./ledger-publish";

const config: LedgerConfig = {
  methodId: "ai-assisted-essay",
  methodVersion: "1.0.0",
  templateId: "evidence-template",
  templateVersion: "1.2.0",
  filters: [
    {
      fieldId: "education_level",
      control: "multi-select",
      values: ["k12"],
    },
  ],
};

const baseSnapshot: LedgerSnapshotData = {
  ledgerId: "ledger_demo",
  methodId: "ai-assisted-essay",
  methodVersion: "1.0.0",
  templateId: "evidence-template",
  templateVersion: "1.2.0",
  filters: config.filters,
  manifest: {
    methods: [],
    filters: config.filters,
    contributions: [
      {
        id: "evidence_b",
        path: "methods/ai-assisted-essay/evidence/b.en.md",
        sourceHash: "sha256:bbb",
        methodId: "ai-assisted-essay",
        methodVersion: "1.0.0",
        templateVersion: "1.2.0",
        bucket: "Included",
        dimensionValues: {
          education_level: { status: "recorded", value: "k12" },
          country_code: { status: "unknown", value: "unknown" },
        },
        scopeValues: {},
      },
      {
        id: "evidence_a",
        path: "methods/ai-assisted-essay/evidence/a.en.md",
        sourceHash: "sha256:aaa",
        methodId: "ai-assisted-essay",
        methodVersion: "1.0.0",
        templateVersion: "1.2.0",
        bucket: "Unavailable",
        dimensionValues: {},
        scopeValues: {},
      },
    ],
  },
  inputFingerprint: "sha256:manifest",
  renderHash: "",
  buckets: {
    Included: 1,
    "Outside declared scope": 0,
    Unknown: 0,
    Unavailable: 1,
    "Resolver exclusion": 0,
  },
  predicate: "context.education_level in [k12]",
  generatedAt: "2026-08-19T12:00:00.000Z",
  resolverVersion: "1.0.0",
  sourceCommit: "abc123",
};

function snapshot(): LedgerSnapshotData {
  const next = structuredClone(baseSnapshot);
  next.renderHash = ledgerRenderHash(next, config);
  return next;
}

function frontmatter(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("Missing frontmatter");
  return yaml.load(match[1]) as Record<string, unknown>;
}

describe("renderLedgerMarkdown", () => {
  it("uses exactly the Evidence Ledger publication frontmatter contract", () => {
    const current = snapshot();
    const markdown = renderLedgerMarkdown(current, config);
    const fields = frontmatter(markdown);

    expect(Object.keys(fields)).toEqual([
      "type",
      "id",
      "lang",
      "origin",
      "status",
      "title",
      "description",
      "method",
      "evidence_template",
      "scope",
      "source_commit",
      "input_fingerprint",
      "render_hash",
      "resolver_version",
      "generated",
    ]);
    expect(markdown).not.toMatch(/question|research_questions/i);
  });

  it("is byte-stable for the same sealed snapshot", () => {
    const current = snapshot();
    expect(renderLedgerMarkdown(current, config)).toBe(
      renderLedgerMarkdown(structuredClone(current), structuredClone(config))
    );
  });

  it("round-trips scope and input fingerprint into frontmatter", () => {
    const current = snapshot();
    const fields = frontmatter(renderLedgerMarkdown(current, config));
    expect(fields.scope).toBe(current.predicate);
    expect(fields.input_fingerprint).toBe(current.inputFingerprint);
    expect(fields.render_hash).toBe(ledgerRenderHash(current, config));
  });
});

describe("validateLedgerPublicationDeclarations", () => {
  const confirmed = {
    publication_authorisation: "confirmed-authorised-to-publish",
    anonymisation_status:
      "confirmed-no-student-identifiers-or-raw-student-material",
    public_data_declaration: "confirmed-public-data",
  };

  it("requires a confirmed public data declaration", () => {
    expect(
      validateLedgerPublicationDeclarations(snapshot(), confirmed).values
    ).toMatchObject(confirmed);

    expect(() =>
      validateLedgerPublicationDeclarations(snapshot(), {
        publication_authorisation: confirmed.publication_authorisation,
        anonymisation_status: confirmed.anonymisation_status,
      })
    ).toThrow(FormValidationError);

    expect(() =>
      validateLedgerPublicationDeclarations(snapshot(), {
        ...confirmed,
        public_data_declaration: "not-confirmed-do-not-submit",
      })
    ).toThrow(FormValidationError);
  });
});
