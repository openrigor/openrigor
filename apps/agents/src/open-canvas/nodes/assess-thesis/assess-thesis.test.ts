import { describe, it, expect, vi, beforeEach } from "vitest";
import { assessThesis, isSocraticPhase } from "./index.js";
import {
  createMockConfig,
  createMockState,
  MockModel,
} from "../../__test-helpers__/mock-config.js";
import { HumanMessage } from "@langchain/core/messages";

const socraticApparatusConfiguration = {
  ai_assistance: true,
  ai_canvas_actions: true,
  drafting_gate: "discussion-first" as const,
  threshold: 4,
  tracking: true,
};

function createSocraticState(overrides: Record<string, unknown> = {}) {
  return createMockState({
    apparatusConfiguration: socraticApparatusConfiguration,
    ...overrides,
  });
}

// Mock pdf-parse to prevent file system access during testing
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock the utils module to control the model
vi.mock("../../../utils.js", () => ({
  getModelFromConfig: vi.fn(),
  optionallyGetSystemPromptFromConfig: vi.fn(),
}));

describe("isSocraticPhase", () => {
  it("should return true for undefined phase", () => {
    expect(isSocraticPhase(undefined)).toBe(true);
  });

  it("should return true for socratic phase", () => {
    expect(isSocraticPhase("socratic")).toBe(true);
  });

  it("should return false for drafting phase", () => {
    expect(isSocraticPhase("drafting")).toBe(false);
  });

  it("should return false for submitted phase", () => {
    expect(isSocraticPhase("submitted")).toBe(false);
  });
});

