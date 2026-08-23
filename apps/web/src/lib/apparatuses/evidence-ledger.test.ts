import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EvidenceLedgerResolutionError,
  resolveEvidenceLedger,
  resolveEvidenceLedgerFromSource,
  type EvidenceLedgerMethod,
  type EvidenceLedgerTemplate,
  type LedgerScopeFilter,
} from "./evidence-ledger";

const temporaryDirectories: string[] = [];

function researchRoot(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evaluchat-evidence-ledger-")
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeMethod(
  root: string,
  id: string,
  questionId = "question-one"
): void {
  const directory = path.join(root, "methods", id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${id}.en.md`),
    `---
type: Method
id: ${id}
version: 1.0.0
research_questions: ["${questionId}"]
---

# ${id}
`
  );
}

function writeTemplate(
  root: string,
  methodId: string,
  version: string,
  fields: string,
  filename = "evidence-template.en.md"
): void {
  const directory = path.join(root, "methods", methodId);
  fs.writeFileSync(
    path.join(directory, filename),
    `---
type: Form Template
id: evidence-template
version: ${version}
template_kind: form
applies_to_method: ${methodId}@1.0.0
fields:
${fields}
---

# Evidence
`
  );
}

function writeEvidence(
  root: string,
  methodId: string,
  id: string,
  templateVersion: string,
  status: "accepted" | "draft",
  fieldValues: string,
  provenance = ""
): void {
  const directory = path.join(root, "methods", methodId, "evidence");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${id}.md`),
    `---
type: Evidence Contribution
id: ${id}
status: ${status}
method:
  id: ${methodId}
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: ${templateVersion}
${provenance}field_values:
${fieldValues}
---

# Narrative outcome that the resolver must not read
`
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const alphaFields = `  education_level:
    type: select
    options: [k12, adult, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select
  outcome:
    type: textarea`;

const betaFields = `  education_level:
    type: select
    options: [k12, adult, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select
  collection_date:
    type: date
    missing_semantics: unknown
    ledger_dimension:
      role: collection
      control: range
  outcome:
    type: textarea`;

describe("Evidence Ledger resolver", () => {
  it("preserves unquoted dates as strings and rejects malformed date values", () => {
    const root = researchRoot();
    writeMethod(root, "beta-method");
    writeTemplate(root, "beta-method", "1.0.0", betaFields);
    writeEvidence(
      root,
      "beta-method",
      "unquoted-date",
      "1.0.0",
      "accepted",
      "  education_level: k12\n  collection_date: 2026-02-01"
    );
    writeEvidence(
      root,
      "beta-method",
      "malformed-date",
      "1.0.0",
      "accepted",
      "  education_level: k12\n  collection_date: 2026-99-99"
    );

    const result = resolveEvidenceLedger({
      researchRoot: root,
      filters: [
        {
          fieldId: "collection_date",
          control: "range",
          min: "2026-01-01",
          max: "2026-12-31",
        },
      ],
    });
    const byId = new Map(result.contributions.map((item) => [item.id, item]));

    expect(byId.get("unquoted-date")).toMatchObject({
      bucket: "Included",
      dimensionValues: {
        collection_date: { status: "recorded", value: "2026-02-01" },
      },
      scopeValues: {
        collection_date: { status: "recorded", value: "2026-02-01" },
      },
    });
    expect(byId.get("malformed-date")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "invalid provenance",
    });
    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        filters: [
          {
            fieldId: "collection_date",
            control: "range",
            min: "2026-02-01T::",
          },
        ],
      })
    ).toThrow(/range endpoints must be valid dates/);
  });

  it("buckets omitted declared dimensions as unknown", () => {
    const root = researchRoot();
    writeMethod(root, "beta-method");
    writeTemplate(root, "beta-method", "1.0.0", betaFields);
    writeEvidence(
      root,
      "beta-method",
      "omitted-date",
      "1.0.0",
      "accepted",
      "  education_level: k12"
    );

    const result = resolveEvidenceLedger({
      researchRoot: root,
      filters: [
        {
          fieldId: "collection_date",
          control: "range",
          min: "2026-01-01",
        },
      ],
    });

    expect(result.scope.baselineCount).toBe(1);
    expect(result.contributions[0]).toMatchObject({
      id: "omitted-date",
      bucket: "Unknown",
      dimensionValues: {
        collection_date: { status: "unknown", value: "unknown" },
      },
      scopeValues: {
        collection_date: { status: "unknown", value: "unknown" },
      },
    });
  });

  it("merges contributing methods and keeps unknown, unavailable, and exclusions distinct", () => {
    const root = researchRoot();
    writeMethod(root, "alpha-method");
    writeMethod(root, "beta-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);
    writeTemplate(root, "beta-method", "2.0.0", betaFields);

    writeEvidence(
      root,
      "alpha-method",
      "alpha-k12",
      "1.0.0",
      "accepted",
      "  education_level: k12\n  outcome: positive"
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-k12",
      "2.0.0",
      "accepted",
      '  education_level: k12\n  collection_date: "2026-02-01"\n  outcome: positive'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-adult",
      "2.0.0",
      "accepted",
      '  education_level: adult\n  collection_date: "2026-02-01"\n  outcome: negative'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-unknown",
      "2.0.0",
      "accepted",
      '  education_level: unknown\n  collection_date: "2026-02-01"\n  outcome: mixed'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-draft",
      "2.0.0",
      "draft",
      '  education_level: k12\n  collection_date: "2026-02-01"'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-invalid-provenance",
      "9.9.9",
      "accepted",
      '  education_level: k12\n  collection_date: "2026-02-01"'
    );

    const filters: LedgerScopeFilter[] = [
      {
        fieldId: "collection_date",
        control: "range",
        min: "2026-01-01",
        max: "2026-12-31",
      },
      {
        fieldId: "education_level",
        control: "multi-select",
        values: ["k12"],
      },
    ];
    const result = resolveEvidenceLedger({
      researchRoot: root,
      filters,
    });

    expect(result.methods.map((method) => method.id)).toEqual([
      "alpha-method",
      "beta-method",
    ]);
    expect(result.scope).toEqual({
      filters: [
        {
          fieldId: "collection_date",
          control: "range",
          min: "2026-01-01",
          max: "2026-12-31",
        },
        {
          fieldId: "education_level",
          control: "multi-select",
          values: ["k12"],
        },
      ],
      baselineCount: 4,
      bucketCounts: {
        Included: 1,
        "Outside declared scope": 1,
        Unknown: 1,
        Unavailable: 1,
        "Resolver exclusion": 2,
      },
    });

    const byId = new Map(result.contributions.map((item) => [item.id, item]));
    expect(byId.get("alpha-k12")).toMatchObject({
      bucket: "Unavailable",
      templateVersion: "1.0.0",
      scopeValues: { collection_date: { status: "unavailable" } },
    });
    expect(byId.get("beta-k12")).toMatchObject({
      bucket: "Included",
      templateVersion: "2.0.0",
      dimensionValues: {
        collection_date: { status: "recorded", value: "2026-02-01" },
        education_level: { status: "recorded", value: "k12" },
      },
    });
    expect(byId.get("beta-k12")?.dimensionValues).not.toHaveProperty("outcome");
    expect(byId.get("beta-adult")).toMatchObject({
      bucket: "Outside declared scope",
    });
    expect(byId.get("beta-unknown")).toMatchObject({
      bucket: "Unknown",
      dimensionValues: {
        education_level: { status: "unknown", value: "unknown" },
      },
    });
    expect(byId.get("beta-draft")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "not accepted",
    });
    expect(byId.get("beta-invalid-provenance")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "invalid provenance",
    });
    expect(
      result.contributions.map((contribution) => contribution.path)
    ).toEqual(
      [...result.contributions.map((contribution) => contribution.path)].sort()
    );
    expect(result.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects forged predicates over undeclared outcome fields", () => {
    const root = researchRoot();
    writeMethod(root, "alpha-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);

    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        filters: [
          {
            fieldId: "outcome",
            control: "multi-select",
            values: ["positive"],
          },
        ],
      })
    ).toThrow(EvidenceLedgerResolutionError);
    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        filters: [
          {
            fieldId: "outcome",
            control: "multi-select",
            values: ["positive"],
          },
        ],
      })
    ).toThrow(/not declared by an eligible evidence template/);
  });

  it("rejects selected values absent from a historical ledger dimension", () => {
    const root = researchRoot();
    writeMethod(root, "alpha-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);
    writeTemplate(
      root,
      "alpha-method",
      "0.9.0",
      `  education_level:
    type: select
    options: [k12, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select`,
      "evidence-template@0.9.0.en.md"
    );

    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        filters: [
          {
            fieldId: "education_level",
            control: "multi-select",
            values: ["adult"],
          },
        ],
      })
    ).toThrow(/uses a value not declared by every applicable template/);
  });
});

