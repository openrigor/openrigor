import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildApparatusMirror,
  assertMethodEvidenceTemplatesBound,
  assertMethodRunBriefsBound,
} from "./generate-apparatus-mirror";

const temporaryDirectories: string[] = [];

function researchRoot(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evaluchat-research-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeMethod(root: string, id: string, frontmatter: string): string {
  const directory = path.join(root, "methods", id);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.en.md`);
  fs.writeFileSync(
    file,
    `---
${frontmatter}
---

# ${id}
`,
  );
  return file;
}

function writeEvidenceTemplate(
  root: string,
  id: string,
  frontmatter = evidenceTemplateFrontmatter,
  body = "# Concluded-run evidence\n\n{{observations}}\n",
): string {
  const file = path.join(root, "methods", id, "evidence-template.en.md");
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}`);
  return file;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const methodFrontmatter = `type: Method
id: ai-assisted-essay
lang: en
version: 0.1.0
min_canvas_version: "0.5.9"
title: AI-assisted essay
description: Constrained dialogic drafting.
levers:
  - id: tracking
    type: boolean
    default: true
    effect: Process telemetry.
run_brief_template: evaluchat-assignment-brief@1.0.0
evidence_template: evidence-template@1.0.0
platform:
  participant_invitations: required
  review_surface: essay-process-review
profiles:
  - id: canonical-constrained-dialogue
    version: 1.0.0
    immutable: true
    configuration: { tracking: true }`;

const evidenceTemplateFrontmatter = `type: Form Template
id: evidence-template
version: 1.0.0
template_kind: form
applies_to_method: ai-assisted-essay@0.1.0
default_stage: documented-experience
fields:
  observations:
    type: textarea
  threshold_fit:
    type: select
    options: [about-right]
assistant:
  guidance: Keep observations factual.`;

describe("apparatus mirror generator", () => {
  it("reads methods/<id>/ and maps levers to knobs", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(root, "ai-assisted-essay");

    const artifact = buildApparatusMirror(root);
    const entry = artifact.apparatuses[0];

    expect(entry.id).toBe("ai-assisted-essay");
    expect(entry.knobs).toEqual([
      {
        id: "tracking",
        type: "boolean",
        default: true,
        effect: "Process telemetry.",
      },
    ]);
    expect(entry).not.toHaveProperty("levers");
    expect(entry.run_brief_template).toBe("evaluchat-assignment-brief@1.0.0");
    expect(entry.evidence_template).toEqual({
      id: "evidence-template",
      version: "1.0.0",
      defaultStage: "documented-experience",
      fields: {
        observations: { type: "textarea" },
        threshold_fit: { type: "select", options: ["about-right"] },
      },
      layoutMarkdown: "# Concluded-run evidence\n\n{{observations}}\n",
      guidance: "Keep observations factual.",
      sourcePath: "methods/ai-assisted-essay/evidence-template.en.md",
    });
    expect(() =>
      assertMethodEvidenceTemplatesBound(artifact.apparatuses),
    ).not.toThrow();
    expect(entry.platform).toEqual({
      participant_invitations: "required",
      review_surface: "essay-process-review",
    });
  });

  it("mirrors declared ledger dimensions and missing semantics", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      root,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace(
        "    options: [about-right]",
        `    options: [about-right, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select`,
      ),
    );

    const artifact = buildApparatusMirror(root);
    expect(artifact.apparatuses[0].evidence_template).toMatchObject({
      fields: {
        threshold_fit: {
          type: "select",
          options: ["about-right", "unknown"],
          missing_semantics: "unknown",
          ledger_dimension: { role: "context", control: "multi-select" },
        },
      },
    });
  });

  it("does not read the retired apparatus/ path", () => {
    const root = researchRoot();
    const retired = path.join(
      root,
      "apparatus",
      "ai-assisted-essay",
      "ai-assisted-essay.en.md",
    );
    fs.mkdirSync(path.dirname(retired), { recursive: true });
    fs.writeFileSync(
      retired,
      `---
id: ai-assisted-essay
version: 0.1.0
min_canvas_version: "0.5.9"
title: Retired apparatus
knobs:
  - id: tracking
    type: boolean
    default: true
---
`,
    );

    expect(() => buildApparatusMirror(root)).toThrow(/methods/);
  });

  it("rejects a builtin method without an evidence template", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);

    expect(() => buildApparatusMirror(root)).toThrow(
      /evidence_template file not found/,
    );
  });

  it("rejects a builtin method without an evidence template pointer", () => {
    const root = researchRoot();
    writeMethod(
      root,
      "ai-assisted-essay",
      methodFrontmatter.replace(
        "evidence_template: evidence-template@1.0.0\n",
        "",
      ),
    );
    writeEvidenceTemplate(root, "ai-assisted-essay");

    expect(() => buildApparatusMirror(root)).toThrow(
      /missing evidence_template/,
    );
  });

  it("rejects generated entries without an evidence template", () => {
    expect(() =>
      assertMethodEvidenceTemplatesBound([{ id: "ai-assisted-essay" }]),
    ).toThrow(/missing evidence_template/);
  });

  it("rejects evidence templates with contract violations", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      root,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace(
        "applies_to_method: ai-assisted-essay@0.1.0",
        "applies_to_method: another-method@0.1.0",
      ),
    );

    expect(() => buildApparatusMirror(root)).toThrow(
      /evidence_template applies_to_method/,
    );

    const invalidFieldTypeRoot = researchRoot();
    writeMethod(invalidFieldTypeRoot, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      invalidFieldTypeRoot,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace("type: textarea", "type: checkbox"),
    );

    expect(() => buildApparatusMirror(invalidFieldTypeRoot)).toThrow(
      /evidence_template fields\.observations\.type/,
    );
  });

  it("rejects select evidence template fields with non-string options", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      root,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace(
        "options: [about-right]",
        "options: [about-right, 1]",
      ),
    );

    expect(() => buildApparatusMirror(root)).toThrow(
      /evidence_template fields\.threshold_fit\.options must contain only strings/,
    );
  });

  it("rejects invalid ledger dimension declarations", () => {
    const cases = [
      {
        replacement: `type: textarea
    ledger_dimension:
      role: context
      control: multi-select`,
        expected:
          /ledger_dimension is only allowed on select, date, and number/,
      },
      {
        replacement: `type: select
    options: [about-right]
    ledger_dimension:
      role: outcome
      control: multi-select`,
        expected:
          /ledger_dimension\.role must be one of context, method, collection/,
      },
      {
        replacement: `type: select
    options: [about-right]
    ledger_dimension:
      role: context
      control: range`,
        expected:
          /ledger_dimension\.control must be multi-select for select fields/,
      },
      {
        replacement: `type: number
    options: [1, 2]
    ledger_dimension:
      role: collection
      control: range`,
        expected: /options must not be present for range controls/,
      },
    ];

    for (const testCase of cases) {
      const root = researchRoot();
      writeMethod(root, "ai-assisted-essay", methodFrontmatter);
      writeEvidenceTemplate(
        root,
        "ai-assisted-essay",
        evidenceTemplateFrontmatter.replace(
          "type: textarea",
          testCase.replacement,
        ),
      );

      expect(() => buildApparatusMirror(root)).toThrow(testCase.expected);
    }
  });

  it("rejects an evidence template with a non-string default_stage", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      root,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace(
        "default_stage: documented-experience",
        "default_stage: 1",
      ),
    );

    expect(() => buildApparatusMirror(root)).toThrow(
      /evidence_template default_stage must be a string/,
    );
  });

  it("rejects an evidence template with non-string assistant guidance", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);
    writeEvidenceTemplate(
      root,
      "ai-assisted-essay",
      evidenceTemplateFrontmatter.replace(
        "guidance: Keep observations factual.",
        "guidance: [Keep observations factual.]",
      ),
    );

    expect(() => buildApparatusMirror(root)).toThrow(
      /evidence_template assistant\.guidance must be a string/,
    );
  });

  it("rejects a builtin method whose source id differs from its directory id", () => {
    const root = researchRoot();
    writeMethod(
      root,
      "ai-assisted-essay",
      methodFrontmatter.replace("id: ai-assisted-essay", "id: another-method"),
    );

    expect(() => buildApparatusMirror(root)).toThrow(
      /must declare id ai-assisted-essay/,
    );
  });

  it("rejects a builtin method whose run brief is not a platform Form template", () => {
    expect(() =>
      assertMethodRunBriefsBound(
        [
          {
            id: "ai-assisted-essay",
            run_brief_template: "missing-brief@1.0.0",
          },
        ],
        [
          {
            id: "evaluchat-assignment-brief",
            version: "1.0.0",
            templateKind: "form",
          },
        ],
      ),
    ).toThrow(/not a platform Form template/);

    expect(() =>
      assertMethodRunBriefsBound(
        [
          {
            id: "ai-assisted-essay",
            run_brief_template: "evaluchat-assignment-brief@9.9.9",
          },
        ],
        [
          {
            id: "evaluchat-assignment-brief",
            version: "1.0.0",
            templateKind: "form",
          },
        ],
      ),
    ).toThrow(/does not match platform version/);
  });
});
