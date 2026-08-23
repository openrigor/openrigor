import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { cn } from "@/lib/utils";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ProgrammingLanguageOptions,
} from "@opencanvas/shared/types";
import { EditorView } from "@codemirror/view";
import { HumanMessage } from "@langchain/core/messages";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import { ActionsToolbar, CodeToolBar } from "./actions_toolbar";

const CodeRenderer = React.lazy(() =>
  import("./CodeRenderer").then((m) => ({ default: m.CodeRenderer }))
);
const TextRenderer = React.lazy(() =>
  import("./TextRenderer").then((m) => ({ default: m.TextRenderer }))
);
const PrintView = React.lazy(() =>
  import("./PrintView").then((m) => ({ default: m.PrintView }))
);
import { CustomQuickActions } from "./actions_toolbar/custom";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { ArtifactLoading } from "./ArtifactLoading";
import { AskOpenCanvas } from "./components/AskOpenCanvas";
import { useGraphContext } from "@/contexts/GraphContext";
import { ArtifactHeader } from "./header";
import { useUserContext } from "@/contexts/UserContext";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";

export interface ArtifactRendererProps {
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  chatCollapsed: boolean;
  setChatCollapsed: (c: boolean) => void;
  minimalCanvas?: boolean;
}

interface SelectionBox {
  top: number;
  left: number;
  text: string;
}

