import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePath } from "./index.js";
import {
  createMockConfig,
  createMockState,
} from "../../__test-helpers__/mock-config.js";
import { HumanMessage } from "@langchain/core/messages";

// Mock pdf-parse to prevent file system access during testing
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock the dynamic-determine-path module
vi.mock("./dynamic-determine-path.js", () => ({
  dynamicDeterminePath: vi
    .fn()
    .mockResolvedValue({ route: "generateArtifact" }),
}));

const mockDetermineTeachingIntent = vi.fn();
vi.mock("./determine-teaching-intent.js", () => ({
  determineTeachingIntent: (...args: unknown[]) =>
    mockDetermineTeachingIntent(...args),
}));

// Mock other dependencies
vi.mock("./documents.js", () => ({
  convertContextDocumentToHumanMessage: vi.fn().mockResolvedValue(null),
  fixMisFormattedContextDocMessage: vi.fn().mockResolvedValue(null),
}));

vi.mock("./include-url-contents.js", () => ({
  includeURLContents: vi.fn().mockResolvedValue(undefined),
}));

describe("generatePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetermineTeachingIntent.mockReset();
    mockDetermineTeachingIntent.mockResolvedValue({
      route: "replyToGeneralInput",
      reasoning: "mock default coaching chat",
    });
  });

  it("should honor explicit next route when provided", async () => {
    const state = createMockState({
      next: "replyToGeneralInput",
      phase_state: "drafting", // Even with different phase, should honor explicit next
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result).toEqual({
      next: "replyToGeneralInput",
    });
  });

  it("should route to updateArtifact when highlightedCode is set", async () => {
    const state = createMockState({
      highlightedCode: {
        startCharIndex: 0,
        endCharIndex: 20,
      },
      phase_state: "socratic", // Even in socratic phase, highlights should go through
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("updateArtifact");
  });

  it("should route to updateHighlightedText when highlightedText is set with edit intent", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Rewrite this paragraph to be clearer",
          id: "test-msg-1",
        }),
      ],
      highlightedText: {
        fullMarkdown: "Selected text",
        markdownBlock: "Selected text",
        selectedText: "Selected text",
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("updateHighlightedText");
  });

  it("should route to replyToGeneralInput when highlightedText is set but message is a question", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Does this section fit here?",
          id: "test-msg-1",
        }),
      ],
      highlightedText: {
        fullMarkdown: "Selected text",
        markdownBlock: "Selected text",
        selectedText: "Selected text",
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should route to replyToGeneralInput when phase_state is socratic (thesis development)", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "Help me with my thesis",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const { dynamicDeterminePath } = await import(
      "./dynamic-determine-path.js"
    );

    const result = await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(dynamicDeterminePath).not.toHaveBeenCalled();
    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should use the drafting teaching path for an open workspace initial state", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "generateArtifact",
      reasoning: "explicit canvas-write request in drafting phase",
    });

    const state = createMockState({
      phase_state: undefined,
      apparatusConfiguration: undefined,
      _messages: [
        new HumanMessage({
          content: "write some tips about evaluchat in the canvas",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const { dynamicDeterminePath } = await import(
      "./dynamic-determine-path.js"
    );

    const result = await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(dynamicDeterminePath).not.toHaveBeenCalled();
    expect(result.next).toBe("generateArtifact");
  });

  it("should route to generateArtifact when writing intent detected in drafting phase", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "generateArtifact",
      reasoning: "student asked to draft on canvas",
    });

    const state = createMockState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage({
          content: "Can you write the next section about Pip in London?",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const { dynamicDeterminePath } = await import(
      "./dynamic-determine-path.js"
    );

    const result = await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(dynamicDeterminePath).not.toHaveBeenCalled();
    expect(result.next).toBe("generateArtifact");
  });

  it("should route conversational messages to replyToGeneralInput in drafting phase", async () => {
    const state = createMockState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage({
          content: "How is my essay looking so far?",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const { dynamicDeterminePath } = await import(
      "./dynamic-determine-path.js"
    );

    const result = await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(dynamicDeterminePath).not.toHaveBeenCalled();
    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should route acknowledgments to replyToGeneralInput when phase_state is drafting", async () => {
    const state = createMockState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage({
          content: "ok",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should route to rewriteArtifactTheme when theme options are set", async () => {
    const state = createMockState({
      language: "spanish",
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("rewriteArtifactTheme");
  });

  it("should route to rewriteCodeArtifactTheme when code options are set", async () => {
    const state = createMockState({
      addComments: true,
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("rewriteCodeArtifactTheme");
  });

  it("should route to customAction when customQuickActionId is set", async () => {
    const state = createMockState({
      customQuickActionId: "test-action-123",
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("customAction");
  });

  it("should route to webSearch when webSearchEnabled is true", async () => {
    const state = createMockState({
      webSearchEnabled: true,
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("webSearch");
  });

  it("should NOT prioritize socratic phase over other routing options", async () => {
    const state = createMockState({
      phase_state: "socratic",
      // These should trigger their respective routes even in socratic phase
      language: "spanish", // This should win since it comes first
      addComments: true,
      customQuickActionId: "test-action",
      webSearchEnabled: true,
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    // Language (rewriteArtifactTheme) should take precedence over socratic routing
    expect(result.next).toBe("rewriteArtifactTheme");
  });

  it("should allow highlights through in socratic phase", async () => {
    const state = createMockState({
      phase_state: "socratic",
      highlightedCode: {
        startCharIndex: 0,
        endCharIndex: 20,
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    // Highlights should go through even in socratic phase
    expect(result.next).toBe("updateArtifact");
  });

  it("should route to replyToGeneralInput when student asks to write in socratic phase", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "Please write an intro paragraph on the canvas",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should route conversational messages to replyToGeneralInput in socratic phase", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "I think Pip is a jerk",
          id: "test-msg-1",
        }),
      ],
    });
    const config = createMockConfig();

    const { dynamicDeterminePath } = await import(
      "./dynamic-determine-path.js"
    );

    await generatePath(state, config);

    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(dynamicDeterminePath).not.toHaveBeenCalled();
  });
});
