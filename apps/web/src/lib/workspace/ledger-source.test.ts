import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  countAcceptedEvidence,
  loadLedgerSource,
  resetLedgerSourceMemo,
} from "./ledger-source";

const sha256 = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const METHOD_MD = `---
type: Method
id: ledger-demo-method
lang: en
origin: native
status: stable
version: 1.0.0
evidence_template: evidence-template@1.0.0
---
# Ledger demo method
`;

const TEMPLATE_V100 = `---
type: Form Template
id: evidence-template
lang: en
origin: native
status: stable
version: 1.0.0
template_kind: form
applies_to_method: ledger-demo-method@1.0.0
fields:
  education_level:
    type: select
    options: [k12, tertiary, adult, other, unknown]
    required: true
    ledger_dimension: { role: context, control: multi-select }
    missing_semantics: unknown
  country_code:
    type: select
    options: [US, ZA, GB, NL, other, unknown]
    required: true
    ledger_dimension: { role: context, control: multi-select }
    missing_semantics: unknown
  collection_date:
    type: date
    required: true
    ledger_dimension: { role: collection, control: range }
    missing_semantics: unknown
  sample_size:
    type: number
    required: true
    ledger_dimension: { role: context, control: range }
    missing_semantics: -1
---
`;

const TEMPLATE_V090 = `---
type: Form Template
id: evidence-template
lang: en
origin: native
status: stable
version: 0.9.0
template_kind: form
applies_to_method: ledger-demo-method@1.0.0
fields:
  education_level:
    type: select
    options: [k12, tertiary, adult, other, unknown]
    required: true
    ledger_dimension: { role: context, control: multi-select }
    missing_semantics: unknown
  country_code:
    type: select
    options: [US, ZA, GB, NL, other, unknown]
    required: true
    ledger_dimension: { role: context, control: multi-select }
    missing_semantics: unknown
  sample_size:
    type: number
    required: true
    ledger_dimension: { role: context, control: range }
    missing_semantics: -1
---
`;

const packet = (
  slug: string,
  body: string,
  templateVersion: string,
  methodVersion = "1.0.0"
) => `---
type: Evidence Contribution
id: ${slug}
lang: en
origin: native
status: accepted
description: "Synthetic ${slug}"
method:
  id: ledger-demo-method
  version: ${methodVersion}
provenance:
  template_id: evidence-template
  template_version: "${templateVersion}"
field_values:
  education_level: k12
  country_code: US
  collection_date: 2024-03-01
  sample_size: 120
---

# ${slug}
`;

const KNOWN = packet("p-known", "", "1.0.0");
const UNKNOWN = `---
type: Evidence Contribution
id: p-unknown
lang: en
origin: native
status: accepted
description: "Synthetic p-unknown"
method:
  id: ledger-demo-method
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: "1.0.0"
field_values:
  education_level: unknown
  country_code: ZA
  collection_date: 2024-06-15
  sample_size: 95
---

# p-unknown
`;
const UNAVAILABLE = `---
type: Evidence Contribution
id: p-unavailable
lang: en
origin: native
status: accepted
description: "Synthetic p-unavailable"
method:
  id: ledger-demo-method
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: "0.9.0"
field_values:
  education_level: k12
  country_code: US
  sample_size: 88
---

# p-unavailable
`;
const EXCLUDED = `---
type: Evidence Contribution
id: p-excluded
lang: en
origin: native
status: draft
description: "Synthetic p-excluded"
method:
  id: ledger-demo-method
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: "1.0.0"
field_values:
  education_level: k12
  country_code: US
  collection_date: 2024-03-01
  sample_size: 120
---

# p-excluded
`;

const INVALID_DIM = `---
type: Evidence Contribution
id: p-invalid-dim
lang: en
origin: native
status: accepted
description: "Synthetic p-invalid-dim (education_level not in declared options)"
method:
  id: ledger-demo-method
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: "1.0.0"
field_values:
  education_level: doctorate
  country_code: US
  collection_date: 2024-03-01
  sample_size: 120
---

# p-invalid-dim
`;

const COMMIT_SHA = "deadbeef0123456789abcdef0123456789abcdef";

const FILES: Record<string, string> = {
  "methods/ledger-demo-method/ledger-demo-method.en.md": METHOD_MD,
  "methods/ledger-demo-method/evidence-template.en.md": TEMPLATE_V100,
  "methods/ledger-demo-method/evidence-templates/evidence-template.en.md":
    TEMPLATE_V090,
  "methods/ledger-demo-method/evidence/index.md": "# index\n",
  "methods/ledger-demo-method/evidence/p-known.en.md": KNOWN,
  "methods/ledger-demo-method/evidence/p-unknown.en.md": UNKNOWN,
  "methods/ledger-demo-method/evidence/p-unavailable.en.md": UNAVAILABLE,
  "methods/ledger-demo-method/evidence/p-excluded.en.md": EXCLUDED,
  "methods/ledger-demo-method/evidence/p-invalid-dim.en.md": INVALID_DIM,
};

