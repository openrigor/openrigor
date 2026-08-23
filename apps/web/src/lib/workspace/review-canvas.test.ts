import { describe, it, expect } from "vitest";
import { selectReviewCanvasMarkdown } from "./review-canvas";

describe("selectReviewCanvasMarkdown", () => {
  it("renders the drafted content at currentIndex (AI-generated paragraph)", () => {
    const artifact = {
      currentIndex: 2,
      contents: [
        { index: 1, type: "text", title: "Essay", fullMarkdown: "" },
        {
          index: 2,
          type: "text",
          title: "Opening Paragraph",
          fullMarkdown:
            "The protagonist hesitates before small acts of kindness.",
        },
      ],
    };
    expect(selectReviewCanvasMarkdown(artifact)).toMatch(/hesitates/);
  });

  it("falls back to the first non-empty text content when currentIndex is empty", () => {
    const artifact = {
      currentIndex: 1,
      contents: [
        { index: 1, type: "text", title: "Essay", fullMarkdown: "" },
        {
          index: 2,
          type: "text",
          title: "Opening Paragraph",
          fullMarkdown: "Actual draft content.",
        },
      ],
    };
    expect(selectReviewCanvasMarkdown(artifact)).toBe("Actual draft content.");
  });

  it("returns the first text content for a single-content canvas", () => {
    const artifact = {
      currentIndex: 1,
      contents: [
        {
          index: 1,
          type: "text",
          title: "Essay",
          fullMarkdown: "Typed draft.",
        },
      ],
    };
    expect(selectReviewCanvasMarkdown(artifact)).toBe("Typed draft.");
  });

  it("returns empty when there is no artifact or no contents", () => {
    expect(selectReviewCanvasMarkdown(undefined)).toBe("");
    expect(selectReviewCanvasMarkdown({})).toBe("");
    expect(selectReviewCanvasMarkdown({ currentIndex: 1 })).toBe("");
  });

  it("ignores non-text contents when selecting the fallback", () => {
    const artifact = {
      currentIndex: 2,
      contents: [
        { index: 1, type: "text", title: "Essay", fullMarkdown: "" },
        { index: 2, type: "code", title: "notes", fullMarkdown: "nope" },
        {
          index: 3,
          type: "text",
          title: "Draft",
          fullMarkdown: "real text",
        },
      ],
    };
    expect(selectReviewCanvasMarkdown(artifact)).toBe("real text");
  });
});