describe("resolveEvidenceLedgerFromSource", () => {
  const template: EvidenceLedgerTemplate = {
    id: "evidence-template",
    version: "1.0.0",
    path: "methods/alpha-method/evidence-template.en.md",
    dimensions: [
      {
        id: "education_level",
        type: "select",
        role: "context",
        control: "multi-select",
        options: ["k12", "tertiary", "unknown"],
      },
      {
        id: "collection_date",
        type: "date",
        role: "collection",
        control: "range",
      },
    ],
  };
  const method: EvidenceLedgerMethod = {
    id: "alpha-method",
    version: "1.0.0",
    path: "methods/alpha-method/alpha-method.en.md",
    evidenceTemplate: template,
  };
  const base = {
    path: "methods/alpha-method/evidence/p1.en.md",
    sourceHash: "sha256:abc",
    methodId: "alpha-method",
    methodVersion: "1.0.0",
    templateVersion: "1.0.0",
    dimensionValues: {},
    scopeValues: {},
    bucket: "Included" as const,
  };

  it("excludes a packet only when a filter targets its invalid dimension", () => {
    const resolution = resolveEvidenceLedgerFromSource({
      method,
      template,
      contributions: [
        {
          ...base,
          id: "p-invalid",
          invalidDimensions: ["education_level"],
          dimensionValues: {
            collection_date: { status: "recorded", value: "2024-03-01" },
          },
        },
        {
          ...base,
          id: "p-good",
          dimensionValues: {
            education_level: { status: "recorded", value: "k12" },
            collection_date: { status: "recorded", value: "2024-03-01" },
          },
        },
      ],
      filters: [
        {
          fieldId: "education_level",
          control: "multi-select",
          values: ["k12"],
        },
      ],
    });
    const byId = Object.fromEntries(
      resolution.contributions.map((contribution) => [
        contribution.id,
        contribution,
      ])
    );
    expect(byId["p-invalid"].bucket).toBe("Resolver exclusion");
    expect(byId["p-invalid"].exclusionReason).toBe("invalid provenance");
    expect(byId["p-good"].bucket).toBe("Included");
    expect(resolution.scope.baselineCount).toBe(1);
  });

  it("keeps an invalid-dimension packet when that dimension is not filtered", () => {
    const resolution = resolveEvidenceLedgerFromSource({
      method,
      template,
      contributions: [
        {
          ...base,
          id: "p-invalid",
          invalidDimensions: ["education_level"],
          dimensionValues: {
            collection_date: { status: "recorded", value: "2024-03-01" },
          },
        },
      ],
      filters: [
        {
          fieldId: "collection_date",
          control: "range",
          min: "2024-01-01",
          max: "2024-12-31",
        },
      ],
    });
    expect(resolution.contributions[0].bucket).toBe("Included");
    expect(resolution.scope.baselineCount).toBe(1);
  });
});
