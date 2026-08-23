import { describe, expect, it } from "vitest";
import { diffMarkdown } from "./replay-diff";

describe("diffMarkdown", () => {
  it("returns no segments for identical strings", () => {
    const result = diffMarkdown("hello\nworld", "hello\nworld");
    expect(result.segments).toEqual([]);
    expect(result.truncated).toBeUndefined();
  });

  it("returns no segments when CRLF and LF are equivalent", () => {
    const result = diffMarkdown("line one\r\nline two", "line one\nline two");
    expect(result.segments).toEqual([]);
    expect(result.truncated).toBeUndefined();
  });

  it("handles pure insert", () => {
    const result = diffMarkdown("", "alpha\nbeta\n");

    expect(result.truncated).toBeUndefined();
    expect(result.segments).toEqual([
      { added: true, removed: false, value: "alpha\nbeta\n" },
    ]);
  });

  it("handles pure delete", () => {
    const result = diffMarkdown("alpha\nbeta\n", "");

    expect(result.truncated).toBeUndefined();
    expect(result.segments).toEqual([
      { added: false, removed: true, value: "alpha\nbeta\n" },
    ]);
  });

  it("handles replace with removed and added segments", () => {
    const result = diffMarkdown("keep\nold\n", "keep\nnew\n");

    expect(result.truncated).toBeUndefined();
    expect(
      result.segments.some((s) => s.removed && s.value.includes("old"))
    ).toBe(true);
    expect(
      result.segments.some((s) => s.added && s.value.includes("new"))
    ).toBe(true);
    expect(
      result.segments.some(
        (s) => !s.added && !s.removed && s.value.includes("keep")
      )
    ).toBe(true);
  });

  it("truncates after 200 changed lines", () => {
    const prev = Array.from({ length: 250 }, (_, i) => `old-${i}`).join("\n");
    const next = Array.from({ length: 250 }, (_, i) => `new-${i}`).join("\n");

    const result = diffMarkdown(prev, next);

    expect(result.truncated).toBe(true);

    const changedLines = result.segments
      .filter((segment) => segment.added || segment.removed)
      .reduce((sum, segment) => {
        const lineCount = segment.value.endsWith("\n")
          ? segment.value.split("\n").length - 1
          : segment.value.split("\n").length;
        return sum + lineCount;
      }, 0);

    expect(changedLines).toBeLessThanOrEqual(200);
    expect(changedLines).toBeGreaterThan(0);
  });
});
