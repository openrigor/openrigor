import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCatalog,
  mergeCatalogs,
  parseTemplate,
} from "./generate-template-catalog";

const temporaryDirectories: string[] = [];

function templateDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evaluchat-templates-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeTemplate(
  directory: string,
  name: string,
  body: string,
  fields = "",
) {
  const source = `---
type: Form Template
id: example-form
version: 1.0.0
locale: en
title: Example form
description: A test form.
template_kind: form
${fields}
assistant:
  guidance: Reviewed guidance.
---

${body}
`;
  const file = path.join(directory, name);
  fs.writeFileSync(file, source);
  return file;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("template catalog generator", () => {
  it("accepts all initial field types and emits rendering metadata", () => {
    const directory = templateDirectory();
    const file = writeTemplate(
      directory,
      "form.md",
      "# {{title}}\n{{notes}}\n{{count}}\n{{due}}\n{{mode}}\n{{people}}",
      `fields:
  title:
    label: Title
    type: text
    required: true
    max_length: 20
    display_chars: 30
  notes:
    label: Notes
    type: textarea
    display_lines: 4
  count:
    label: Count
    type: number
    min: 1
    max: 10
  due:
    label: Due
    type: date
  mode:
    label: Mode
    type: select
    options: [Essay, Report]
  people:
    label: People
    type: roster
`,
    );
    const entry = parseTemplate(file);
    expect(entry.templateKind).toBe("form");
    if (entry.templateKind !== "form") return;
    expect(entry.fields.title.displayChars).toBe(30);
    expect(entry.fields.notes.displayLines).toBe(4);
    expect(entry.fields.mode.options).toEqual(["Essay", "Report"]);
  });

  it("rejects unknown, malformed, and unused placeholders", () => {
    const directory = templateDirectory();
    const unknown = writeTemplate(
      directory,
      "unknown.md",
      "{{missing}}",
      `fields:
  title:
    label: Title
    type: text
`,
    );
    expect(() => parseTemplate(unknown)).toThrow("Unknown form placeholder");

    const malformed = writeTemplate(
      directory,
      "malformed.md",
      "{{title} }",
      `fields:
  title:
    label: Title
    type: text
`,
    );
    expect(() => parseTemplate(malformed)).toThrow(
      "Malformed form placeholder",
    );

    const unused = writeTemplate(
      directory,
      "unused.md",
      "{{title}}",
      `fields:
  title:
    label: Title
    type: text
  notes:
    label: Notes
    type: textarea
`,
    );
    expect(() => parseTemplate(unused)).toThrow("unused");
  });

  it("rejects invalid constraints, duplicate options, and duplicate ids", () => {
    const directory = templateDirectory();
    const invalid = writeTemplate(
      directory,
      "invalid.md",
      "{{mode}}",
      `fields:
  mode:
    label: Mode
    type: select
    options: [Essay, Essay]
`,
    );
    expect(() => parseTemplate(invalid)).toThrow("Duplicate select options");

    const invalidRange = writeTemplate(
      directory,
      "range.md",
      "{{count}}",
      `fields:
  count:
    label: Count
    type: number
    min: 10
    max: 1
`,
    );
    expect(() => parseTemplate(invalidRange)).toThrow("min greater than max");

    const duplicateDirectory = templateDirectory();
    writeTemplate(
      duplicateDirectory,
      "duplicate.md",
      "{{title}}",
      `fields:
  title:
    label: Title
    type: text
`,
    );
    writeTemplate(
      duplicateDirectory,
      "duplicate-2.md",
      "{{title}}",
      `fields:
  title:
    label: Title
    type: text
`,
    );
    expect(() => buildCatalog(duplicateDirectory)).toThrow(
      "Duplicate template id",
    );
  });

  it("omits excluded ids when building a knowledge catalog", () => {
    const directory = templateDirectory();
    writeTemplate(
      directory,
      "form.md",
      "{{title}}",
      `fields:
  title:
    label: Title
    type: text
`,
    );
    fs.writeFileSync(
      path.join(directory, "starter.md"),
      `---
type: Markdown Template
id: getting-started
version: 1.0.0
locale: en
title: Getting Started
description: A starter.
template_kind: markdown
assistant:
  guidance: Reviewed guidance.
---

# Hello
`,
    );
    const catalog = buildCatalog(directory, { excludeIds: ["example-form"] });
    expect(catalog.templates.map((entry) => entry.id)).toEqual([
      "getting-started",
    ]);
  });

  it("merges local workspace markdown starters by id", () => {
    const knowledge = templateDirectory();
    fs.writeFileSync(
      path.join(knowledge, "starter.md"),
      `---
type: Markdown Template
id: getting-started
version: 1.0.0
locale: en
title: Getting Started
description: A starter.
template_kind: markdown
assistant:
  guidance: Reviewed guidance.
---

# Hello
`,
    );
    const workspace = templateDirectory();
    fs.writeFileSync(
      path.join(workspace, "finding-starter.md"),
      `---
type: Markdown Template
id: finding-starter
version: 1.0.0
locale: en
title: Finding starter
description: Cite published ledgers.
template_kind: markdown
assistant:
  guidance: Do not suggest a claim.
---

---
type: Finding
research_questions: []
evidence_ledgers: []
---

# Title
`,
    );
    const merged = mergeCatalogs(
      buildCatalog(knowledge),
      buildCatalog(workspace, { sourcePathPrefix: "templates/workspace" }),
    );
    expect(merged.templates.map((entry) => entry.id)).toEqual([
      "finding-starter",
      "getting-started",
    ]);
    const finding = merged.templates.find(
      (entry) => entry.id === "finding-starter",
    );
    expect(finding?.templateKind).toBe("markdown");
    if (finding?.templateKind !== "markdown") return;
    expect(finding.initialMarkdown).toContain("type: Finding");
    expect(finding.sourcePath).toBe("templates/workspace/finding-starter.md");
  });
});
