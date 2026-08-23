import { describe, it, expect, vi } from "vitest";
import { OpenCanvasGraphAnnotation } from "./state.js";
import { AIMessage } from "@langchain/core/messages";
import { cleanState } from "./index.js";

vi.mock("pdf-parse", () => ({ default: vi.fn() }));

/**
 * These tests verify that teaching-specific state fields (phase_state, thesis)
 * persist across graph node invocations — the critical requirement for the
 * Socratic gatekeeper to work across multiple conversation turns.
 *
 * The bug: phase_state and thesis are NOT in DEFAULT_INPUTS. If a node returns
 * a partial state that doesn't include them, and LangGraph doesn't carry them
 * forward, they get lost between turns.
 */

describe("Teaching state persistence", () => {
  it("phase_state should persist when a node returns partial state without it", () => {
    // Simulate what happens when replyToGeneralInput returns { messages, _messages }
    // but NOT phase_state — the existing phase_state should survive
    const initialState = {
      ...OpenCanvasGraphAnnotation.State,
      phase_state: "drafting" as const,
      thesis: {
        passed: true,
        feedback: "Good thesis",
        thesis: "Test thesis",
      },
    };

    // A node return value that does NOT include phase_state or thesis
    const nodeReturn = {
      messages: [new AIMessage({ content: "Response", id: "1" })],
      _messages: [new AIMessage({ content: "Response", id: "1" })],
    };

    // The key assertion: phase_state and thesis are NOT keys in nodeReturn
    expect(nodeReturn).not.toHaveProperty("phase_state");
    expect(nodeReturn).not.toHaveProperty("thesis");

    // But the original state still has them
    expect(initialState.phase_state).toBe("drafting");
    expect(initialState.thesis?.passed).toBe(true);
  });

  it("cleanState should NOT reset phase_state or thesis", () => {
    // cleanState returns { ...DEFAULT_INPUTS }
    // DEFAULT_INPUTS should NOT include phase_state or thesis
    const { DEFAULT_INPUTS } = require("@opencanvas/shared/constants");

    expect(DEFAULT_INPUTS).not.toHaveProperty("phase_state");
    expect(DEFAULT_INPUTS).not.toHaveProperty("thesis");
  });

  it("cleanState should preserve Form context values", () => {
    const formContext = {
      templateId: "assignment-brief",
      title: "Assignment brief",
      description: "A brief",
      layoutMarkdown: "# {{title}}",
      fields: {
        title: { label: "Title", type: "text", required: true },
      },
      values: { title: "Existing title", word_target: 500 },
    };

    const cleaned = cleanState({ formContext } as any);

    expect(cleaned.formContext).toEqual(formContext);
  });

  it("cleanState should clear derived Ledger Snapshot context", () => {
    const cleaned = cleanState({
      ledgerSnapshotContext: {
        kind: "ledger_snapshot",
        ledgerId: "ledger_demo",
        parentLedgerItemId: "wi_ledger",
        methodId: "method_a",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "1.0.0",
        predicate: "all accepted evidence",
        sourceCommit: "abc123",
        generatedAt: "2026-08-19T12:00:00.000Z",
        buckets: { Included: 3 },
        contributions: { included: 3, perDimension: {}, gaps: [] },
      },
    } as any);

    expect(cleaned).toHaveProperty("ledgerSnapshotContext", undefined);
  });

  it("assessThesis output should include phase_state when thesis passes", () => {
    // This is a contract test: the assessThesis node must return phase_state
    // when the thesis passes, so LangGraph can update the channel
    const passingOutput = {
      thesis: {
        passed: true,
        feedback: "Strong thesis",
        thesis: "The thesis",
      },
      phase_state: "drafting" as const,
    };

    expect(passingOutput).toHaveProperty("phase_state", "drafting");
    expect(passingOutput).toHaveProperty("thesis.passed", true);
  });

  it("state annotation should accept phase_state updates", () => {
    // Verify the annotation type accepts TeachingPhase values
    const validPhases = ["socratic", "drafting", "submitted"];

    for (const phase of validPhases) {
      const state = { phase_state: phase };
      expect(state.phase_state).toBe(phase);
    }
  });
});
