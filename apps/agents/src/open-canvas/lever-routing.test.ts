import { HumanMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDetermineTeachingIntent = vi.fn();

vi.mock("./nodes/generate-path/determine-teaching-intent.js", () => ({
  determineTeachingIntent: (...args: unknown[]) =>
    mockDetermineTeachingIntent(...args),
}));

vi.mock("./nodes/generate-path/documents.js", () => ({
  convertContextDocumentToHumanMessage: async () => null,
  fixMisFormattedContextDocMessage: async () => null,
}));

vi.mock("./nodes/generate-path/include-url-contents.js", () => ({
  includeURLContents: async () => null,
}));

vi.mock("./utils.js", () => ({
  getModelConfig: () => ({ modelProvider: "openai", modelName: "gpt-4o" }),
  getModelFromConfig: async () => ({
    invoke: async () => ({ content: "dummy" }),
    withConfig: () => ({ invoke: async () => ({ content: "dummy" }) }),
  }),
  createContextDocumentMessages: async () => [],
  isUsingO1MiniModel: () => false,
  optionallyGetSystemPromptFromConfig: () => null,
  getFormattedReflections: async () => "",
  getStringFromContent: (content: unknown) =>
    typeof content === "string" ? content : "",
}));

vi.mock("pdf-parse", () => ({ default: async () => ({ text: "" }) }));

vi.mock("@opencanvas/shared/utils/urls.js", () => ({
  extractUrls: () => [],
}));

import { routeAfterGeneralReply } from "./index.js";
import { generatePath } from "./nodes/generate-path/index.js";

const canonicalConfiguration = {
  ai_assistance: true,
  ai_canvas_actions: true,
  drafting_gate: "discussion-first" as const,
  threshold: 4,
  tracking: true,
};

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    _messages: [new HumanMessage("Help me with this assignment")],
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockDetermineTeachingIntent.mockReset();
  mockDetermineTeachingIntent.mockResolvedValue({
    route: "generateArtifact",
    reasoning: "mocked artifact route",
  });
});

describe("apparatus lever routing", () => {
  it("routes no-AI profiles to noAiAssignment before any AI route", async () => {
    const result = await generatePath(
      makeState({
        next: "generateArtifact",
        apparatusConfiguration: {
          ...canonicalConfiguration,
          ai_assistance: false,
          ai_canvas_actions: false,
          drafting_gate: "none",
          threshold: 0,
        },
      }),
      {} as any
    );

    expect(result.next).toBe("noAiAssignment");
    expect(result.next).not.toBe("replyToGeneralInput");
    expect(result.next).not.toBe("generateArtifact");
    expect(mockDetermineTeachingIntent).not.toHaveBeenCalled();
  });

  it("routes canvas actions to noAiAssignment when canvas actions are disabled", async () => {
    const result = await generatePath(
      makeState({
        highlightedCode: "const value = 1;",
        apparatusConfiguration: {
          ...canonicalConfiguration,
          ai_canvas_actions: false,
        },
      }),
      {} as any
    );

    expect(result.next).toBe("noAiAssignment");
  });

  it("cleans state after a general reply when AI assistance is disabled", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          phase_state: "socratic",
          apparatusConfiguration: {
            ...canonicalConfiguration,
            ai_assistance: false,
          },
        })
      )
    ).toBe("cleanState");
  });

  it("skips thesis assessment when the drafting gate is disabled", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          apparatusConfiguration: {
            ...canonicalConfiguration,
            drafting_gate: "none",
            threshold: 0,
          },
        })
      )
    ).toBe("cleanState");
  });

  it("skips thesis assessment for an open workspace with no apparatus", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          phase_state: undefined,
          apparatusConfiguration: undefined,
        })
      )
    ).toBe("cleanState");
  });

  it("skips thesis assessment when drafting_gate is undefined on a persisted apparatus", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          phase_state: undefined,
          apparatusConfiguration: {
            ...canonicalConfiguration,
            drafting_gate: undefined,
          },
        })
      )
    ).toBe("cleanState");
  });

  it("assesses a thesis when drafting_gate is an empty string", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          phase_state: undefined,
          apparatusConfiguration: {
            ...canonicalConfiguration,
            drafting_gate: "",
          },
        })
      )
    ).toBe("assessThesis");
  });

  it("assesses a thesis for the canonical socratic profile", () => {
    expect(
      routeAfterGeneralReply(
        makeState({
          phase_state: "socratic",
          apparatusConfiguration: canonicalConfiguration,
        })
      )
    ).toBe("assessThesis");
  });
});
