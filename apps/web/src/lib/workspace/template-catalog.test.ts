import { describe, expect, it } from "vitest";
import {
  getTemplateById,
  getTemplateCatalog,
  isSelectableTemplate,
  searchTemplates,
} from "./template-catalog";

describe("workspace template catalog", () => {
  it("loads an immutable revision with the Getting Started template", () => {
    const catalog = getTemplateCatalog();
    expect(catalog.catalogRevision).toMatch(/^sha256:/);
    expect(getTemplateById("evaluchat-getting-started")?.title).toBe(
      "Getting Started"
    );
    expect(
      getTemplateCatalog().templates.map((template) => template.id)
    ).toEqual(["evaluchat-getting-started", "finding-starter"]);
    expect(getTemplateById("evaluchat-assignment-brief")?.templateKind).toBe(
      "form"
    );
    expect(isSelectableTemplate("evaluchat-getting-started")).toBe(true);
    expect(isSelectableTemplate("finding-starter")).toBe(true);
    expect(isSelectableTemplate("evaluchat-assignment-brief")).toBe(false);
  });

  it("exposes a markdown Finding starter with the light-authoring body", () => {
    const template = getTemplateById("finding-starter");
    expect(template?.templateKind).toBe("markdown");
    expect(template?.title).toBe("Finding starter");
    if (template?.templateKind !== "markdown") return;
    expect(template.initialMarkdown).toMatch(/^---\s/);
    expect(template.initialMarkdown).toContain("type: Finding");
    expect(template.initialMarkdown).toContain("research_questions: []");
    expect(template.initialMarkdown).toContain("evidence_ledgers: []");
    expect(template.initialMarkdown).toContain("## Claim");
    expect(template.initialMarkdown).toContain("## Research questions");
    expect(template.initialMarkdown).toContain("## Evidence ledgers");
    expect(template.initialMarkdown).toContain("## Declared scope");
    expect(template.initialMarkdown).toContain("## Interpretation");
    expect(template.initialMarkdown).toContain(
      "## Counterevidence and alternative explanations"
    );
    expect(template.initialMarkdown).toContain("## Limitations");
    expect(template.initialMarkdown).toMatch(
      /picker fills `?evidence_ledgers`?/i
    );
    expect(template.initialMarkdown).toMatch(
      /human fills `?research_questions`? independently/i
    );
    expect(template.assistantGuidance.toLowerCase()).toMatch(
      /do not suggest a claim/
    );
    expect(template.assistantGuidance).toContain(
      "Do not suggest a claim, recommend a confidence tier"
    );
  });

  it("searches template id, title, and description", () => {
    expect(searchTemplates("help")).toHaveLength(1);
    expect(searchTemplates("finding")).toEqual([
      expect.objectContaining({ id: "finding-starter" }),
    ]);
    expect(searchTemplates("does-not-exist")).toEqual([]);
    expect(searchTemplates("assignment")).toEqual([]);
    expect(searchTemplates("").map((template) => template.id)).toEqual([
      "evaluchat-getting-started",
      "finding-starter",
    ]);
  });

  it("returns the reviewed form fields from the platform catalog snapshot", () => {
    const template = getTemplateById("evaluchat-assignment-brief");
    expect(template?.templateKind).toBe("form");
    if (template?.templateKind !== "form") return;
    expect(template.sourcePath).toBe(
      "templates/platform/evaluchat-assignment-brief.en.md"
    );
    expect(template.fields.title.maxLength).toBe(120);
    expect(template.fields.participants.type).toBe("roster");
    expect(template.layoutMarkdown).toContain("{{essay_prompt}}");
  });
});
