import { describe, expect, it, vi } from "vitest";
import {
  exportCanvasBlocksToMarkdown,
  parseMarkdownToCanvasBlocks,
} from "./mermaid-markdown";

function editorStub() {
  return {
    tryParseMarkdownToBlocks: vi.fn(async (markdown: string) => {
      const trimmed = markdown.trim();
      return trimmed
        ? [
            {
              type: trimmed.includes("| Field |") ? "table" : "paragraph",
              props: {},
              content: [{ type: "text", text: trimmed }],
              children: [],
              markdown: trimmed,
            },
          ]
        : [];
    }),
    blocksToMarkdownLossy: vi.fn(async (blocks: Array<{ markdown: string }>) =>
      blocks.map((block) => block.markdown).join("\n\n")
    ),
  };
}

const escapedDetailsSummaries = [
  "<script>",
  "A & B",
  "a > b",
  "</summary>",
  "&lt;",
  "&gt;",
  "&amp;",
];

describe("details markdown canvas conversion", () => {
  it("round-trips nested details content and a table", async () => {
    const editor = editorStub();
    const markdown = [
      "<details open>",
      "<summary>Evidence</summary>",
      "",
      "Nested introduction.",
      "",
      "<details>",
      "<summary>Distribution</summary>",
      "",
      "| Field | Count |",
      "| --- | ---: |",
      "| country | 2 |",
      "</details>",
      "</details>",
    ].join("\n");

    const blocks = await parseMarkdownToCanvasBlocks(editor, markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "details",
      props: { summary: "Evidence", open: true },
    });
    const children = blocks[0].children as Array<Record<string, unknown>>;
    expect(children).toHaveLength(2);
    expect(children[1]).toMatchObject({
      type: "details",
      props: { summary: "Distribution", open: false },
    });
    expect(children[1].children).toEqual([
      expect.objectContaining({ type: "table" }),
    ]);

    await expect(exportCanvasBlocksToMarkdown(editor, blocks)).resolves.toBe(
      markdown
    );
  });

  it.each(escapedDetailsSummaries)(
    "round-trips an escaped details summary: %s",
    async (summary) => {
      const editor = editorStub();
      const input = [
        {
          type: "details",
          props: { summary, open: false },
          children: [],
        },
      ];

      const markdown = await exportCanvasBlocksToMarkdown(editor, input);

      await expect(
        parseMarkdownToCanvasBlocks(editor, markdown)
      ).resolves.toEqual(input);
    }
  );

  it("leaves malformed and unclosed details tags to the normal markdown parser", async () => {
    const editor = editorStub();
    const markdown = "<details><summary>Broken</summary>\nNo closing tag";

    const blocks = await parseMarkdownToCanvasBlocks(editor, markdown);

    expect(editor.tryParseMarkdownToBlocks).toHaveBeenCalledWith(markdown);
    expect(blocks).not.toContainEqual(
      expect.objectContaining({ type: "details" })
    );
  });

  it("does not activate markers shown inside a fenced code block", async () => {
    const editor = editorStub();
    const markdown = [
      "```html",
      "<details><summary>Example</summary></details>",
      "```",
    ].join("\n");

    await parseMarkdownToCanvasBlocks(editor, markdown);

    expect(editor.tryParseMarkdownToBlocks).toHaveBeenCalledWith(markdown);
  });
});
