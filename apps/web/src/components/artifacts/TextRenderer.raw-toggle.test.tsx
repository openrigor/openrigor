// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactMarkdownV3 } from "@opencanvas/shared/types";

// Regression: the raw-markdown toggle must render on every canvas surface.
// PR #50-era `minimalCanvas` mode (workspace canvases) suppressed the toggle
// entirely, so workspace items had no way to switch between rendered and raw
// markdown. The toggle is decoupled from minimalCanvas; only the formatting
// toolbar and slash menu stay gated.

const harness = vi.hoisted(() => {
  const content = {
    index: 1,
    type: "text" as const,
    title: "Test canvas",
    fullMarkdown: "# Hello\n\nWorld.",
  } satisfies ArtifactMarkdownV3;
  const artifact = {
    currentIndex: 1,
    contents: [content],
  };
  const editor = {
    document: [] as unknown[],
    replaceBlocks: vi.fn(),
    getSelectedText: () => "",
    getSelection: () => undefined,
    _tiptapEditor: {
      on: vi.fn(),
      off: vi.fn(),
      dispatch: vi.fn(),
      state: {
        tr: {},
        selection: { $head: { pos: 0 }, from: 0, to: 0 },
        doc: { textContent: "" },
      },
    },
  };
  return {
    editor,
    artifact,
    setArtifact: vi.fn(),
    setUpdateRenderedArtifactRequired: vi.fn(),
    setPendingEdit: vi.fn(),
    setEditorTextContent: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setCursorPosition: vi.fn(),
    setEditorHasFocus: vi.fn(),
    graphData: {
      artifact,
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

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => harness.editor,
  FormattingToolbarController: () => null,
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: () => [],
}));

vi.mock("@blocknote/core", () => ({
  locales: {},
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

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("./components/CopyText", () => ({
  CopyText: () => <button type="button" data-testid="copy-text-stub" />,
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
  return render(
    <TextRenderer
      isEditing={false}
      isHovering
      isInputVisible
      minimalCanvas={minimalCanvas}
    />
  );
}

describe("TextRenderer raw markdown toggle", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the raw toggle on the minimal (workspace) canvas on hover", async () => {
    renderCanvas(true);
    await waitFor(() =>
      expect(screen.getByTestId("toggle-raw-view")).toBeTruthy()
    );
  });

  it("round-trips rendered → raw → rendered on the minimal canvas", async () => {
    renderCanvas(true);
    const toggle = await screen.findByTestId("toggle-raw-view");

    fireEvent.click(toggle);
    const raw = await screen.findByTestId("canvas-editor-raw");
    expect((raw as HTMLTextAreaElement).value).toContain("# Hello");

    fireEvent.click(screen.getByTestId("toggle-raw-view"));
    await waitFor(() =>
      expect(screen.getByTestId("canvas-editor")).toBeTruthy()
    );
  });

  it("still hides the toggle when not hovering and not in raw view", () => {
    render(
      <TextRenderer
        isEditing={false}
        isHovering={false}
        isInputVisible
        minimalCanvas
      />
    );
    expect(screen.queryByTestId("toggle-raw-view")).toBeNull();
  });
});