describe("assessThesis", () => {
  let mockModel: MockModel;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockModel = new MockModel();

    const { getModelFromConfig, optionallyGetSystemPromptFromConfig } =
      vi.mocked(await import("../../../utils.js"));

    getModelFromConfig.mockResolvedValue(mockModel as any);
    optionallyGetSystemPromptFromConfig.mockReturnValue(undefined);
  });

  it("should return empty object when no assignment context", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Test message", id: "1" })],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue(undefined);

    const result = await assessThesis(state, config);

    expect(result).toEqual({});
  });

  it("should return empty object when not in socratic phase", async () => {
    const state = createSocraticState({
      phase_state: "drafting", // Not socratic
      _messages: [new HumanMessage({ content: "Test message", id: "1" })],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    const result = await assessThesis(state, config);

    expect(result).toEqual({});
  });

  it("should auto-pass an open workspace with no apparatus", async () => {
    const state = createMockState({
      phase_state: undefined,
      apparatusConfiguration: undefined,
      _messages: [new HumanMessage({ content: "Test message", id: "1" })],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    const result = await assessThesis(state, config);

    expect(result).toEqual({
      thesis: {
        passed: true,
        feedback: "Drafting gate disabled by the apparatus profile.",
      },
      phase_state: "drafting",
    });
    expect(mockModel.invoke).not.toHaveBeenCalled();
  });

  it("should return empty object when no human messages", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [], // No messages
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    const result = await assessThesis(state, config);

    expect(result).toEqual({});
  });

  it("should return thesis passed and phase transition when model returns passed: true", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content:
            "I believe Hamlet's delay is caused by his philosophical nature",
          id: "1",
        }),
      ],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue(
      "Write an essay about Hamlet"
    );

    // Configure mock model to return a passing assessment
    mockModel.setToolCallResponse("assess_thesis", {
      passed: true,
      feedback: "Clear, arguable thesis about Hamlet's character",
      thesis: "Hamlet's delay is caused by his philosophical nature",
    });

    const result = await assessThesis(state, config);

    expect(result).toEqual({
      thesis: {
        passed: true,
        feedback: "Clear, arguable thesis about Hamlet's character",
        thesis: "Hamlet's delay is caused by his philosophical nature",
      },
      phase_state: "drafting", // Should transition to drafting
    });
  });

  it("should return thesis failed without phase transition when model returns passed: false", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "I want to write about Hamlet",
          id: "1",
        }),
      ],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue(
      "Write an essay about Hamlet"
    );

    // Configure mock model to return a failing assessment
    mockModel.setToolCallResponse("assess_thesis", {
      passed: false,
      feedback: "Too vague - needs a specific, arguable claim",
      thesis: undefined, // No thesis articulated yet
    });

    const result = await assessThesis(state, config);

    expect(result).toEqual({
      thesis: {
        passed: false,
        feedback: "Too vague - needs a specific, arguable claim",
        // No thesis property when undefined
      },
      // No phase_state transition
    });
  });

  it("should handle model returning no tool calls", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Test message", id: "1" })],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    // Clear all tool call responses so model returns no tool calls
    mockModel.clearToolCallResponses();

    const result = await assessThesis(state, config);

    expect(result).toEqual({});
  });

  it("should filter out non-visible human messages", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "Hidden message",
          id: "1",
          additional_kwargs: { __oc_hide_from_ui: true },
        }),
        new HumanMessage({
          content: "Visible message with thesis",
          id: "2",
        }),
      ],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    mockModel.setToolCallResponse("assess_thesis", {
      passed: true,
      feedback: "Good thesis",
      thesis: "My thesis statement",
    });

    await assessThesis(state, config);

    // The model should have been called (indicating visible messages were found)
    expect(mockModel.invoke).toHaveBeenCalled();
  });

  it("should auto-pass thesis via escape hatch when student has 8+ visible messages", async () => {
    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue(
      "Write an essay about Hamlet"
    );

    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "Hidden kickoff",
          id: "0",
          additional_kwargs: { __oc_hide_from_ui: true },
        }),
        new HumanMessage({ content: "I think Hamlet is indecisive", id: "1" }),
        new HumanMessage({
          content: "His procrastination is the key",
          id: "2",
        }),
        new HumanMessage({ content: "The ghost changes everything", id: "3" }),
        new HumanMessage({ content: "It's about action vs inaction", id: "4" }),
        new HumanMessage({
          content: "My thesis: Hamlet's delay reflects existential doubt",
          id: "5",
        }),
        new HumanMessage({
          content: "The nunnery scene shows his distrust",
          id: "6",
        }),
        new HumanMessage({
          content: "He also questions the meaning of life in the soliloquy",
          id: "7",
        }),
        new HumanMessage({
          content: "So his delay is philosophical not cowardly",
          id: "8",
        }),
      ],
    });
    const config = createMockConfig();

    const result = await assessThesis(state, config);

    // Should auto-pass without calling the LLM
    expect(result.phase_state).toBe("drafting");
    expect(result.thesis?.passed).toBe(true);
    expect(result.thesis?.feedback).toContain("Auto-approved");
    expect(mockModel.invoke).not.toHaveBeenCalled();
  });

  it("does not auto-pass a placeholder through the escape hatch", async () => {
    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue(
      "Write an essay about Hamlet"
    );

    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({
          content: "I think Hamlet delays because he overthinks everything",
          id: "1",
        }),
        new HumanMessage({
          content: "The ghost makes him question what action is right",
          id: "2",
        }),
        new HumanMessage({
          content: "His soliloquies show his fear of making the wrong choice",
          id: "3",
        }),
        new HumanMessage({ content: "Participant reply 4", id: "4" }),
      ],
    });
    const config = createMockConfig();

    const result = await assessThesis(state, config);

    expect(result).toEqual({
      thesis: {
        passed: false,
        feedback:
          "Placeholder detected — ask the student to elaborate before unlocking drafting.",
      },
    });
    expect(mockModel.invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])(
    "does not auto-pass restored human input with %s content through the escape hatch",
    async (_description, content) => {
      const { optionallyGetSystemPromptFromConfig } = vi.mocked(
        await import("../../../utils.js")
      );
      optionallyGetSystemPromptFromConfig.mockReturnValue(
        "Write an essay about Hamlet"
      );

      const state = createSocraticState({
        phase_state: "socratic",
        _messages: [
          new HumanMessage({
            content: "I think Hamlet delays because he overthinks everything",
            id: "1",
          }),
          new HumanMessage({
            content: "The ghost makes him question what action is right",
            id: "2",
          }),
          new HumanMessage({
            content: "His soliloquies show his fear of making the wrong choice",
            id: "3",
          }),
          { type: "human", content, id: "4" },
        ],
      });
      const config = createMockConfig();

      const result = await assessThesis(state, config);

      expect(result).toEqual({
        thesis: {
          passed: false,
          feedback:
            "Placeholder detected — ask the student to elaborate before unlocking drafting.",
        },
      });
      expect(mockModel.invoke).not.toHaveBeenCalled();
    }
  );

  it("should include recent student messages in the prompt", async () => {
    const state = createSocraticState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({ content: "Message 1", id: "1" }),
        new HumanMessage({ content: "Message 2", id: "2" }),
        new HumanMessage({ content: "Message 3 with thesis", id: "3" }),
      ],
    });
    const config = createMockConfig();

    const { optionallyGetSystemPromptFromConfig } = vi.mocked(
      await import("../../../utils.js")
    );
    optionallyGetSystemPromptFromConfig.mockReturnValue("Assignment prompt");

    mockModel.setToolCallResponse("assess_thesis", {
      passed: true,
      feedback: "Good thesis",
      thesis: "My thesis",
    });

    await assessThesis(state, config);

    // Verify the model was called with a prompt containing student messages
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Message 1"),
      }),
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Message 3 with thesis"),
      }),
    ]);
  });
});
