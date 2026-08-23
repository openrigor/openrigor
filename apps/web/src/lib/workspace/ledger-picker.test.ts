import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";

const LEDGER_MD = `---
type: Evidence Ledger
id: ledger-k12-us
lang: en
origin: native
status: stable
title: Demo method — education level k12, country US
method:
  id: demo-method
  version: 1.0.0
evidence_template:
  id: evidence-template
  version: 1.2.0
source_commit: abcdef0123456789
input_fingerprint: sha256:ledgerhash
---
# Ledger
`;

const STRAY_MD = `---
type: Notes
id: stray-notes
status: stable
title: Not a ledger
---
# Notes
`;

const UNSTABLE_MD = `---
type: Evidence Ledger
id: ledger-draftish
status: provisional
title: Should not be pickable
method: { id: demo-method, version: 1.0.0 }
evidence_template: { id: evidence-template, version: 1.2.0 }
source_commit: abcdef0123456789
input_fingerprint: sha256:other
---
# Draftish
`;

const FILES: Record<string, string> = {
  "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md": LEDGER_MD,
  "methods/demo-method/evidence/ledgers/stray-notes.en.md": STRAY_MD,
  "methods/demo-method/evidence/ledgers/ledger-draftish.en.md": UNSTABLE_MD,
};

const DIRS: Record<string, { type: string; name: string; path: string }[]> = {
  methods: [
    { type: "dir", name: "demo-method", path: "methods/demo-method" },
    { type: "dir", name: "empty-method", path: "methods/empty-method" },
  ],
  "methods/demo-method/evidence/ledgers": [
    {
      type: "file",
      name: "ledger-k12-us.en.md",
      path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
    },
    {
      type: "file",
      name: "stray-notes.en.md",
      path: "methods/demo-method/evidence/ledgers/stray-notes.en.md",
    },
    {
      type: "file",
      name: "ledger-draftish.en.md",
      path: "methods/demo-method/evidence/ledgers/ledger-draftish.en.md",
    },
    {
      type: "file",
      name: "readme.md",
      path: "methods/demo-method/evidence/ledgers/readme.md",
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fileEntry(path: string) {
  return {
    type: "file",
    name: path.split("/").pop(),
    path,
    size: FILES[path].length,
    encoding: "base64",
    content: Buffer.from(FILES[path]).toString("base64"),
  };
}

const FINDING = `---
type: Finding
id: example-finding
lang: en
origin: native
status: provisional
title: Example
description: Example summary
authors:
  - name: Human author
claim: A falsifiable claim
confidence: low
research_questions:
  - resource: https://github.com/evaluchat/research/blob/main/theory/threshold-calibration.en.md
evidence_ledgers: []
---

# Example

## Evidence ledgers

## Interpretation
`;

describe("listMergedLedgers", () => {
  beforeEach(() => {
    process.env.VALERY_GITHUB_TOKEN = "test-token";
    vi.resetModules();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/contents/")) {
        return response({ message: "Not Found" }, 404);
      }
      expect(url).toContain("ref=main");
      const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
      if (FILES[path]) return response(fileEntry(path));
      if (DIRS[path]) return response(DIRS[path]);
      return response({ message: "Not Found" }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VALERY_GITHUB_TOKEN;
  });

  it("lists only merged Evidence Ledger artifacts on research main", async () => {
    const { listMergedLedgers } = await import("./ledger-picker");
    const ledgers = await listMergedLedgers();
    expect(ledgers).toEqual([
      {
        id: "ledger-k12-us",
        title: "Demo method — education level k12, country US",
        path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
        method: { id: "demo-method", version: "1.0.0" },
        evidence_template: { id: "evidence-template", version: "1.2.0" },
        source_commit: "abcdef0123456789",
        input_fingerprint: "sha256:ledgerhash",
      },
    ]);
  });

  it("filters stray non-ledger files in the ledgers directory", async () => {
    const { listMergedLedgers } = await import("./ledger-picker");
    const ids = (await listMergedLedgers()).map((ledger) => ledger.id);
    expect(ids).not.toContain("stray-notes");
    expect(ids).not.toContain("ledger-draftish");
  });

  it("does not resolve draft-branch content that is absent from main", async () => {
    const { listMergedLedgers } = await import("./ledger-picker");
    const ids = (await listMergedLedgers()).map((ledger) => ledger.id);
    expect(ids).not.toContain("ledger-only-on-draft");
  });

  it("surfaces a typed unavailable error when GitHub fails", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("timeout"));
    const { listMergedLedgers, LedgerPickerUnavailableError } = await import(
      "./ledger-picker"
    );
    await expect(listMergedLedgers()).rejects.toBeInstanceOf(
      LedgerPickerUnavailableError
    );
    await expect(listMergedLedgers()).rejects.toThrow(
      "Ledger picker unavailable"
    );
  });
});

describe("insertLedgerReference", () => {
  it("inserts a read-only card and an evidence_ledgers frontmatter entry", async () => {
    const { insertLedgerReference } = await import("./ledger-picker");
    const ledger = {
      id: "ledger-k12-us",
      title: "Demo method — education level k12, country US",
      path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
      method: { id: "demo-method", version: "1.0.0" },
      evidence_template: { id: "evidence-template", version: "1.2.0" },
      source_commit: "abcdef0123456789",
      input_fingerprint: "sha256:ledgerhash",
    };
    const next = insertLedgerReference(FINDING, ledger);
    const match = next.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    expect(match).toBeTruthy();
    const frontmatter = yaml.load(match![1], {
      schema: yaml.JSON_SCHEMA,
    }) as Record<string, unknown>;
    expect(frontmatter.research_questions).toEqual([
      {
        resource:
          "https://github.com/evaluchat/research/blob/main/theory/threshold-calibration.en.md",
      },
    ]);
    expect(frontmatter.evidence_ledgers).toEqual([
      {
        id: "ledger-k12-us",
        path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
        method: { id: "demo-method", version: "1.0.0" },
        evidence_template: { id: "evidence-template", version: "1.2.0" },
        source_commit: "abcdef0123456789",
        input_fingerprint: "sha256:ledgerhash",
      },
    ]);
    expect(next).toContain("ledger-k12-us");
    expect(next).toContain(
      "https://github.com/evaluchat/research/blob/main/methods/demo-method/evidence/ledgers/ledger-k12-us.en.md"
    );
    expect(next).toContain("sha256:ledgerhash");
    expect(next).toContain("abcdef0123456789");
  });

  it("does not duplicate an already cited ledger or rewrite research_questions", async () => {
    const { insertLedgerReference } = await import("./ledger-picker");
    const ledger = {
      id: "ledger-k12-us",
      title: "Demo method — education level k12, country US",
      path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
      method: { id: "demo-method", version: "1.0.0" },
      evidence_template: { id: "evidence-template", version: "1.2.0" },
      source_commit: "abcdef0123456789",
      input_fingerprint: "sha256:ledgerhash",
    };
    const once = insertLedgerReference(FINDING, ledger);
    const twice = insertLedgerReference(once, ledger);
    const match = twice.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const frontmatter = yaml.load(match![1], {
      schema: yaml.JSON_SCHEMA,
    }) as Record<string, unknown>;
    expect(frontmatter.evidence_ledgers).toHaveLength(1);
    expect(frontmatter.research_questions).toEqual([
      {
        resource:
          "https://github.com/evaluchat/research/blob/main/theory/threshold-calibration.en.md",
      },
    ]);
    expect(twice).toBe(once);
  });

  it("retains a pre-existing evidence_ledgers entry instead of rewriting the list", async () => {
    const { insertLedgerReference } = await import("./ledger-picker");
    const ledger = {
      id: "ledger-k12-us",
      title: "Demo method — education level k12, country US",
      path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
      method: { id: "demo-method", version: "1.0.0" },
      evidence_template: { id: "evidence-template", version: "1.2.0" },
      source_commit: "abcdef0123456789",
      input_fingerprint: "sha256:ledgerhash",
    };
    const source = FINDING.replace(
      "evidence_ledgers: []",
      `evidence_ledgers:
  - id: leftover-malformed
    extra: keep-me
    path: not-a-complete-citation`
    );
    const next = insertLedgerReference(source, ledger);
    const match = next.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    expect(match).toBeTruthy();
    const frontmatter = yaml.load(match![1], {
      schema: yaml.JSON_SCHEMA,
    }) as Record<string, unknown>;
    expect(frontmatter.evidence_ledgers).toEqual([
      {
        id: "leftover-malformed",
        extra: "keep-me",
        path: "not-a-complete-citation",
      },
      {
        id: "ledger-k12-us",
        path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
        method: { id: "demo-method", version: "1.0.0" },
        evidence_template: { id: "evidence-template", version: "1.2.0" },
        source_commit: "abcdef0123456789",
        input_fingerprint: "sha256:ledgerhash",
      },
    ]);
  });

  it("does not replace a non-array evidence_ledgers value", async () => {
    const { insertLedgerReference } = await import("./ledger-picker");
    const ledger = {
      id: "ledger-k12-us",
      title: "Demo method — education level k12, country US",
      path: "methods/demo-method/evidence/ledgers/ledger-k12-us.en.md",
      method: { id: "demo-method", version: "1.0.0" },
      evidence_template: { id: "evidence-template", version: "1.2.0" },
      source_commit: "abcdef0123456789",
      input_fingerprint: "sha256:ledgerhash",
    };
    const source = FINDING.replace(
      "evidence_ledgers: []",
      'evidence_ledgers: "keep-scalar"'
    );
    const next = insertLedgerReference(source, ledger);
    const match = next.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    expect(match).toBeTruthy();
    const frontmatter = yaml.load(match![1], {
      schema: yaml.JSON_SCHEMA,
    }) as Record<string, unknown>;
    expect(frontmatter.evidence_ledgers).toBe("keep-scalar");
    expect(next).toContain("<!-- ledger-ref:ledger-k12-us -->");
  });
});
