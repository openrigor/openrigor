import type { EditorCursorPosition } from "./types";

// Define a minimal interface for ProseMirror Node to avoid dependency issues
interface ProseMirrorNode {
  childCount: number;
  child(index: number): ProseMirrorNode;
  type: { name: string };
  nodeSize: number;
  textBetween(from: number, to: number): string;
}

/**
 * Calculate cursor position from a ProseMirror doc and absolute position.
 *
 * @param doc - ProseMirror Node (the full document)
 * @param pos - Absolute ProseMirror position (typically selection.$head.pos)
 * @param from - Selection start (for selectedText)
 * @param to - Selection end (for selectedText)
 * @returns EditorCursorPosition
 */
export function calculateCursorPosition(
  doc: ProseMirrorNode,
  pos: number,
  from?: number,
  to?: number
): EditorCursorPosition {
  // 1. Find blockGroup (first child of doc)
  const blockGroup = doc.childCount > 0 ? doc.child(0) : null;
  const blocks =
    blockGroup && blockGroup.type.name === "blockGroup" ? blockGroup : doc;

  // 2. Walk blocks to find which one contains pos
  let line = 1;
  let column = 1;
  // Track the ProseMirror position of each blockContainer's opening tag
  let blockOpenPos = 1; // blockGroup opens at position 1 (after doc open at 0)

  for (let i = 0; i < blocks.childCount; i++) {
    const block = blocks.child(i);
    const blockStart = blockOpenPos + 1; // +1 for blockGroup's opening tag
    const blockEnd = blockStart + block.nodeSize;

    if (pos >= blockEnd) {
      // Cursor is past this block — move to next
      line = i + 2; // next block is i+2 (1-based)
    } else if (pos >= blockStart) {
      // Cursor is in this block
      line = i + 1;
      // Content starts after blockContainer open + blockContent open = +2
      const contentStart = blockStart + 2;
      column = Math.max(1, pos - contentStart + 1);
      break;
    }

    blockOpenPos = blockEnd - 1;
  }

  // 3. Total lines = number of block containers
  const totalLines = blocks.childCount;

  // 4. Selected text (plain text, no line numbers)
  const selectedText =
    from !== undefined && to !== undefined && from !== to
      ? doc.textBetween(from, to)
      : undefined;

  return { line, column, selectedText, totalLines };
}
