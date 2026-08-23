import { describe, it, expect } from "vitest";
import {
  buildSectionIndex,
  insertAfterSection,
  resolveSectionHint,
  spliceSection,
  validateSectionSpan,
} from "./markdown-sections.js";

const SAMPLE = `# Title

## 4 Methods

Intro to methods.

### 4.5 Formative assessment


Formative assessment emphasises feedback loops.

### 5.1 Results overview

Results go here.

## 6 Conclusion

Done.
`;

describe("buildSectionIndex", () => {
  it("indexes heading spans with end at next same-or-higher heading", () => {
    const index = buildSectionIndex(SAMPLE);
    const s45 = index.find((s) => s.headingText === "4.5 Formative assessment");
    const s51 = index.find((s) => s.headingText === "5.1 Results overview");
    expect(s45).toBeDefined();
    expect(s51).toBeDefined();
    if (!s45 || !s51) return;

    expect(SAMPLE.slice(s45.start, s45.start + 3)).toBe("###");
    expect(s45.end).toBe(s51.start);
    expect(SAMPLE.slice(s45.start, s45.end)).toContain(
      "Formative assessment emphasises"
    );
    expect(SAMPLE.slice(s45.start, s45.end)).not.toContain("Results go here");
  });

  it("handles whitespace-normalized docs (triple vs double newline)", () => {
    const triple =
      "### 4.5 Formative assessment\n\n\nFormative assessment emphasises feedback.\n\n### 5.1 Next\n\nBody.\n";
    const double =
      "### 4.5 Formative assessment\n\nFormative assessment emphasises feedback.\n\n### 5.1 Next\n\nBody.\n";

    const indexTriple = buildSectionIndex(triple);
    const indexDouble = buildSectionIndex(double);

    expect(indexTriple).toHaveLength(2);
    expect(indexDouble).toHaveLength(2);
    expect(indexTriple[0].headingText).toBe("4.5 Formative assessment");
    expect(indexDouble[0].headingText).toBe("4.5 Formative assessment");

    const bodyTriple = triple.slice(indexTriple[0].start, indexTriple[0].end);
    const bodyDouble = double.slice(indexDouble[0].start, indexDouble[0].end);
    expect(bodyTriple.replace(/\n+/g, "\n")).toBe(
      bodyDouble.replace(/\n+/g, "\n")
    );
  });

  it("ends parent section at next same-level heading (skipping children)", () => {
    const index = buildSectionIndex(SAMPLE);
    const methods = index.find((s) => s.headingText === "4 Methods");
    const conclusion = index.find((s) => s.headingText === "6 Conclusion");
    expect(methods).toBeDefined();
    expect(conclusion).toBeDefined();
    if (!methods || !conclusion) return;
    expect(methods.end).toBe(conclusion.start);
    expect(SAMPLE.slice(methods.start, methods.end)).toContain("4.5 Formative");
  });
});

describe("resolveSectionHint", () => {
  it("resolves exact heading match", () => {
    const index = buildSectionIndex(SAMPLE);
    const result = resolveSectionHint(
      index,
      "4.5 Formative assessment",
      SAMPLE
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.section.headingText).toBe("4.5 Formative assessment");
    }
  });

  it("resolves fuzzy heading + first-words hint", () => {
    const index = buildSectionIndex(SAMPLE);
    const result = resolveSectionHint(
      index,
      "4.5 Formative assessment Formative assessment emphasises",
      SAMPLE
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.section.headingText).toBe("4.5 Formative assessment");
    }
  });

  it("resolves slight typos via Levenshtein", () => {
    const index = buildSectionIndex(SAMPLE);
    const result = resolveSectionHint(index, "4.5 Formativ assessment", SAMPLE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.section.headingText).toBe("4.5 Formative assessment");
    }
  });

  it("returns ambiguous for duplicate headings", () => {
    const dup = `## Intro\n\nA.\n\n## Middle\n\nB.\n\n## Intro\n\nC.\n`;
    const index = buildSectionIndex(dup);
    const result = resolveSectionHint(index, "Intro", dup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ambiguous");
      expect(result.candidates?.length).toBe(2);
    }
  });

  it("returns no_match for unrelated hint", () => {
    const index = buildSectionIndex(SAMPLE);
    const result = resolveSectionHint(index, "Appendix Zebra Quokka", SAMPLE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_match");
    }
  });
});

