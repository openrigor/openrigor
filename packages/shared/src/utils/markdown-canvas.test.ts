import { describe, it, expect } from "vitest";
import {
  buildTextHighlight,
  findBlockInMarkdown,
  isPlausibleFullArtifactRewrite,
  normalizeCanvasMarkdown,
  reconcileTextHighlight,
} from "./markdown-canvas.js";

describe("normalizeCanvasMarkdown", () => {
  it("normalizes escaped newlines", () => {
    expect(normalizeCanvasMarkdown("line1\\\\\\nline2")).toBe("line1\\nline2");
  });

  it("normalizes CRLF", () => {
    expect(normalizeCanvasMarkdown("a\r\nb")).toBe("a\nb");
  });
});

describe("findBlockInMarkdown", () => {
  it("finds exact block", () => {
    const full = "# Title\n\nThe quick brown fox";
    expect(findBlockInMarkdown(full, "The quick brown fox")).toBe(
      "The quick brown fox"
    );
  });

  it("finds block with trailing newline mismatch", () => {
    const full = "The quick brown fox\n\nNext para";
    expect(findBlockInMarkdown(full, "The quick brown fox\n")).toBe(
      "The quick brown fox\n"
    );
  });

  it("returns null when block is absent", () => {
    expect(findBlockInMarkdown("hello", "world")).toBeNull();
  });
});

describe("buildTextHighlight", () => {
  it("builds highlight when block is found", () => {
    const result = buildTextHighlight(
      "The quick brown fox",
      "The quick brown fox",
      "brown"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.highlight.fullMarkdown.includes(result.highlight.markdownBlock)
      ).toBe(true);
      expect(result.highlight.selectedText).toBe("brown");
    }
  });

  it("fails when block is not in document", () => {
    const result = buildTextHighlight("hello", "missing", "mis");
    expect(result).toEqual({ ok: false, error: "block_not_found" });
  });
});

describe("reconcileTextHighlight", () => {
  it("re-resolves block against updated full markdown", () => {
    const original = buildTextHighlight(
      "**Bold** word here",
      "**Bold** word here",
      "word"
    );
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const updated = reconcileTextHighlight(
      original.highlight,
      "**Bold** word here\n\nNew paragraph"
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.highlight.fullMarkdown).toContain("New paragraph");
    }
  });
});

describe("isPlausibleFullArtifactRewrite", () => {
  const longDoc = `# Title

## Section 1

${"Paragraph content. ".repeat(200)}

## Section 2

${"More content here. ".repeat(200)}`;

  it("rejects short chat reply replacing a long document", () => {
    const chatReply =
      "That's a great point about language skills! I've noted your idea about CAMDLE novelty.";
    expect(isPlausibleFullArtifactRewrite(longDoc, chatReply)).toBe(false);
  });

  it("accepts a full-length rewrite", () => {
    const rewrite = longDoc.replace(
      "Paragraph content.",
      "Updated paragraph content."
    );
    expect(isPlausibleFullArtifactRewrite(longDoc, rewrite)).toBe(true);
  });

  it("rejects empty proposed content", () => {
    expect(isPlausibleFullArtifactRewrite(longDoc, "")).toBe(false);
  });

  it("is lenient for short documents", () => {
    const short = "## Intro\n\nA few sentences about the thesis.";
    const updated =
      "## Intro\n\nA few sentences about language skills and LLM negotiation.";
    expect(isPlausibleFullArtifactRewrite(short, updated)).toBe(true);
  });
});
