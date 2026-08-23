import { useEffect, useRef } from "react";
import "@blocknote/core/fonts/inter.css";
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "katex/dist/katex.min.css";

import { cn } from "../lib/utils";
import { canvasSchema } from "./canvas-schema";
import { CustomFormattingToolbar } from "./CustomFormattingToolbar";
import { filterEmptyTableRows } from "./filter-table-rows";
import MathInlineExtension from "./MathInlineExtension";
import {
  exportCanvasBlocksToMarkdown,
  parseMarkdownToCanvasBlocks,
} from "./mermaid-markdown";

export interface DocumentEditorProps {
  /** Full document markdown (string only — no shared Artifact types). */
  markdown: string;
  /** Called with exported markdown whenever the editor document changes. */
  onChange: (markdown: string) => void;
  editable?: boolean;
  className?: string;
}

/**
 * Standalone BlockNote editor for the desktop app.
 * No GraphContext, TrackChanges, or AI UI — markdown in/out only.
 */
export function DocumentEditor({
  markdown,
  onChange,
  editable = true,
  className,
}: DocumentEditorProps) {
  const editor = useCreateBlockNote({
    schema: canvasSchema,
    _tiptapOptions: {
      extensions: [MathInlineExtension],
    },
  });

  const applyingExternal = useRef(false);
  /** null until first hydrate — forces initial markdown load. */
  const lastEmitted = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (markdown === lastEmitted.current) {
      return;
    }

    let cancelled = false;

    (async () => {
      applyingExternal.current = true;
      try {
        const blocks = await parseMarkdownToCanvasBlocks(editor, markdown);
        if (cancelled) return;
        editor.replaceBlocks(
          editor.document,
          filterEmptyTableRows(blocks) as never
        );
        lastEmitted.current = markdown;
      } finally {
        if (!cancelled) {
          applyingExternal.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      applyingExternal.current = false;
    };
  }, [markdown, editor]);

  const handleChange = async () => {
    if (applyingExternal.current) return;

    const fullMarkdown = await exportCanvasBlocksToMarkdown(
      editor,
      editor.document as unknown as Record<string, unknown>[]
    );
    lastEmitted.current = fullMarkdown;
    onChangeRef.current(fullMarkdown);
  };

  return (
    <div
      className={cn("document-editor h-full w-full overflow-y-auto", className)}
    >
      <BlockNoteView
        theme="light"
        formattingToolbar={false}
        slashMenu={false}
        onChange={handleChange}
        editable={editable}
        editor={editor}
        className="custom-blocknote-theme"
      >
        <FormattingToolbarController
          formattingToolbar={CustomFormattingToolbar as never}
        />
        <SuggestionMenuController
          getItems={async () =>
            getDefaultReactSlashMenuItems(editor).filter(
              (item) => item.group !== "Media"
            )
          }
          triggerCharacter="/"
        />
      </BlockNoteView>
    </div>
  );
}