describe("spliceSection", () => {
  it("replaces a section by offsets", () => {
    const index = buildSectionIndex(SAMPLE);
    const s45 = index.find((s) => s.headingText === "4.5 Formative assessment");
    expect(s45).toBeDefined();
    if (!s45) return;

    const replacement =
      "### 4.5 Formative assessment\n\nUpdated formative text.\n";
    const result = spliceSection(SAMPLE, s45, replacement);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain("Updated formative text.");
    expect(result.markdown).toContain("### 5.1 Results overview");
    expect(result.markdown).not.toContain(
      "Formative assessment emphasises feedback loops."
    );
  });

  it("keeps the replaced span's blank-line run before the next heading", () => {
    // Live dev run left "...how they revise.\n## 5 Implementation".
    const doc =
      "### 4.5 Formative\n\n\nFeedback during learning.\n\n\n## 5 Implementation\n\n\nRollout.\n";
    const index = buildSectionIndex(doc);
    const s45 = index.find((s) => s.headingText === "4.5 Formative");
    expect(s45).toBeDefined();
    if (!s45) return;

    const result = spliceSection(
      doc,
      s45,
      "### 4.5 Formative\n\nFeedback during learning. Weekly quizzes help.\n"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain(
      "Weekly quizzes help.\n\n\n## 5 Implementation"
    );
  });

  it("pins the replacement heading to the original level", () => {
    // Live dev run returned "## 5.1 Rollout" for an h3 section, reparenting it.
    const index = buildSectionIndex(SAMPLE);
    const s51 = index.find((s) => s.headingText === "5.1 Results overview");
    expect(s51).toBeDefined();
    if (!s51) return;

    const result = spliceSection(
      SAMPLE,
      s51,
      "## 5.1 Results overview\n\nRewritten results.\n"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain("### 5.1 Results overview");
    expect(result.markdown).not.toMatch(/^## 5\.1 Results overview$/m);
  });

  it("keeps a trailing newline when replacing the final section", () => {
    const doc = "## Only\n\nBody.\n";
    const index = buildSectionIndex(doc);
    const result = spliceSection(doc, index[0], "## Only\n\nNew body.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toBe("## Only\n\nNew body.\n");
  });

  it("validation rejects stale offsets", () => {
    const index = buildSectionIndex(SAMPLE);
    const s45 = index.find((s) => s.headingText === "4.5 Formative assessment");
    expect(s45).toBeDefined();
    if (!s45) return;

    const stale = { ...s45, start: s45.start + 5 };
    const result = spliceSection(SAMPLE, stale, "### x\n\ny\n");
    expect(result.ok).toBe(false);
  });

  it("validateSectionSpan rejects wrong heading text", () => {
    const index = buildSectionIndex(SAMPLE);
    const s45 = index.find((s) => s.headingText === "4.5 Formative assessment");
    expect(s45).toBeDefined();
    if (!s45) return;
    const bad = { ...s45, headingText: "Wrong heading" };
    expect(validateSectionSpan(SAMPLE, bad).ok).toBe(false);
  });
});

describe("insertAfterSection", () => {
  it("places new content after section end (add 4.6 after 4.5)", () => {
    const index = buildSectionIndex(SAMPLE);
    const s45 = index.find((s) => s.headingText === "4.5 Formative assessment");
    expect(s45).toBeDefined();
    if (!s45) return;

    const newSection =
      "### 4.6 New point\n\nSomething that works well there.\n";
    const result = insertAfterSection(SAMPLE, s45, newSection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pos46 = result.markdown.indexOf("### 4.6 New point");
    const pos51 = result.markdown.indexOf("### 5.1 Results overview");
    const pos45 = result.markdown.indexOf("### 4.5 Formative assessment");
    expect(pos45).toBeGreaterThan(-1);
    expect(pos46).toBeGreaterThan(pos45);
    expect(pos51).toBeGreaterThan(pos46);
    expect(result.markdown).toContain("Something that works well there.");
  });

  it("keeps the document's blank-line run around the inserted section", () => {
    // BlockNote serializes blocks with a triple-newline run; a live insert
    // collapsed it and left "judgement.\n## 5 Implementation".
    const doc =
      "### 4.5 Formative\n\n\nFeedback during learning.\n\n\n## 5 Implementation\n\n\nRollout.\n";
    const index = buildSectionIndex(doc);
    const s45 = index.find((s) => s.headingText === "4.5 Formative");
    expect(s45).toBeDefined();
    if (!s45) return;

    const result = insertAfterSection(
      doc,
      s45,
      "### 4.6 Self-assessment\n\nJudge your own drafts."
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.markdown).toContain(
      "Judge your own drafts.\n\n\n## 5 Implementation"
    );
    expect(result.markdown).toContain(
      "Feedback during learning.\n\n\n### 4.6 Self-assessment"
    );
  });

  it("appends at EOF with a trailing newline", () => {
    const doc = "## Only\n\nBody.\n";
    const index = buildSectionIndex(doc);
    const result = insertAfterSection(doc, index[0], "## Next\n\nMore.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown.endsWith("More.\n")).toBe(true);
    expect(result.markdown).toContain("Body.\n\n## Next");
  });
});
