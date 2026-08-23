import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { determineTeachingIntent } from "./determine-teaching-intent.js";
import {
  createMockConfig,
  MockModel,
} from "../../__test-helpers__/mock-config.js";

// pdf-parse reads a fixture at require time from process.cwd(); mocking it avoids
// the spurious ENOENT when utils.js is importOriginal'd below.
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

vi.mock("../../../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils.js")>();
  return {
    ...actual,
    getModelFromConfig: vi.fn(),
    createContextDocumentMessages: vi.fn().mockResolvedValue([]),
    formatArtifactContentWithTemplate: vi
      .fn()
      .mockImplementation(
        (_template: string, content: { fullMarkdown?: string }) =>
          content.fullMarkdown || ""
      ),
  };
});

import { getModelFromConfig } from "../../../utils.js";

describe("determineTeachingIntent", () => {
  let mockModel: MockModel;

  beforeEach(() => {
    mockModel = new MockModel();
    vi.mocked(getModelFromConfig).mockResolvedValue(mockModel as any);
    mockModel.clearToolCallResponses();
  });

  it("defaults to replyToGeneralInput when the model returns no tool call", async () => {
    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("Just a question")],
        phase_state: "drafting",
        artifact: undefined,
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("replyToGeneralInput");
  });

  it("returns the model's route and reasoning when tool call is valid", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "integrateCanvasDirection",
      reasoning: "Student gave a thesis point to weave in.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage(
            "What is novel is that language skills are needed to negotiate with LLMs."
          ),
        ],
        phase_state: "drafting",
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "## Section\n\nOld text." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("integrateCanvasDirection");
    expect(result.reasoning).toContain("thesis point");
  });

  it("overrides integrateCanvasDirection to generateArtifact on blank canvas", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "integrateCanvasDirection",
      reasoning: "Student gave content direction.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("Start with this thesis point.")],
        phase_state: "drafting",
        artifact: undefined,
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("generateArtifact");
  });

  it("forces an explicit canvas-write request to generateArtifact in an open workspace", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "replyToGeneralInput",
      reasoning: "Student appears to be asking for coaching.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage("write some tips about evaluchat in the canvas"),
        ],
        phase_state: undefined,
        apparatusConfiguration: undefined,
        artifact: undefined,
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("generateArtifact");
    expect(result.reasoning).toContain("Explicit canvas-write request");
  });

  it("forces an explicit canvas-write request to generateArtifact when drafting_gate is undefined", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "replyToGeneralInput",
      reasoning: "Student appears to be asking for coaching.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("write some tips in the canvas")],
        phase_state: undefined,
        apparatusConfiguration: {
          ai_assistance: true,
          ai_canvas_actions: true,
          drafting_gate: undefined,
          threshold: 4,
          tracking: true,
        },
        artifact: undefined,
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("generateArtifact");
  });

  it("does not apply the drafting override when drafting_gate is an empty string", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "replyToGeneralInput",
      reasoning: "Student appears to be asking for coaching.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("write some tips in the canvas")],
        phase_state: undefined,
        apparatusConfiguration: {
          ai_assistance: true,
          ai_canvas_actions: true,
          drafting_gate: "",
          threshold: 4,
          tracking: true,
        },
        artifact: undefined,
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("replyToGeneralInput");
  });

  it("appends an explicit canvas-write request in an open workspace with content", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "replyToGeneralInput",
      reasoning: "Student appears to be asking for coaching.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("put that in the canvas")],
        phase_state: undefined,
        apparatusConfiguration: undefined,
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "Existing canvas text." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("generateArtifact");
  });

  it("keeps generateArtifact routed to chat in socratic phase when the canvas has content", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "generateArtifact",
      reasoning: "Student asked for a new artifact.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage("write some tips about evaluchat in the canvas"),
        ],
        phase_state: undefined,
        apparatusConfiguration: {
          ai_assistance: true,
          ai_canvas_actions: true,
          drafting_gate: "discussion-first",
          threshold: 4,
          tracking: true,
        },
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "Existing canvas text." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("replyToGeneralInput");
  });

  it("overrides non-rewrite routes to chat in socratic phase", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "integrateCanvasDirection",
      reasoning: "Content direction.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("Add this to the doc.")],
        phase_state: "socratic",
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "## Section\n\nOld text." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("replyToGeneralInput");
  });

  it("allows rewriteArtifact in socratic phase when model selects it", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "rewriteArtifact",
      reasoning: "Explicit full rewrite request.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage("Rewrite the whole document to be shorter."),
        ],
        phase_state: "socratic",
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "Long document text." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("rewriteArtifact");
  });

  it("re-routes targeted section edits away from rewriteArtifact in drafting phase (REG-REGRESSION: prod wipe)", async () => {
    // The model misjudges a structural removal as a full rewrite. The safety net
    // must catch it: "Remove 4.5 and the corresponding reference" destroyed every
    // section after 4.5 when it hit rewriteArtifact in production.
    mockModel.setToolCallResponse("classify_intent", {
      route: "rewriteArtifact",
      reasoning: "Structural edit to the existing document.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage(
            "I've seen Bloom's sigma-2 tutor theory debunked - Remove 4.5 and the corresponding reference."
          ),
        ],
        phase_state: "drafting",
        artifact: {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              type: "text",
              fullMarkdown:
                "## 1. Intro\n\n## 4.5 Bloom\n\n## 4.6 Something\n\n## 5. Conclusion\n",
            },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("integrateCanvasDirection");
    expect(result.reasoning).toContain("destructive");
  });

  it("re-routes targeted removals to coaching in socratic phase (never rewriteArtifact)", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "rewriteArtifact",
      reasoning: "Structural edit to the existing document.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [new HumanMessage("Remove section 4.5.")],
        phase_state: "socratic",
        artifact: {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              type: "text",
              fullMarkdown:
                "## 4.5 Bloom\n\n## 4.6 Relevance\n\n## 5. Conclusion\n",
            },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("replyToGeneralInput");
  });

  it("still allows rewriteArtifact for a genuine whole-document rewrite (make it shorter)", async () => {
    mockModel.setToolCallResponse("classify_intent", {
      route: "rewriteArtifact",
      reasoning: "Rewrite to be shorter.",
    });

    const result = await determineTeachingIntent({
      state: {
        _messages: [
          new HumanMessage("Rewrite the entire essay to be much shorter."),
        ],
        phase_state: "drafting",
        artifact: {
          currentIndex: 1,
          contents: [
            { index: 1, type: "text", fullMarkdown: "Long document." },
          ],
        },
      } as any,
      newMessages: [],
      config: createMockConfig(),
    });

    expect(result.route).toBe("rewriteArtifact");
  });
});
