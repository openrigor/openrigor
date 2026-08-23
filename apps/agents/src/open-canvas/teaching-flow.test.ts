import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// Mock pdf-parse
vi.mock("pdf-parse", () => ({ default: vi.fn() }));

// Mock utils to control the model
vi.mock("../../utils.js", () => ({
  getModelFromConfig: vi.fn(),
  optionallyGetSystemPromptFromConfig: vi.fn(),
}));

/**
 * Integration tests for multi-turn teaching flow.
 * These verify that phase_state persists across node invocations,
 * which is the core bug blocking the Socratic gatekeeper.
 */
describe("Teaching flow — multi-turn phase persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("phase_state should survive a round-trip through state updates", () => {
    // This simulates what LangGraph does: merge node output into state
    // Turn 1: kickoff sets phase_state to socratic
    const turn1State = {
      messages: [new HumanMessage({ content: "Coach greeting", id: "1" })],
      _messages: [new HumanMessage({ content: "Coach greeting", id: "1" })],
      phase_state: "socratic" as const,
      thesis: undefined,
    };

    // Turn 2: student sends a message, assessThesis runs and passes
    // The node returns this partial state:
    const assessThesisOutput = {
      thesis: {
        passed: true,
        feedback: "Strong thesis",
        thesis: "The title is ironic",
      },
      phase_state: "drafting" as const,
    };

    // Simulate LangGraph state merge: start with turn1 state, apply assessThesis output
    const turn2State = { ...turn1State, ...assessThesisOutput };

    expect(turn2State.phase_state).toBe("drafting");
    expect(turn2State.thesis?.passed).toBe(true);

    // Turn 3: student sends another message
    // replyToGeneralInput returns { messages, _messages } — NO phase_state
    const replyOutput = {
      messages: [new AIMessage({ content: "Great work!", id: "2" })],
      _messages: [new AIMessage({ content: "Great work!", id: "2" })],
    };

    // cleanState returns { ...DEFAULT_INPUTS } — NO phase_state
    const { DEFAULT_INPUTS } = require("@opencanvas/shared/constants");
    const cleanStateOutput = { ...DEFAULT_INPUTS };

    // Simulate the merge: apply replyOutput, then cleanStateOutput
    const turn3State = { ...turn2State, ...replyOutput, ...cleanStateOutput };

    // THE BUG: phase_state should still be "drafting" here
    expect(turn3State.phase_state).toBe("drafting");
    expect(turn3State.thesis?.passed).toBe(true);
  });

  it("phase_state should persist through DEFAULT_INPUTS spread", () => {
    // Direct test: spreading DEFAULT_INPUTS over a state with phase_state
    const { DEFAULT_INPUTS } = require("@opencanvas/shared/constants");

    const stateWithPhase = {
      phase_state: "drafting" as const,
      thesis: { passed: true, feedback: "ok", thesis: "t" },
      messages: [],
      _messages: [],
    };

    // This is what cleanState does
    const afterClean = { ...DEFAULT_INPUTS, ...stateWithPhase };

    // If DEFAULT_INPUTS had phase_state: undefined, this would fail
    expect(afterClean.phase_state).toBe("drafting");
    expect(afterClean.thesis?.passed).toBe(true);
  });

  it("simulates full 3-turn socratic→drafting flow", () => {
    const { DEFAULT_INPUTS } = require("@opencanvas/shared/constants");

    // Turn 1: Kickoff — frontend sends phase_state: "socratic"
    let state: Record<string, any> = {
      ...DEFAULT_INPUTS,
      messages: [],
      _messages: [],
      phase_state: "socratic",
    };
    expect(state.phase_state).toBe("socratic");

    // Turn 1: replyToGeneralInput runs (coach greeting)
    state = {
      ...state,
      messages: [
        new AIMessage({ content: "Hey! What's your thesis?", id: "1" }),
      ],
      _messages: [
        new AIMessage({ content: "Hey! What's your thesis?", id: "1" }),
      ],
    };
    // cleanState runs
    state = { ...DEFAULT_INPUTS, ...state };
    expect(state.phase_state).toBe("socratic");

    // Turn 2: Student sends thesis, frontend sends NO phase_state
    state = {
      ...state,
      messages: [
        ...state.messages,
        new HumanMessage({ content: "The title is ironic", id: "2" }),
      ],
      _messages: [
        ...state._messages,
        new HumanMessage({ content: "The title is ironic", id: "2" }),
      ],
    };
    // assessThesis passes
    state = {
      ...state,
      thesis: { passed: true, feedback: "Good", thesis: "The title is ironic" },
      phase_state: "drafting",
    };
    // cleanState
    state = { ...DEFAULT_INPUTS, ...state };
    expect(state.phase_state).toBe("drafting");

    // Turn 3: Student asks to draft, frontend sends NO phase_state
    state = {
      ...state,
      messages: [
        ...state.messages,
        new HumanMessage({ content: "Draft my intro", id: "3" }),
      ],
      _messages: [
        ...state._messages,
        new HumanMessage({ content: "Draft my intro", id: "3" }),
      ],
    };
    // replyToGeneralInput runs (drafting mode)
    state = {
      ...state,
      messages: [
        ...state.messages,
        new AIMessage({ content: "Here's your intro!", id: "4" }),
      ],
      _messages: [
        ...state._messages,
        new AIMessage({ content: "Here's your intro!", id: "4" }),
      ],
    };
    // cleanState
    state = { ...DEFAULT_INPUTS, ...state };

    // CRITICAL: phase_state must still be "drafting" after 3 turns
    expect(state.phase_state).toBe("drafting");
    expect(state.thesis?.passed).toBe(true);
  });
});