const DIRS: Record<string, { name: string; path: string }[]> = {
  "methods/ledger-demo-method/evidence-templates": [
    {
      name: "evidence-template.en.md",
      path: "methods/ledger-demo-method/evidence-templates/evidence-template.en.md",
    },
  ],
  "methods/ledger-demo-method/evidence": [
    { name: "index.md", path: "methods/ledger-demo-method/evidence/index.md" },
    {
      name: "p-known.en.md",
      path: "methods/ledger-demo-method/evidence/p-known.en.md",
    },
    {
      name: "p-unknown.en.md",
      path: "methods/ledger-demo-method/evidence/p-unknown.en.md",
    },
    {
      name: "p-unavailable.en.md",
      path: "methods/ledger-demo-method/evidence/p-unavailable.en.md",
    },
    {
      name: "p-excluded.en.md",
      path: "methods/ledger-demo-method/evidence/p-excluded.en.md",
    },
    {
      name: "p-invalid-dim.en.md",
      path: "methods/ledger-demo-method/evidence/p-invalid-dim.en.md",
    },
  ],
};

const fileEntry = (path: string) => ({
  type: "file",
  name: path.split("/").pop(),
  path,
  size: FILES[path].length,
  encoding: "base64",
  content: Buffer.from(FILES[path]).toString("base64"),
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.VALERY_GITHUB_TOKEN = "test-token";
  resetLedgerSourceMemo();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/commits/main")) {
      return response({ sha: COMMIT_SHA });
    }
    const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
    if (FILES[path]) return response(fileEntry(path));
    if (DIRS[path]) {
      return response(
        DIRS[path].map((entry) => ({
          type: "file",
          name: entry.name,
          path: entry.path,
          size: FILES[entry.path].length,
        }))
      );
    }
    return new Response('{"message":"Not Found"}', { status: 404 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.VALERY_GITHUB_TOKEN;
});

describe("loadLedgerSource", () => {
  it("returns method + current template + source commit", async () => {
    const source = await loadLedgerSource("ledger-demo-method", "1.0.0");
    expect(source.method.id).toBe("ledger-demo-method");
    expect(source.method.version).toBe("1.0.0");
    expect(source.template.version).toBe("1.0.0");
    expect(source.template.dimensions.map((d) => d.id).sort()).toEqual(
      [
        "collection_date",
        "country_code",
        "education_level",
        "sample_size",
      ].sort()
    );
    expect(source.sourceCommit).toBe(COMMIT_SHA);
  });

  it("preserves known/unknown/unavailable contributions and excludes index.md", async () => {
    const source = await loadLedgerSource("ledger-demo-method", "1.0.0");
    const paths = source.contributions.map((c) => c.path);
    expect(paths).not.toContain("methods/ledger-demo-method/evidence/index.md");
    expect(paths).toHaveLength(5);

    const known = source.contributions.find((c) =>
      c.path.endsWith("p-known.en.md")
    )!;
    expect(known.bucket).toBe("Included");
    expect(known.sourceHash).toBe(sha256(KNOWN));
    expect(known.dimensionValues.education_level).toEqual({
      status: "recorded",
      value: "k12",
    });

    const unknown = source.contributions.find((c) =>
      c.path.endsWith("p-unknown.en.md")
    )!;
    expect(unknown.dimensionValues.education_level).toEqual({
      status: "unknown",
      value: "unknown",
    });

    const unavailable = source.contributions.find((c) =>
      c.path.endsWith("p-unavailable.en.md")
    )!;
    expect(unavailable.templateVersion).toBe("0.9.0");
    expect(unavailable.dimensionValues.collection_date).toBeUndefined();
    expect(unavailable.dimensionValues.sample_size).toEqual({
      status: "recorded",
      value: 88,
    });
  });

  it("excludes non-accepted packets with a reason", async () => {
    const source = await loadLedgerSource("ledger-demo-method", "1.0.0");
    const excluded = source.contributions.find((c) =>
      c.path.endsWith("p-excluded.en.md")
    )!;
    expect(excluded.bucket).toBe("Resolver exclusion");
    expect(excluded.exclusionReason).toBe("not accepted");
    expect(excluded.sourceHash).toBe(sha256(EXCLUDED));
  });

  it("keeps a packet with an invalid dimension, omitting only that dimension", async () => {
    // Mirrors the file-backed resolver: one invalid value does not drop the
    // packet. The invalid dimension is omitted from dimensionValues and
    // recorded in invalidDimensions for later filter-time classification.
    const source = await loadLedgerSource("ledger-demo-method", "1.0.0");
    const packet = source.contributions.find((c) =>
      c.path.endsWith("p-invalid-dim.en.md")
    )!;
    expect(packet.bucket).toBe("Included");
    expect(packet.exclusionReason).toBeUndefined();
    expect(packet.dimensionValues.education_level).toBeUndefined();
    expect(packet.invalidDimensions).toContain("education_level");
    expect(packet.dimensionValues.country_code).toEqual({
      status: "recorded",
      value: "US",
    });
  });

  it("counts only accepted packets", async () => {
    expect(await countAcceptedEvidence("ledger-demo-method")).toBe(4);
  });
});
