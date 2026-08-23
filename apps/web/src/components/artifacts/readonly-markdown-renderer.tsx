"use client";

import { useEffect, useRef, type RefObject } from "react";
import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import TrackChangesExtension, {
  setTrackChangesRanges,
  clearTrackChangesRanges,
} from "./TrackChangesExtension";
import MathInlineExtension from "./MathInlineExtension";
import type { DiffRange } from "@/lib/diffing";
import { canvasSchema } from "./canvas-schema";
import "katex/dist/katex.min.css";
import { parseMarkdownToCanvasBlocks } from "./mermaid-markdown";

function isCellEmpty(cell: unknown[]): boolean {
  if (cell.length === 0) return true;
  return cell.every((node: any) => {
    if (node && node.type === "text") {
      return (node.text as string).trim() === "";
    }
    return false;
  });
}

function filterEmptyTableRows(blocks: any[]): any[] {
  return blocks.map((block) => {
    if (
      block.type === "table" &&
      block.content &&
      block.content.type === "tableContent" &&
      Array.isArray(block.content.rows)
    ) {
      const filteredRows = block.content.rows.filter(
        (row: { cells: unknown[][] }) => {
          return !row.cells.every(isCellEmpty);
        }
      );
      if (filteredRows.length !== block.content.rows.length) {
        return {
          ...block,
          content: {
            ...block.content,
            rows: filteredRows,
          },
        };
      }
    }
    return block;
  });
}

function refreshTrackChangeDecorations(editor: any) {
  const view = editor._tiptapEditor?.view;
  if (!view) return;
  view.dispatch(view.state.tr);
}

export function textOffsetToProseMirrorPos(doc: any, offset: number): number {
  let textOffset = 0;
  let result = 1;
  let found = false;

  doc.descendants(
    (node: { isText: boolean; text?: string | null }, pos: number) => {
      if (found) return false;
      if (!node.isText) return true;

      const nodeLen = node.text?.length ?? 0;
      const nodeEnd = textOffset + nodeLen;
      if (offset < nodeEnd) {
        result = pos + Math.max(0, offset - textOffset);
        found = true;
        return false;
      }

      textOffset = nodeEnd;
      return false;
    }
  );

  return result;
}

export function scrollToTextOffset(
  editor: any,
  offset: number,
  scrollContainer?: HTMLElement | null
): void {
  const view = editor._tiptapEditor?.view;
  if (!view) return;

  const pos = textOffsetToProseMirrorPos(view.state.doc, offset);
  const domPos = view.domAtPos(pos);
  const node = domPos.node;
  const element =
    node instanceof HTMLElement ? node : (node.parentElement ?? null);
  if (!element) return;

  if (scrollContainer) {
    const blockNoteRoot = view.dom as HTMLElement;
    let scrollTarget: HTMLElement | null = element;
    while (scrollTarget && scrollTarget !== scrollContainer) {
      if (scrollTarget === blockNoteRoot) break;
      scrollTarget = scrollTarget.parentElement;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }

  element.scrollIntoView({ block: "center", behavior: "smooth" });
}

export interface ReadonlyMarkdownRendererProps {
  markdown: string;
  testId?: string;
  highlightRanges?: DiffRange[];
  scrollToOffset?: number | null;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function ReadonlyMarkdownRenderer({
  markdown,
  testId = "canvas-editor",
  highlightRanges,
  scrollToOffset,
  scrollContainerRef,
}: ReadonlyMarkdownRendererProps) {
  const editor = useCreateBlockNote({
    schema: canvasSchema,
    _tiptapOptions: {
      extensions: [TrackChangesExtension, MathInlineExtension],
    },
  });

  const isSyncingRef = useRef(false);
  const lastScrolledOffsetRef = useRef<number | null>(null);
  const scrollToOffsetRef = useRef(scrollToOffset);
  scrollToOffsetRef.current = scrollToOffset;

  useEffect(() => {
    let cancelled = false;
    isSyncingRef.current = true;

    (async () => {
      try {
        const markdownAsBlocks = await parseMarkdownToCanvasBlocks(
          editor,
          markdown
        );
        if (cancelled) return;

        const cleanedBlocks = filterEmptyTableRows(markdownAsBlocks);
        editor.replaceBlocks(editor.document, cleanedBlocks as never);

        const ranges = highlightRanges ?? [];
        if (ranges.length > 0) {
          setTrackChangesRanges(ranges);
        } else {
          clearTrackChangesRanges();
        }
        refreshTrackChangeDecorations(editor);

        if (!cancelled) {
          isSyncingRef.current = false;

          const offset = scrollToOffsetRef.current;
          if (
            offset != null &&
            offset >= 0 &&
            offset !== lastScrolledOffsetRef.current
          ) {
            lastScrolledOffsetRef.current = offset;
            requestAnimationFrame(() => {
              if (isSyncingRef.current) return;
              scrollToTextOffset(
                editor,
                offset,
                scrollContainerRef?.current ?? null
              );
            });
          }
        }
      } finally {
        if (!cancelled) {
          isSyncingRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      isSyncingRef.current = false;
    };
  }, [markdown, editor, highlightRanges, scrollContainerRef]);

  useEffect(() => {
    if (scrollToOffset == null) {
      lastScrolledOffsetRef.current = null;
    }
  }, [scrollToOffset]);

  return (
    <BlockNoteView
      theme="light"
      formattingToolbar={false}
      slashMenu={false}
      editable={false}
      editor={editor}
      className="custom-blocknote-theme"
      data-testid={testId}
    />
  );
}
