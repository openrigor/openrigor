import { describe, it, expect } from "vitest";
import { addLineNumbers, buildPrompt } from "./utils.js";

describe("addLineNumbers", () => {
  it("should add 1-based line numbers with tab separator", () => {
    const input = "Hello\nWorld\nFoo";
    const result = addLineNumbers(input);
    expect(result).toBe("1\tHello\n2\tWorld\n3\tFoo");
  });

  it("should handle empty string", () => {
    const result = addLineNumbers("");
    expect(result).toBe("1\t");
  });

  it("should handle single line", () => {
    const result = addLineNumbers("Only one line");
    expect(result).toBe("1\tOnly one line");
  });

  it("should handle lines with existing whitespace", () => {
    const input = "  indented\n    more indented\nno indent";
    const result = addLineNumbers(input);
    expect(result).toBe("1\t  indented\n2\t    more indented\n3\tno indent");
  });

  it("should preserve empty lines", () => {
    const input = "line1\n\nline3";
    const result = addLineNumbers(input);
    expect(result).toBe("1\tline1\n2\t\n3\tline3");
  });
});

describe("buildPrompt cursor context", () => {
  const baseArgs = {
    artifactContent: "Hello\nWorld",
    memoriesAsString: "",
    isNewType: false,
    artifactMetaToolCall: { type: "text" } as any,
  };

  it("should include line-numbered artifact content", () => {
    const result = buildPrompt(baseArgs);
    expect(result).toContain("1\tHello");
    expect(result).toContain("2\tWorld");
  });

  it("should include cursor context when cursorPosition is provided", () => {
    const result = buildPrompt({
      ...baseArgs,
      cursorPosition: {
        line: 5,
        column: 10,
        totalLines: 20,
      },
    });
    expect(result).toContain("cursor is at line 5, column 10");
    expect(result).toContain("20 lines total");
  });

  it("should include selected text when provided in cursorPosition", () => {
    const result = buildPrompt({
      ...baseArgs,
      cursorPosition: {
        line: 1,
        column: 1,
        selectedText: "Hello World",
        totalLines: 5,
      },
    });
    expect(result).toContain("<selected-text>");
    expect(result).toContain("Hello World");
    expect(result).toContain("</selected-text>");
  });

  it("should omit cursor context when cursorPosition is undefined", () => {
    const result = buildPrompt(baseArgs);
    expect(result).not.toContain("cursor is at line");
    expect(result).not.toContain("<selected-text>");
  });

  it("should omit selected text section when selectedText is not set", () => {
    const result = buildPrompt({
      ...baseArgs,
      cursorPosition: {
        line: 1,
        column: 1,
        totalLines: 10,
      },
    });
    expect(result).toContain("cursor is at line 1");
    expect(result).not.toContain("<selected-text>");
  });

  it("should replace all template placeholders", () => {
    const result = buildPrompt({
      ...baseArgs,
      memoriesAsString: "User prefers concise writing",
    });
    // Should not contain any unreplaced placeholders
    expect(result).not.toContain("{artifactContent}");
    expect(result).not.toContain("{reflections}");
    expect(result).not.toContain("{cursorContext}");
    expect(result).not.toContain("{updateMetaPrompt}");
    // Should contain the memories
    expect(result).toContain("User prefers concise writing");
  });
});
