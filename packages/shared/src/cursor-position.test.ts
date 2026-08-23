import { describe, it, expect } from "vitest";
import { Schema, Node as ProseMirrorNode } from "prosemirror-model";
import { calculateCursorPosition } from "./cursor-position.js";

// Create a minimal ProseMirror schema that matches BlockNote structure
const schema = new Schema({
  nodes: {
    doc: {
      content: "blockGroup",
    },
    blockGroup: {
      content: "blockContainer*",
    },
    blockContainer: {
      content: "blockContent",
    },
    blockContent: {
      content: "text*",
    },
    text: {
      inline: true,
    },
  },
});

// Helper to create a document with the given paragraph texts
function createDocument(paragraphs: string[]): ProseMirrorNode {
  const blockContainers = paragraphs.map((text) => {
    const textNode = text ? schema.text(text) : undefined;
    const blockContent = schema.node(
      "blockContent",
      undefined,
      textNode ? [textNode] : []
    );
    return schema.node("blockContainer", undefined, [blockContent]);
  });

  const blockGroup = schema.node("blockGroup", undefined, blockContainers);
  return schema.node("doc", undefined, [blockGroup]);
}

describe("calculateCursorPosition", () => {
  it("should handle cursor at start of first paragraph", () => {
    const doc = createDocument([
      "Hello world",
      "Second paragraph",
      "Third paragraph",
    ]);

    // Position 3: after doc(0) + blockGroup(1) + blockContainer(2) = start of blockContent
    const result = calculateCursorPosition(doc, 3);

    expect(result).toEqual({
      line: 1,
      column: 1,
      selectedText: undefined,
      totalLines: 3,
    });
  });

  it("should handle cursor at start of second paragraph", () => {
    const doc = createDocument(["Hello", "Second", "Third"]);

    // Calculate position: doc(1) + blockGroup(1) + first block + second block start
    // First block: blockContainer(1) + blockContent(1) + "Hello"(5) + blockContent close(1) + blockContainer close(1) = 9
    // So second block starts at position 1 + 1 + 9 = 11, content at 13
    const result = calculateCursorPosition(doc, 13);

    expect(result).toEqual({
      line: 2,
      column: 1,
      selectedText: undefined,
      totalLines: 3,
    });
  });

  it("should handle empty document", () => {
    const doc = createDocument([]);

    // Position 2: after doc(1) + blockGroup(1) = 2, but no blocks
    const result = calculateCursorPosition(doc, 2);

    expect(result).toEqual({
      line: 1,
      column: 1,
      selectedText: undefined,
      totalLines: 0,
    });
  });

  it("should handle selection across paragraphs", () => {
    const doc = createDocument(["First line", "Second line"]);

    // Select from position 3 (start of first paragraph content) to position 8 (middle of first paragraph)
    // This should select "First" from "First line"
    const result = calculateCursorPosition(doc, 8, 3, 8);

    expect(result.selectedText).toBe("First");
    expect(result.line).toBe(1);
    expect(result.totalLines).toBe(2);
  });

  it("should calculate correct column position within paragraph", () => {
    const doc = createDocument(["Hello world"]);

    // Position 8: after doc(1) + blockGroup(1) + blockContainer(1) + blockContent(1) + "Hell"(4) = 8
    // Column should be 5 (1-based, position within "Hello world")
    const result = calculateCursorPosition(doc, 8);

    expect(result).toEqual({
      line: 1,
      column: 5,
      selectedText: undefined,
      totalLines: 1,
    });
  });

  it("should handle cursor at end of paragraph", () => {
    const doc = createDocument(["Hi"]);

    // Position at end of "Hi": doc(1) + blockGroup(1) + blockContainer(1) + blockContent(1) + "Hi"(2) = 6
    const result = calculateCursorPosition(doc, 6);

    expect(result).toEqual({
      line: 1,
      column: 3, // After "Hi" = column 3
      selectedText: undefined,
      totalLines: 1,
    });
  });
});