function ArtifactRendererComponent(props: ArtifactRendererProps) {
  const { graphData } = useGraphContext();
  const { selectedAssistant } = useAssistantContext();
  const teachingAssignment = useTeachingAssignmentOptional();
  const aiCanvasActions =
    teachingAssignment?.apparatusConfiguration?.ai_canvas_actions !== false;
  const minimalCanvas = props.minimalCanvas ?? true;
  const showCanvasActions = aiCanvasActions && !minimalCanvas;
  const { user } = useUserContext();
  const {
    artifact,
    selectedBlocks,
    isStreaming,
    isArtifactSaved,
    artifactUpdateFailed,
    setMessages,
    streamMessage,
    setSelectedBlocks: _unused_setSelectedBlocks,
    setArtifact,
  } = graphData;

  const editorRef = useRef<EditorView | null>(null);
  const blockNoteEditorRef = useRef<any | null>(null);
  const artifactContentRef = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  // Cached clone of the most recent in-canvas selection range. The highlight overlay
  // renders from this (DOM-anchored) range so it survives the browser selection moving
  // to the chat input when the student types/scrolls there. Without it, every
  // scrollTick re-render re-read window.getSelection(), which had left the canvas, so
  // the green overlay was wiped on chat interaction.
  const selectionRangeRef = useRef<Range | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox>();
  const [selectionIndexes, setSelectionIndexes] = useState<{
    start: number;
    end: number;
  }>();
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isHoveringOverArtifact, setIsHoveringOverArtifact] = useState(false);
  const [isValidSelectionOrigin, setIsValidSelectionOrigin] = useState(false);
  // Incremented on scroll to force highlight re-render so highlights scroll with text
  const [scrollTick, setScrollTick] = useState(0);
  // Print functionality
  const [showPrintView, setShowPrintView] = useState(false);

  const handleMouseUp = useCallback(() => {
    if (!showCanvasActions) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && contentRef.current) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString().trim();

      // Check if the selection originated from within the artifact content
      if (selectedText && artifactContentRef.current) {
        const isWithinArtifact = (node: Node | null): boolean => {
          if (!node) return false;
          if (node === artifactContentRef.current) return true;
          return isWithinArtifact(node.parentNode);
        };

        // Check both start and end containers
        const startInArtifact = isWithinArtifact(range.startContainer);
        const endInArtifact = isWithinArtifact(range.endContainer);

        if (startInArtifact && endInArtifact) {
          setIsValidSelectionOrigin(true);
          const rects = range.getClientRects();
          const firstRect = rects[0];
          const lastRect = rects[rects.length - 1];
          const contentRect = contentRef.current.getBoundingClientRect();

          const boxWidth = 400; // Approximate width of the selection box
          let left = lastRect.right - contentRect.left - boxWidth;

          if (left < 0) {
            left = Math.min(0, firstRect.left - contentRect.left);
          }
          // Ensure the box doesn't go beyond the left edge
          if (left < 0) {
            left = Math.min(0, firstRect.left - contentRect.left);
          }

          setSelectionBox({
            top: lastRect.bottom - contentRect.top,
            left: left,
            text: selectedText,
          });
          setIsInputVisible(false);
          selectionRangeRef.current = range.cloneRange();
          setIsSelectionActive(true);
        } else {
          setIsValidSelectionOrigin(false);
          handleCleanupState();
        }
      }
    }
  }, [showCanvasActions]);

  const handleCleanupState = () => {
    setIsInputVisible(false);
    setSelectionBox(undefined);
    setSelectionIndexes(undefined);
    setIsSelectionActive(false);
    setIsValidSelectionOrigin(false);
    setInputValue("");
    selectionRangeRef.current = null;
  };

  const handleDocumentMouseDown = useCallback(
    (event: MouseEvent) => {
      if (!isSelectionActive) return;

      // Don't clean up if clicking inside the AskOpenCanvas popup
      if (selectionBoxRef.current?.contains(event.target as Node)) return;

      // Only clean up if clicking inside the canvas content area
      // (user making new selection or moving cursor in canvas).
      // Clicks outside the canvas (chat input, toolbar, sidebar, etc.)
      // should NOT clear the selection highlight.
      if (artifactContentRef.current?.contains(event.target as Node)) {
        handleCleanupState();
      }
    },
    [isSelectionActive]
  );

  const handleSelectionBoxMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleSubmit = async (content: string) => {
    const humanMessage = new HumanMessage({
      content,
      id: uuidv4(),
    });

    setMessages((prevMessages) => [...prevMessages, humanMessage]);
    handleCleanupState();
    await streamMessage({
      messages: [convertToOpenAIFormat(humanMessage)],
      ...(selectionIndexes && {
        highlightedCode: {
          startCharIndex: selectionIndexes.start,
          endCharIndex: selectionIndexes.end,
        },
      }),
    });
  };

  const handlePrint = useCallback(() => {
    if (!artifact) return;

    const currentArtifactContent = getArtifactContent(artifact);
    if (currentArtifactContent.type !== "text") return;

    setShowPrintView(true);

    // Wait for next tick to ensure PrintView is rendered
    setTimeout(() => {
      window.print();
      // Clean up after print dialog closes (estimated delay)
      setTimeout(() => setShowPrintView(false), 1000);
    }, 100);
  }, [artifact]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Handle Ctrl+P (Cmd+P on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        handlePrint();
      }
    },
    [handlePrint]
  );

  useEffect(() => {
    if (!showCanvasActions) return;
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleMouseUp,
    handleDocumentMouseDown,
    handleKeyDown,
    showCanvasActions,
  ]);

  // Re-render highlights when the scroll container scrolls so they move with the text.
  // The highlight overlay lives outside the TextRenderer's overflow-y-auto container,
  // so without this listener the highlights stay at fixed viewport positions while text scrolls.
  useEffect(() => {
    if (!showCanvasActions || !isSelectionActive) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setScrollTick((t) => t + 1);
        rafId = null;
      });
    };

    // Capture phase catches scroll events from nested scroll containers
    // (scroll events don't bubble, but capture phase propagates from document down)
    document.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      document.removeEventListener("scroll", handleScroll, {
        capture: true,
      } as EventListenerOptions);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isSelectionActive, showCanvasActions]);

  useEffect(() => {
    try {
      if (artifactContentRef.current && highlightLayerRef.current) {
        const content = artifactContentRef.current;
        const highlightLayer = highlightLayerRef.current;

        // Clear existing highlights
        highlightLayer.innerHTML = "";

        if (showCanvasActions && isSelectionActive && selectionBox) {
          const range = selectionRangeRef.current;

          if (range && content.contains(range.commonAncestorContainer)) {
            const rects = range.getClientRects();
            const layerRect = highlightLayer.getBoundingClientRect();

            // Calculate start and end indexes
            let startIndex = 0;
            let endIndex = 0;
            let currentArtifactContent:
              | ArtifactCodeV3
              | ArtifactMarkdownV3
              | undefined = undefined;
            try {
              currentArtifactContent = artifact
                ? getArtifactContent(artifact)
                : undefined;
            } catch (_) {
              console.error(
                "[ArtifactRenderer.tsx L229]\n\nERROR NO ARTIFACT CONTENT FOUND\n\n",
                artifact
              );
              // no-op
            }

            if (currentArtifactContent?.type === "code") {
              if (editorRef.current) {
                const from = editorRef.current.posAtDOM(
                  range.startContainer,
                  range.startOffset
                );
                const to = editorRef.current.posAtDOM(
                  range.endContainer,
                  range.endOffset
                );
                startIndex = from;
                endIndex = to;
              }
              setSelectionIndexes({ start: startIndex, end: endIndex });
            }

            for (let i = 0; i < rects.length; i++) {
              const rect = rects[i];
              const highlightEl = document.createElement("div");
              highlightEl.className =
                "absolute bg-[#3597934d] pointer-events-none";

              // Adjust the positioning and size
              const verticalPadding = 3;
              highlightEl.style.left = `${rect.left - layerRect.left}px`;
              highlightEl.style.top = `${rect.top - layerRect.top - verticalPadding}px`;
              highlightEl.style.width = `${rect.width}px`;
              highlightEl.style.height = `${rect.height + verticalPadding * 2}px`;

              highlightLayer.appendChild(highlightEl);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to get artifact selection", e);
    }
  }, [isSelectionActive, selectionBox, scrollTick, showCanvasActions]);

  useEffect(() => {
    if (!showCanvasActions) return;
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if we're in an input/textarea element
      const activeElement = document.activeElement;
      const isInputActive =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      // If selection states are active and we're not in an input field
      if (
        (isInputVisible || selectionBox || isSelectionActive) &&
        !isInputActive
      ) {
        // Check if the key is a character key or backspace/delete
        if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
          handleCleanupState();
        }
      }

      // Handle escape key for input box
      if ((isInputVisible || isSelectionActive) && e.key === "Escape") {
        handleCleanupState();
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isInputVisible, selectionBox, isSelectionActive, showCanvasActions]);

  const currentArtifactContent = artifact
    ? getArtifactContent(artifact)
    : undefined;

  if (!artifact && isStreaming) {
    return <ArtifactLoading />;
  }

  if (!artifact || !currentArtifactContent) {
    return <div className="w-full h-full"></div>;
  }

  return (
    <div className="relative w-full h-full max-h-screen overflow-auto">
      <ArtifactHeader
        minimalCanvas={minimalCanvas}
        isArtifactSaved={isArtifactSaved}
        currentArtifactContent={currentArtifactContent}
        selectedAssistant={selectedAssistant}
        artifactUpdateFailed={artifactUpdateFailed}
        chatCollapsed={props.chatCollapsed}
        setChatCollapsed={props.setChatCollapsed}
        blockNoteEditorRef={blockNoteEditorRef}
        onPrint={
          currentArtifactContent.type === "text" ? handlePrint : undefined
        }
        onTitleChange={(newTitle: string) => {
          if (!artifact) return;
          const updatedContents = artifact.contents.map((c) =>
            c.index === currentArtifactContent.index
              ? { ...c, title: newTitle }
              : c
          );
          setArtifact({ ...artifact, contents: updatedContents });
        }}
      />
      <div
        ref={contentRef}
        className={cn(
          "flex justify-center h-full",
          currentArtifactContent.type === "code" ? "pt-[10px]" : ""
        )}
      >
        <div
          className={cn(
            "relative min-h-full",
            currentArtifactContent.type === "code" ? "min-w-full" : "min-w-full"
          )}
        >
          <div
            className="h-full"
            ref={artifactContentRef}
            data-testid="artifact-content-wrapper"
            onMouseEnter={() => setIsHoveringOverArtifact(true)}
            onMouseLeave={() => setIsHoveringOverArtifact(false)}
          >
            {currentArtifactContent.type === "text" ? (
              <Suspense fallback={<div>Loading...</div>}>
                <TextRenderer
                  minimalCanvas={minimalCanvas}
                  isInputVisible={isInputVisible}
                  isEditing={props.isEditing}
                  isHovering={isHoveringOverArtifact}
                  editorRef={blockNoteEditorRef}
                />
              </Suspense>
            ) : null}
            {currentArtifactContent.type === "code" ? (
              <Suspense fallback={<div>Loading...</div>}>
                <CodeRenderer
                  editorRef={editorRef}
                  isHovering={isHoveringOverArtifact}
                />
              </Suspense>
            ) : null}
          </div>
          <div
            ref={highlightLayerRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        </div>
        {showCanvasActions &&
          selectionBox &&
          isSelectionActive &&
          isValidSelectionOrigin && (
            <AskOpenCanvas
              ref={selectionBoxRef}
              inputValue={inputValue}
              setInputValue={setInputValue}
              isInputVisible={isInputVisible}
              selectionBox={selectionBox}
              setIsInputVisible={setIsInputVisible}
              handleSubmitMessage={handleSubmit}
              handleSelectionBoxMouseDown={handleSelectionBoxMouseDown}
              artifact={artifact}
              selectionIndexes={selectionIndexes}
              handleCleanupState={handleCleanupState}
            />
          )}
      </div>
      {showCanvasActions && (
        <>
          <CustomQuickActions
            streamMessage={streamMessage}
            assistantId={selectedAssistant?.assistant_id}
            user={user}
            isTextSelected={isSelectionActive || selectedBlocks !== undefined}
          />
          {currentArtifactContent.type === "text" ? (
            <ActionsToolbar
              streamMessage={streamMessage}
              isTextSelected={isSelectionActive || selectedBlocks !== undefined}
            />
          ) : null}
          {currentArtifactContent.type === "code" ? (
            <CodeToolBar
              streamMessage={streamMessage}
              isTextSelected={isSelectionActive || selectedBlocks !== undefined}
              language={
                currentArtifactContent.language as ProgrammingLanguageOptions
              }
            />
          ) : null}
        </>
      )}
      {/* Print view portal */}
      {showPrintView &&
        currentArtifactContent.type === "text" &&
        createPortal(
          <Suspense fallback={<div>Loading print view...</div>}>
            <PrintView markdown={currentArtifactContent.fullMarkdown} />
          </Suspense>,
          document.body
        )}
    </div>
  );
}

export const ArtifactRenderer = React.memo(ArtifactRendererComponent);
