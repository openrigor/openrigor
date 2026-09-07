import { useEffect, useRef, useState } from "react";
import { ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { calculateCursorPosition } from "@opencanvas/shared";
import "@blocknote/core/fonts/inter.css";
import { locales } from "@blocknote/core";
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { useLocale } from "next-intl";
import { CustomFormattingToolbar } from "./CustomFormattingToolbar";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { isArtifactMarkdownContent } from "@opencanvas/shared/utils/artifacts";
import {
  buildTextHighlight,
  normalizeCanvasMarkdown,
} from "@opencanvas/shared/utils/markdown-canvas";
import { useGraphContext, PendingEditState } from "@/contexts/GraphContext";
import React from "react";
import { Textarea } from "../ui/textarea";
import TrackChangesExtension, {
  setTrackChangesRanges,
  clearTrackChangesRanges,
} from "./TrackChangesExtension";
import MathInlineExtension from "./MathInlineExtension";
import { computeDiffRanges, type DiffRange } from "@/lib/diffing";
import { EditActionBar } from "./EditActionBar";
import { canvasSchema } from "./canvas-schema";
import { resolveBlockNoteLocale } from "@/lib/i18n/blocknote-locale";

import "katex/dist/katex.min.css";
import {
  exportCanvasBlocksToMarkdown,
  parseMarkdownToCanvasBlocks,
} from "./mermaid-markdown";
import { DEFAULT_LOCALE, isLocaleCode } from "@/lib/i18n/locales";

type BlockNoteDictionary = NonNullable<
  Parameters<typeof useCreateBlockNote>[0]
>["dictionary"];

/**
 * Checks whether a single cell in a table row is "empty" — i.e. contains no
 * meaningful content.  A cell is empty when it is an empty array or every
 * InlineContent node in it is a text node whose text is empty / whitespace.
 */
function isCellEmpty(cell: unknown[]): boolean {
  if (cell.length === 0) return true;
  return cell.every((node: any) => {
    if (node && node.type === "text") {
      return (node.text as string).trim() === "";
    }
    // Non-text inline content (links, mentions, etc.) counts as non-empty
    return false;
  });
}

/**
 * Removes phantom empty rows that BlockNote's tryParseMarkdownToBlocks()
 * injects into tables during markdown → block conversion.
 *
 * A row is considered phantom when *every* cell in it is empty.
 * Returns a new blocks array; does not mutate the input.
 */
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
      // Only create a new object if we actually removed rows
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

export interface TextRendererProps {
  isEditing: boolean;
  isHovering: boolean;
  isInputVisible: boolean;
  minimalCanvas?: boolean;
  editorRef?: React.MutableRefObject<any | null>;
  /**
   * Receives toggleRawView so the raw-markdown control can live in the
   * artifact header bar (next to Print) instead of an in-canvas overlay.
   */
  toggleRef?: React.MutableRefObject<(() => void) | null>;
  /** Reports raw-view enter/exit so the header control can reflect state. */
  onRawViewChange?: (isRawView: boolean) => void;
}

export function TextRendererComponent(props: TextRendererProps) {
  const locale = useLocale();
  const appLocale = isLocaleCode(locale) ? locale : DEFAULT_LOCALE;
  const editor = useCreateBlockNote(
    {
      schema: canvasSchema,
      dictionary: locales[
        resolveBlockNoteLocale(appLocale)
      ] as BlockNoteDictionary,
      _tiptapOptions: {
        extensions: [TrackChangesExtension, MathInlineExtension],
      },
    },
    // Recreate the editor when the app locale changes so BlockNote's
    // dictionary (UI strings) follows the switched language.
    [appLocale]
  );
  const { graphData } = useGraphContext();
  const {
    setCursorPosition,
    setEditorHasFocus,
    artifact,
    isStreaming,
    updateRenderedArtifactRequired,
    setArtifact,
    setSelectedBlocks,
    setUpdateRenderedArtifactRequired,
    artifactSyncGeneration,
    pendingEdit,
    setPendingEdit,
    setEditorTextContent,
    phaseState,
  } = graphData;

  // Track cursor position changes — push to GraphContext so all message paths get it
  useEffect(() => {
    if (!editor) return;

    const updateCursorPosition = () => {
      const selection = editor._tiptapEditor.state.selection;
      const doc = editor._tiptapEditor.state.doc;
      const pos = selection.$head.pos;
      const { from, to } = selection;

      const position = calculateCursorPosition(doc, pos, from, to);
      setCursorPosition(position);
    };

    // Track editor focus — only update cursor position when canvas has focus
    const onFocus = () => setEditorHasFocus(true);
    const onBlur = () => setEditorHasFocus(false);
    editor._tiptapEditor.on("focus", onFocus);
    editor._tiptapEditor.on("blur", onBlur);

    // Listen to selection updates (fires on cursor move, click, type)
    editor._tiptapEditor.on("selectionUpdate", updateCursorPosition);
    // Also fire on content changes (cursor might shift)
    editor._tiptapEditor.on("update", updateCursorPosition);

    return () => {
      editor._tiptapEditor.off("focus", onFocus);
      editor._tiptapEditor.off("blur", onBlur);
      editor._tiptapEditor.off("selectionUpdate", updateCursorPosition);
      editor._tiptapEditor.off("update", updateCursorPosition);
    };
  }, [editor, setCursorPosition, setEditorHasFocus]);

  // Expose editor to parent for undo/redo buttons
  useEffect(() => {
    if (props.editorRef) {
      props.editorRef.current = {
        editor,
      };
    }
    return () => {
      if (props.editorRef) {
        props.editorRef.current = null;
      }
    };
  }, [editor, props.editorRef]);

  const [rawMarkdown, setRawMarkdown] = useState("");
  const [isRawView, setIsRawView] = useState(false);
  const [manuallyUpdatingArtifact, setManuallyUpdatingArtifact] =
    useState(false);
  const contentLoadedRef = useRef(false);
  const lastSyncedGenerationRef = useRef(0);

  const toggleRawView = async () => {
    if (isRawView) {
      // Don't try to update the BlockNote editor directly — BlockNoteView
      // is conditionally unmounted when isRawView=true, which destroys the
      // Tiptap view. editor.replaceBlocks() silently fails on a detached
      // view. Instead, force the sync effect (useEffect at line 285) to
      // reload the artifact content. It correctly handles view lifecycle:
      // it sets manuallyUpdatingArtifact(true) synchronously, then the
      // async parse yields and React mounts BlockNoteView before
      // replaceBlocks runs.
      contentLoadedRef.current = false;
      setUpdateRenderedArtifactRequired(true);
      setIsRawView(false);
      return;
    }
    const md = await exportCanvasBlocksToMarkdown(editor, editor.document);
    setRawMarkdown(normalizeCanvasMarkdown(md));
    setIsRawView(true);
  };

  // Wire the header-bar control: expose toggleRawView upstream and report
  // raw-view state so the header button (next to Print) reflects it.
  const { toggleRef, onRawViewChange } = props;
  useEffect(() => {
    if (toggleRef) {
      toggleRef.current = () => {
        void toggleRawView();
      };
    }
    onRawViewChange?.(isRawView);
    return () => {
      if (toggleRef) toggleRef.current = null;
    };
  }, [isRawView, toggleRef, onRawViewChange, toggleRawView]);

  // New artifact version (e.g. applyTextEdits) → formatted canvas only
  useEffect(() => {
    setIsRawView(false);
    setRawMarkdown("");
  }, [artifact?.currentIndex]);

  // When a new artifact version arrives (thread switch, streaming update,
  // or bootstrap), mark content as not-yet-loaded so the guard in the
  // content-loading effect doesn't block the initial parse. The editor
  // dependency covers editor recreation (locale switch): a fresh editor
  // instance is empty, so existing content must be re-loaded into it.
  useEffect(() => {
    contentLoadedRef.current = false;
  }, [artifact?.currentIndex, editor]);

  useEffect(() => {
    const selectedText = editor.getSelectedText();
    const selection = editor.getSelection();

    if (selectedText && selection) {
      if (!artifact) {
        console.error("Artifact not found");
        return;
      }

      const currentBlockIdx = artifact.currentIndex;
      const currentContent = artifact.contents.find(
        (c) => c.index === currentBlockIdx
      );
      if (!currentContent) {
        console.error("Current content not found");
        return;
      }
      if (!isArtifactMarkdownContent(currentContent)) {
        console.error("Current content is not markdown");
        return;
      }

      (async () => {
        const markdownBlock = await editor.blocksToMarkdownLossy(
          selection.blocks
        );
        const built = buildTextHighlight(
          currentContent.fullMarkdown,
          markdownBlock,
          selectedText
        );
        if (!built.ok) {
          console.warn(
            "[TextRenderer] selection block not found in artifact markdown",
            {
              markdownBlock,
              fullMarkdown: currentContent.fullMarkdown.slice(0, 200),
            }
          );
          return;
        }
        setSelectedBlocks(built.highlight);
      })();
    }
  }, [editor.getSelectedText()]);

  useEffect(() => {
    if (!props.isInputVisible) {
      setSelectedBlocks(undefined);
    }
  }, [props.isInputVisible]);

  useEffect(() => {
    if (!artifact) {
      return;
    }
    if (isStreaming || manuallyUpdatingArtifact) {
      return;
    }

    const forceSync = artifactSyncGeneration > lastSyncedGenerationRef.current;
    if (
      !updateRenderedArtifactRequired &&
      contentLoadedRef.current &&
      !forceSync
    ) {
      return;
    }

    const currentIndex = artifact.currentIndex;
    const currentContent = artifact.contents.find(
      (c) => c.index === currentIndex && c.type === "text"
    ) as ArtifactMarkdownV3 | undefined;
    if (!currentContent) return;

    let cancelled = false;
    setManuallyUpdatingArtifact(true);

    (async () => {
      try {
        const markdownAsBlocks = await parseMarkdownToCanvasBlocks(
          editor,
          currentContent.fullMarkdown
        );
        if (cancelled) return;

        const cleanedBlocks = filterEmptyTableRows(markdownAsBlocks);
        editor.replaceBlocks(editor.document, cleanedBlocks);
        contentLoadedRef.current = true;
        if (forceSync) {
          lastSyncedGenerationRef.current = artifactSyncGeneration;
        }
        try {
          const clearTr = editor._tiptapEditor.state.tr;
          clearTr.setMeta("historyFilter", () => true);
          editor._tiptapEditor.dispatch(clearTr);
        } catch {
          // If clearing history fails, that's OK
        }

        if (pendingEdit?.isActive && pendingEdit.preEditText) {
          const postEditText = editor._tiptapEditor.state.doc.textContent;
          const ranges = computeDiffRanges(
            pendingEdit.preEditText,
            postEditText
          );
          if (ranges.length > 0) {
            setPendingEdit((prev: PendingEditState | null) =>
              prev ? { ...prev, diffRanges: ranges } : null
            );
          }
        }

        setEditorTextContent(editor._tiptapEditor.state.doc.textContent);

        if (updateRenderedArtifactRequired || forceSync) {
          setRawMarkdown("");
          setIsRawView(false);
        }
      } finally {
        if (!cancelled) {
          setManuallyUpdatingArtifact(false);
          setUpdateRenderedArtifactRequired(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // If the effect cleanup fires (deps changed while async was in flight),
      // cancel must also release the manual-update lock so the next effect
      // isn't permanently blocked. Without this, rapid artifact changes from
      // raw-view editing can strand manuallyUpdatingArtifact=true and leave
      // the canvas empty when toggling back to formatted view.
      setManuallyUpdatingArtifact(false);
    };
  }, [
    artifact,
    artifact?.currentIndex,
    artifactSyncGeneration,
    updateRenderedArtifactRequired,
    isStreaming,
    editor,
  ]);

  const isComposition = useRef(false);

  const refreshTrackChangeDecorations = () => {
    const view = editor._tiptapEditor?.view;
    if (!view) return;
    view.dispatch(view.state.tr);
  };

  useEffect(() => {
    if (pendingEdit?.isActive && pendingEdit.diffRanges.length > 0) {
      setTrackChangesRanges(pendingEdit.diffRanges);
    } else {
      clearTrackChangesRanges();
    }
    refreshTrackChangeDecorations();
  }, [pendingEdit, editor]);

  const handleKeep = () => {
    if (phaseState === "submitted") return;
    // Track the keep action
    const aggregator = (window as any).__trackingAggregator;
    if (aggregator && pendingEdit) {
      const totalChanged = pendingEdit.diffRanges.reduce(
        (sum: number, r: DiffRange) => sum + (r.end - r.start),
        0
      );
      aggregator.trackEditAction("keep", totalChanged);
    }
    clearTrackChangesRanges();
    refreshTrackChangeDecorations();
    setPendingEdit(null);
  };

  const handleUndo = async () => {
    if (phaseState === "submitted") return;
    if (!editor || !pendingEdit) return;
    // Track the undo action
    const aggregator = (window as any).__trackingAggregator;
    if (aggregator) {
      const totalChanged = pendingEdit.diffRanges.reduce(
        (sum: number, r: DiffRange) => sum + (r.end - r.start),
        0
      );
      aggregator.trackEditAction("undo", totalChanged);
    }
    clearTrackChangesRanges();
    refreshTrackChangeDecorations();

    // Restore pre-edit markdown
    (window as any).__bn_suppressOnChange = true;
    try {
      const blocks = await parseMarkdownToCanvasBlocks(
        editor,
        pendingEdit.preEditMarkdown
      );
      const cleanedBlocks = filterEmptyTableRows(blocks);
      editor.replaceBlocks(editor.document, cleanedBlocks);
    } finally {
      (window as any).__bn_suppressOnChange = false;
      setPendingEdit(null);
    }
  };

  const onChange = async () => {
    // Always keep the editor text ref current regardless of streaming/update state
    setEditorTextContent(editor._tiptapEditor.state.doc.textContent);

    if (
      isStreaming ||
      manuallyUpdatingArtifact ||
      updateRenderedArtifactRequired ||
      (window as any).__bn_suppressOnChange
    )
      return;

    const fullMarkdown = await exportCanvasBlocksToMarkdown(
      editor,
      editor.document
    );
    setArtifact((prev) => {
      if (!prev) {
        return {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              fullMarkdown: fullMarkdown,
              title: "Untitled",
              type: "text",
            },
          ],
        };
      } else {
        return {
          ...prev,
          contents: prev.contents.map((c) => {
            if (c.index === prev.currentIndex) {
              return {
                ...c,
                fullMarkdown: fullMarkdown,
              };
            }
            return c;
          }),
        };
      }
    });
  };

  const onChangeRawMarkdown = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newRawMarkdown = e.target.value;
    setRawMarkdown(newRawMarkdown);
    setArtifact((prev) => {
      if (!prev) {
        return {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              fullMarkdown: newRawMarkdown,
              title: "Untitled",
              type: "text",
            },
          ],
        };
      } else {
        return {
          ...prev,
          contents: prev.contents.map((c) => {
            if (c.index === prev.currentIndex) {
              return {
                ...c,
                fullMarkdown: newRawMarkdown,
              };
            }
            return c;
          }),
        };
      }
    });
  };

  return (
    <div className="w-full h-full mt-2 flex flex-col border-t-[1px] border-gray-200 overflow-y-auto py-5 relative">
      <EditActionBar
        isActive={
          (pendingEdit?.isActive ?? false) && phaseState !== "submitted"
        }
        onKeep={handleKeep}
        onUndo={handleUndo}
      />
      {isRawView ? (
        <Textarea
          className="whitespace-pre-wrap font-mono text-sm px-[54px] border-0 shadow-none h-full outline-none ring-0 rounded-none  focus-visible:ring-0 focus-visible:ring-offset-0"
          value={rawMarkdown}
          onChange={onChangeRawMarkdown}
          readOnly={phaseState === "submitted"}
          data-tracking-id="canvas-editor"
          data-testid="canvas-editor-raw"
        />
      ) : (
        <>
          <BlockNoteView
            theme="light"
            formattingToolbar={false}
            slashMenu={false}
            onCompositionStartCapture={() => (isComposition.current = true)}
            onCompositionEndCapture={() => (isComposition.current = false)}
            onChange={onChange}
            editable={
              phaseState !== "submitted" &&
              (!isStreaming || props.isEditing || !manuallyUpdatingArtifact) &&
              !pendingEdit?.isActive
            }
            editor={editor}
            className="custom-blocknote-theme"
            data-tracking-id="canvas-editor"
            data-testid="canvas-editor"
          >
            {!props.minimalCanvas && (
              <FormattingToolbarController
                formattingToolbar={CustomFormattingToolbar as any}
              />
            )}
            {!props.minimalCanvas && (
              <SuggestionMenuController
                getItems={async () =>
                  getDefaultReactSlashMenuItems(editor).filter(
                    (z) => z.group !== "Media"
                  )
                }
                triggerCharacter={"/"}
              />
            )}
          </BlockNoteView>
        </>
      )}
    </div>
  );
}

export const TextRenderer = React.memo(TextRendererComponent);
