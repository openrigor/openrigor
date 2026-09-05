// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactMarkdownV3 } from "@opencanvas/shared/types";

// ---- hoisted shared fixture ----
const harness = vi.hoisted(() => {
  const content = {
    index: 1,
    type: "text" as const,
    title: "Test canvas",
    fullMarkdown: "# Hello\n\nWorld.",
  } satisfies ArtifactMarkdownV3;
  const editor: any = {
    document: [],
    getSelectedText: () => "",
    getSelection: () => null,
    blocksToMarkdownLossy: vi.fn(async () => ""),
    replaceBlocks: vi.fn(),
  };
  editor._tiptapEditor = {
    on: vi.fn(),
    off: vi.fn(),
    state: {
      tr: {},
      selection: { $head: { pos: 0 }, from: 0, to: 0 },
      doc: { textContent: "" },
    },
  };
  return {
    content,
    editor,
    setArtifact: vi.fn(),
    setUpdateRenderedArtifactRequired: vi.fn(),
    setPendingEdit: vi.fn(),
    setEditorTextContent: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setCursorPosition: vi.fn(),
    setEditorHasFocus: vi.fn(),
    graphData: {
      artifact: { currentIndex: 1, contents: [content] },
      isStreaming: false,
      isArtifactSaved: true,
      artifactUpdateFailed: false,
      updateRenderedArtifactRequired: false,
      artifactSyncGeneration: 0,
      pendingEdit: null,
      phaseState: "idle",
      selectedBlocks: undefined,
      setArtifact: vi.fn(),
      setSelectedBlocks: vi.fn(),
      setUpdateRenderedArtifactRequired: vi.fn(),
      setPendingEdit: vi.fn(),
      setEditorTextContent: vi.fn(),
      setCursorPosition: vi.fn(),
      setEditorHasFocus: vi.fn(),
      streamMessage: vi.fn(),
      setMessages: vi.fn(),
    },
  };
});

vi.mock("@/contexts/GraphContext", () => ({
  useGraphContext: () => ({ graphData: harness.graphData }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("@blocknote/core", () => ({
  locales: {},
}));

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => harness.editor,
  FormattingToolbarController: () => null,
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: () => [],
}));

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: function BlockNoteView({
    children,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) {
    return <div {...rest}>{children}</div>;
  },
}));

vi.mock("@/components/ui/assistant-ui/tooltip-icon-button", () => ({
  TooltipIconButton: React.forwardRef(function TooltipIconButton(
    {
      children,
      onClick,
      tooltip,
      ...rest
    }: React.PropsWithChildren<{
      onClick?: () => void;
      tooltip?: string;
    }> &
      Record<string, unknown>,
    ref: React.Ref<HTMLButtonElement>
  ) {
    return (
      <button
        ref={ref}
        title={tooltip}
        onClick={onClick}
        type="button"
        {...rest}
      >
        {children}
      </button>
    );
  }),
}));

vi.mock("./CustomFormattingToolbar", () => ({
  CustomFormattingToolbar: () => null,
}));

vi.mock("./EditActionBar", () => ({
  EditActionBar: () => null,
}));

vi.mock("./TrackChangesExtension", () => ({
  default: {},
  setTrackChangesRanges: vi.fn(),
  clearTrackChangesRanges: vi.fn(),
}));

vi.mock("./MathInlineExtension", () => ({ default: {} }));

vi.mock("./canvas-schema", () => ({ canvasSchema: {} }));

vi.mock("./mermaid-markdown", () => ({
  parseMarkdownToCanvasBlocks: vi.fn(async () => []),
  exportCanvasBlocksToMarkdown: vi.fn(async () => "# Hello\n\nWorld."),
}));

import { TextRenderer } from "./TextRenderer";

function renderCanvas(minimalCanvas: boolean) {
  const toggleRef = { current: null as (() => void) | null };
  const onRawViewChange = vi.fn();
  const view = render(
    <TextRenderer
      isEditing={false}
      isHovering
      isInputVisible
      minimalCanvas={minimalCanvas}
      toggleRef={toggleRef}
      onRawViewChange={onRawViewChange}
    />
  );
  return { toggleRef, onRawViewChange, view };
}

describe("TextRenderer raw markdown toggle (header-bar contract)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("publishes toggleRawView via toggleRef on the minimal (workspace) canvas", async () => {
    const { toggleRef } = renderCanvas(true);
    await waitFor(() => expect(toggleRef.current).toBeTypeOf("function"));
  });

  it("round-trips rendered → raw → rendered via the header toggle", async () => {
    const { toggleRef, onRawViewChange } = renderCanvas(true);
    await waitFor(() => expect(toggleRef.current).toBeTypeOf("function"));

    toggleRef.current?.();
    const raw = await screen.findByTestId("canvas-editor-raw");
    expect((raw as HTMLTextAreaElement).value).toContain("# Hello");

    toggleRef.current?.();
    await waitFor(() =>
      expect(screen.getByTestId("canvas-editor")).toBeTruthy()
    );
    // state reported upstream for the header icon (Eye ↔ EyeOff)
    await waitFor(() =>
      expect(onRawViewChange).toHaveBeenLastCalledWith(false)
    );
  });

  it("clears toggleRef on unmount", async () => {
    const { toggleRef, view } = renderCanvas(true);
    await waitFor(() => expect(toggleRef.current).toBeTypeOf("function"));
    view.unmount();
    expect(toggleRef.current).toBeNull();
  });
});
