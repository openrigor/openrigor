import { describe, expect, it } from "vitest";
import {
  convertParsedBlocksToMermaid,
  preprocessMarkdownForMermaidImport,
} from "./mermaid-markdown";

describe("preprocessMarkdownForMermaidImport", () => {
  it("replaces mermaid fences with placeholders", () => {
    const input = [
      "# Title",
      "",
      "```mermaid",
      "graph TD",
      "  A-->B",
      "```",
      "",
      "after",
    ].join("\n");

    const { markdown, mermaidByPlaceholder } =
      preprocessMarkdownForMermaidImport(input);

    expect(mermaidByPlaceholder.size).toBe(1);
    expect(mermaidByPlaceholder.get("MERMAID_PLACEHOLDER_0")).toBe(
      "graph TD\n  A-->B"
    );
    expect(markdown).toContain("MERMAID_PLACEHOLDER_0");
    expect(markdown).not.toContain("```mermaid");
  });

  it("handles multiple mermaid fences", () => {
    const input = "```mermaid\none\n```\n\ntext\n\n```mermaid\ntwo\n```";
    const { mermaidByPlaceholder } = preprocessMarkdownForMermaidImport(input);
    expect(mermaidByPlaceholder.get("MERMAID_PLACEHOLDER_0")).toBe("one");
    expect(mermaidByPlaceholder.get("MERMAID_PLACEHOLDER_1")).toBe("two");
  });
});

describe("convertParsedBlocksToMermaid", () => {
  it("converts placeholder paragraphs into mermaid blocks", () => {
    const map = new Map([["MERMAID_PLACEHOLDER_0", "graph TD\n  A-->B"]]);
    const blocks = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "MERMAID_PLACEHOLDER_0" }],
        children: [],
      },
    ];

    const result = convertParsedBlocksToMermaid(blocks, map);
    expect(result[0]).toMatchObject({
      type: "mermaid",
      props: {
        data: "graph TD\n  A-->B",
        language: "mermaid",
      },
    });
  });

  it("returns blocks unchanged when map is empty", () => {
    const blocks = [{ type: "paragraph", content: [], children: [] }];
    expect(convertParsedBlocksToMermaid(blocks, new Map())).toBe(blocks);
  });
});
