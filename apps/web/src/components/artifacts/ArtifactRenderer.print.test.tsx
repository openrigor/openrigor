// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  printViewMountCount: 0,
  graphData: {
    artifact: {
      currentIndex: 0,
      contents: [
        {
          index: 0,
          type: "text" as const,
          title: "Printable artifact",
          fullMarkdown: "# Printable artifact",
        },
      ],
    },
    selectedBlocks: undefined,
    isStreaming: false,
    isArtifactSaved: true,
    artifactUpdateFailed: false,
    setMessages: vi.fn(),
    streamMessage: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setArtifact: vi.fn(),
  },
  headerOnPrint: undefined as (() => void) | undefined,
  printViewOnReady: undefined as (() => void) | undefined,
}));

vi.mock("./header", () => ({
  ArtifactHeader: ({ onPrint }: { onPrint?: () => void }) => {
    harness.headerOnPrint = onPrint;
    return null;
  },
}));

vi.mock("./PrintView", () => ({
  PrintView: ({ onReady }: { onReady?: () => void }) => {
    harness.printViewMountCount += 1;
    harness.printViewOnReady = onReady;
    return null;
  },
}));

vi.mock("./TextRenderer", () => ({ TextRenderer: () => null }));
vi.mock("./CodeRenderer", () => ({ CodeRenderer: () => null }));
vi.mock("./ArtifactLoading", () => ({ ArtifactLoading: () => null }));
vi.mock("./actions_toolbar", () => ({
  ActionsToolbar: () => null,
  CodeToolBar: () => null,
}));
vi.mock("./actions_toolbar/custom", () => ({
  CustomQuickActions: () => null,
}));
vi.mock("./components/AskOpenCanvas", () => {
  const AskOpenCanvas = React.forwardRef(() => null);
  AskOpenCanvas.displayName = "AskOpenCanvas";
  return { AskOpenCanvas };
});
vi.mock("@/contexts/GraphContext", () => ({
  useGraphContext: () => ({ graphData: harness.graphData }),
}));
vi.mock("@/contexts/AssistantContext", () => ({
  useAssistantContext: () => ({ selectedAssistant: undefined }),
}));
vi.mock("@/contexts/UserContext", () => ({
  useUserContext: () => ({ user: undefined }),
}));
vi.mock("@/contexts/TeachingAssignmentContext", () => ({
  useTeachingAssignmentOptional: () => undefined,
}));

import { ArtifactRenderer } from "./ArtifactRenderer";

const rendererProps = {
  isEditing: false,
  setIsEditing: vi.fn(),
  chatCollapsed: false,
  setChatCollapsed: vi.fn(),
  minimalCanvas: true,
};

describe("ArtifactRenderer print readiness", () => {
  beforeEach(() => {
    harness.headerOnPrint = undefined;
    harness.printViewOnReady = undefined;
    harness.printViewMountCount = 0;
    vi.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("waits for the mounted PrintView readiness signal before printing", async () => {
    render(<ArtifactRenderer {...rendererProps} />);

    await waitFor(() => expect(harness.headerOnPrint).toBeDefined());
    harness.headerOnPrint?.();

    await waitFor(() => expect(harness.printViewOnReady).toBeDefined());
    expect(window.print).not.toHaveBeenCalled();

    harness.printViewOnReady?.();

    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  });

  it("uses the logged safety fallback if PrintView never signals readiness", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<ArtifactRenderer {...rendererProps} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.headerOnPrint).toBeDefined();
    await act(async () => {
      harness.headerOnPrint?.();
      await Promise.resolve();
    });

    expect(harness.printViewMountCount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(warn).toHaveBeenCalledWith(
      "[print] PrintView did not signal readiness before the fallback; cancelling this print attempt. You can retry."
    );
    expect(window.print).not.toHaveBeenCalled();
    expect(screen.getByTestId("print-retry")).toBeTruthy();
    expect(harness.printViewMountCount).toBe(1);

    await act(async () => {
      fireEvent.click(screen.getByTestId("print-retry"));
      await Promise.resolve();
    });

    expect(screen.queryByTestId("print-retry")).toBeNull();
    expect(harness.printViewMountCount).toBe(2);
    expect(window.print).not.toHaveBeenCalled();
  });
});
