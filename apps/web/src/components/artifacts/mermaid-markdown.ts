import { preprocessMarkdownForMath } from "./math-markdown";

const MERMAID_FENCE_RE = /```mermaid\r?\n([\s\S]*?)```/g;

type DetailsSegment = {
  start: number;
  end: number;
  summary: string;
  open: boolean;
  content: string;
};

function escapeDetailsSummary(summary: string): string {
  return summary
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeDetailsSummary(summary: string): string {
  const entities = { amp: "&", lt: "<", gt: ">" } as const;
  return summary.replace(
    /&(amp|lt|gt);/g,
    (_match, entity: keyof typeof entities) => entities[entity]
  );
}

function isInsideFencedCode(markdown: string, position: number): boolean {
  const fences = markdown.slice(0, position).match(/^\s*(```|~~~)/gm);
  return (fences?.length ?? 0) % 2 === 1;
}

/**
 * Returns only complete, explicit HTML details groups. Markdown which merely
 * contains a partial tag remains untouched so existing documents keep their
 * normal BlockNote parsing behaviour.
 */
function findDetailsSegments(markdown: string): DetailsSegment[] {
  const segments: DetailsSegment[] = [];
  const tag = /<\/?details\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tag.exec(markdown))) {
    if (match[0].startsWith("</")) continue;
    if (isInsideFencedCode(markdown, match.index)) continue;

    const start = match.index;
    const openingTag = match[0];
    const open = /\sopen(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|>)/i.test(
      openingTag
    );
    const nestedTag = /<\/?details\b[^>]*>/gi;
    nestedTag.lastIndex = tag.lastIndex;
    let depth = 1;
    let closing: RegExpExecArray | null = null;
    let nestedMatch: RegExpExecArray | null;

    while ((nestedMatch = nestedTag.exec(markdown))) {
      if (isInsideFencedCode(markdown, nestedMatch.index)) continue;
      if (nestedMatch[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          closing = nestedMatch;
          break;
        }
      } else {
        depth += 1;
      }
    }

    // An unclosed group is deliberately ignored, including the rest of the
    // input: consuming it could reinterpret unrelated existing markdown.
    if (!closing) break;

    const inner = markdown.slice(tag.lastIndex, closing.index);
    const summary = inner.match(
      /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>\s*(?:\r?\n)?/i
    );
    if (!summary) {
      tag.lastIndex = closing.index + closing[0].length;
      continue;
    }

    segments.push({
      start,
      end: closing.index + closing[0].length,
      summary: unescapeDetailsSummary(summary[1].trim()),
      open,
      content: inner.slice(summary[0].length).trim(),
    });
    tag.lastIndex = closing.index + closing[0].length;
  }

  return segments;
}

function inlineContentToPlainText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((node: { type?: string; text?: string }) => {
      if (node?.type === "text") {
        return node.text ?? "";
      }
      return "";
    })
    .join("");
}

export function preprocessMarkdownForMermaidImport(markdown: string): {
  markdown: string;
  mermaidByPlaceholder: Map<string, string>;
} {
  const mermaidByPlaceholder = new Map<string, string>();
  let index = 0;

  const processed = markdown.replace(
    MERMAID_FENCE_RE,
    (_match, source: string) => {
      const placeholder = `MERMAID_PLACEHOLDER_${index++}`;
      mermaidByPlaceholder.set(placeholder, source.replace(/\n$/, ""));
      return `\n\n${placeholder}\n\n`;
    }
  );

  return { markdown: processed, mermaidByPlaceholder };
}

function convertBlockToMermaid(
  block: Record<string, unknown>,
  mermaidByPlaceholder: Map<string, string>
): Record<string, unknown> {
  if (block.type === "mermaid") {
    const children = Array.isArray(block.children)
      ? block.children.map((child) =>
          convertBlockToMermaid(
            child as Record<string, unknown>,
            mermaidByPlaceholder
          )
        )
      : [];
    return { ...block, children };
  }

  const text = inlineContentToPlainText(block.content).trim();
  if (mermaidByPlaceholder.has(text)) {
    return {
      type: "mermaid",
      props: {
        data: mermaidByPlaceholder.get(text),
        language: "mermaid",
      },
      children: Array.isArray(block.children)
        ? block.children.map((child) =>
            convertBlockToMermaid(
              child as Record<string, unknown>,
              mermaidByPlaceholder
            )
          )
        : [],
    };
  }

  if (Array.isArray(block.children) && block.children.length > 0) {
    return {
      ...block,
      children: block.children.map((child) =>
        convertBlockToMermaid(
          child as Record<string, unknown>,
          mermaidByPlaceholder
        )
      ),
    };
  }

  return block;
}

export function convertParsedBlocksToMermaid(
  blocks: Record<string, unknown>[],
  mermaidByPlaceholder: Map<string, string>
): Record<string, unknown>[] {
  if (mermaidByPlaceholder.size === 0) {
    return blocks;
  }
  return blocks.map((block) =>
    convertBlockToMermaid(block, mermaidByPlaceholder)
  );
}

async function parseMarkdownFragment(
  editor: any,
  markdown: string
): Promise<Record<string, unknown>[]> {
  const withMath = preprocessMarkdownForMath(markdown);
  const { markdown: preprocessed, mermaidByPlaceholder } =
    preprocessMarkdownForMermaidImport(withMath);
  const blocks = await editor.tryParseMarkdownToBlocks(preprocessed);
  return convertParsedBlocksToMermaid(
    blocks as Record<string, unknown>[],
    mermaidByPlaceholder
  );
}

export async function parseMarkdownToCanvasBlocks(
  editor: any,
  markdown: string
): Promise<Record<string, unknown>[]> {
  const details = findDetailsSegments(markdown);
  if (!details.length) return parseMarkdownFragment(editor, markdown);

  const blocks: Record<string, unknown>[] = [];
  let cursor = 0;
  for (const segment of details) {
    if (segment.start > cursor) {
      blocks.push(
        ...(await parseMarkdownFragment(
          editor,
          markdown.slice(cursor, segment.start)
        ))
      );
    }
    blocks.push({
      type: "details",
      props: { summary: segment.summary, open: segment.open },
      children: await parseMarkdownToCanvasBlocks(editor, segment.content),
    });
    cursor = segment.end;
  }
  if (cursor < markdown.length) {
    blocks.push(
      ...(await parseMarkdownFragment(editor, markdown.slice(cursor)))
    );
  }
  return blocks;
}

async function blockToMarkdown(
  editor: any,
  block: Record<string, unknown>
): Promise<string> {
  if (block.type === "mermaid") {
    const props = block.props as { data?: string } | undefined;
    const data = props?.data ?? "";
    return `\`\`\`mermaid\n${data}\n\`\`\``;
  }

  if (block.type === "details") {
    const props = block.props as
      | { summary?: string; open?: boolean }
      | undefined;
    const summary = props?.summary ?? "Details";
    const children = Array.isArray(block.children)
      ? (block.children as Record<string, unknown>[])
      : [];
    const content = children.length
      ? await exportCanvasBlocksToMarkdown(editor, children)
      : "";
    return [
      `<details${props?.open ? " open" : ""}>`,
      `<summary>${escapeDetailsSummary(summary)}</summary>`,
      ...(content ? ["", content] : []),
      "</details>",
    ].join("\n");
  }

  return editor.blocksToMarkdownLossy([block as never]);
}

export async function exportCanvasBlocksToMarkdown(
  editor: any,
  blocks: Record<string, unknown>[]
): Promise<string> {
  const parts = await Promise.all(
    blocks.map((block) => blockToMarkdown(editor, block))
  );
  return parts.join("\n\n");
}
