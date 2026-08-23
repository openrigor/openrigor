/**
 * Checks whether a single cell in a table row is "empty" — i.e. contains no
 * meaningful content. A cell is empty when it is an empty array or every
 * InlineContent node in it is a text node whose text is empty / whitespace.
 */
function isCellEmpty(cell: unknown[]): boolean {
  if (cell.length === 0) return true;
  return cell.every((node: unknown) => {
    if (
      node &&
      typeof node === "object" &&
      "type" in node &&
      (node as { type?: string }).type === "text"
    ) {
      return ((node as { text?: string }).text ?? "").trim() === "";
    }
    return false;
  });
}

/**
 * Removes phantom empty rows that BlockNote's tryParseMarkdownToBlocks()
 * injects into tables during markdown → block conversion.
 */
export function filterEmptyTableRows(
  blocks: Record<string, unknown>[]
): Record<string, unknown>[] {
  return blocks.map((block) => {
    const content = block.content as
      | {
          type?: string;
          rows?: Array<{ cells: unknown[][] }>;
        }
      | undefined;

    if (
      block.type === "table" &&
      content &&
      content.type === "tableContent" &&
      Array.isArray(content.rows)
    ) {
      const filteredRows = content.rows.filter((row) => {
        return !row.cells.every(isCellEmpty);
      });
      if (filteredRows.length !== content.rows.length) {
        return {
          ...block,
          content: {
            ...content,
            rows: filteredRows,
          },
        };
      }
    }
    return block;
  });
}
