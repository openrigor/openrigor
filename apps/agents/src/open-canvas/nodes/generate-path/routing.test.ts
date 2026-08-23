/**
 * Integration test: verify generatePath routes mechanical text edits correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";

const mockDetermineTeachingIntent = vi.fn();

vi.mock("../../utils.js", () => ({
  getModelConfig: () => ({ modelProvider: "openai", modelName: "gpt-4o" }),
  getModelFromConfig: async () => ({
    invoke: async () => ({ content: "dummy" }),
    withConfig: () => ({ invoke: async () => ({ content: "dummy" }) }),
  }),
  createContextDocumentMessages: async () => [],
  isUsingO1MiniModel: () => false,
  optionallyGetSystemPromptFromConfig: () => null,
  getFormattedReflections: async () => "",
  getStringFromContent: (c: any) => (typeof c === "string" ? c : ""),
}));

vi.mock("../../nodes/generate-path/dynamic-determine-path.js", () => ({
  dynamicDeterminePath: async () => ({ route: "generateArtifact" }),
}));

vi.mock("../../nodes/generate-path/determine-teaching-intent.js", () => ({
  determineTeachingIntent: (...args: unknown[]) =>
    mockDetermineTeachingIntent(...args),
}));

vi.mock("../../nodes/generate-path/documents.js", () => ({
  convertContextDocumentToHumanMessage: async () => null,
  fixMisFormattedContextDocMessage: async () => null,
}));

vi.mock("pdf-parse", () => ({ default: async () => ({ text: "" }) }));

vi.mock("../../nodes/generate-path/include-url-contents.js", () => ({
  includeURLContents: async () => null,
}));

vi.mock("@opencanvas/shared/utils/urls.js", () => ({
  extractUrls: () => [],
}));

import { generatePath } from "../../nodes/generate-path/index.js";
import { routeAfterGeneralReply } from "../../index.js";

function makeState(overrides: any = {}) {
  return {
    _messages: [
      new HumanMessage("Replace all instances of CAIMLD with CAMDLE"),
    ],
    artifact: overrides.artifact || undefined,
    phase_state: overrides.phase_state || "drafting",
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockDetermineTeachingIntent.mockReset();
  mockDetermineTeachingIntent.mockResolvedValue({
    route: "replyToGeneralInput",
    reasoning: "mock default coaching chat",
  });
});

describe("generatePath routing for 'replace all'", () => {
  it("routes to applyTextEdits when multiple artifact contents exist", async () => {
    const state = makeState({
      artifact: {
        currentIndex: 2,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
          { index: 2, type: "text", fullMarkdown: "CAIMLD is awesome." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
    expect(result.textEditIntent).toEqual({
      kind: "replace_all",
      find: "CAIMLD",
      replace: "CAMDLE",
      matchCase: true,
    });
  });

  it("routes to applyTextEdits when single artifact content exists", async () => {
    const state = makeState({
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
  });

  it("does not route to applyTextEdits when no artifact exists", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "generateArtifact",
      reasoning: "blank canvas",
    });

    const state = makeState({
      artifact: undefined,
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("generateArtifact");
  });

  it("routes to applyTextEdits in socratic phase (mechanical replace allowed)", async () => {
    const state = makeState({
      phase_state: "socratic",
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
  });

  it("routes to replyToGeneralInput when message is not a replace-all intent", async () => {
    const state = makeState({
      _messages: [new HumanMessage("What do you think about CAIMLD?")],
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("replyToGeneralInput");
  });
});

describe("generatePath routing for Form Templates", () => {
  it("routes form turns directly to conversational form assistance", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Set the title to A brief")],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: { label: "Title", type: "text", required: true },
        },
        values: { title: "" },
      },
      artifact: {
        currentIndex: 1,
        contents: [{ index: 1, type: "text", fullMarkdown: "# " }],
      },
    });

    const result = await generatePath(state, {} as any);

    expect(result.next).toBe("replyToGeneralInput");
    expect(mockDetermineTeachingIntent).not.toHaveBeenCalled();
  });

  it("ends a form turn after the conversational reply", () => {
    const state = makeState({
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: { label: "Title", type: "text", required: true },
        },
        values: { title: "Existing title" },
      },
    });

    expect(routeAfterGeneralReply(state)).toBe("cleanState");
  });
});

describe("generatePath routing for selection literal replace", () => {
  it("routes literal selection replace to applyTextEdits", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Change brown to red")],
      highlightedText: {
        fullMarkdown: "The quick brown fox",
        markdownBlock: "The quick brown fox",
        selectedText: "brown",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "The quick brown fox" },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
    expect(result.textEditIntent).toEqual({
      kind: "replace_in_selection",
      find: "brown",
      replace: "red",
      replaceAllInBlock: false,
    });
  });

  it("routes paraphrase selection edits to updateHighlightedText", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Make this sound more formal")],
      highlightedText: {
        fullMarkdown: "The quick brown fox",
        markdownBlock: "The quick brown fox",
        selectedText: "brown",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "The quick brown fox" },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("updateHighlightedText");
  });

  it("routes selection questions to replyToGeneralInput, not updateHighlightedText", async () => {
    const state = makeState({
      _messages: [
        new HumanMessage(
          'We moved this section down - which was previously in the introduction - does it work under the head "Strategic dissemination and support structure"?'
        ),
      ],
      highlightedText: {
        fullMarkdown: "## Strategic dissemination\n\nSome content.",
        markdownBlock: "## Strategic dissemination\n\nSome content.",
        selectedText: "Strategic dissemination",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "## Strategic dissemination\n\nSome content.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("replyToGeneralInput");
  });
});

describe("generatePath LLM intent routing in teaching phases", () => {
  it("routes explicit rewrite to rewriteArtifact in socratic phase", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "rewriteArtifact",
      reasoning: "explicit full rewrite",
    });

    const state = makeState({
      phase_state: "socratic",
      _messages: [new HumanMessage("Rewrite the whole document to be shorter")],
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "This is a long paragraph with many words.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("rewriteArtifact");
  });

  it("routes explicit rewrite to rewriteArtifact in drafting phase", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "rewriteArtifact",
      reasoning: "explicit full rewrite",
    });

    const state = makeState({
      phase_state: "drafting",
      _messages: [new HumanMessage("Make it shorter")],
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "This is a long paragraph with many words.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("rewriteArtifact");
  });

  it("routes substantive content direction to integrateCanvasDirection in drafting", async () => {
    mockDetermineTeachingIntent.mockResolvedValueOnce({
      route: "integrateCanvasDirection",
      reasoning: "declarative content for one section",
    });

    const state = makeState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage(
          "What is novel is that language skills are needed to negotiate with LLMs effectively, and constraining the AI creates observable language engagement for teachers to assess."
        ),
      ],
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "## Section\n\nOld CAMDLE definition here.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("integrateCanvasDirection");
  });

  it("delegates coaching messages to determineTeachingIntent", async () => {
    const state = makeState({
      _messages: [
        new HumanMessage(
          "That is a valid question - and I'm wondering if I should approach scholarship organisations directly."
        ),
      ],
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "## Section\n\nExisting research proposal content.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(mockDetermineTeachingIntent).toHaveBeenCalled();
    expect(result.next).toBe("replyToGeneralInput");
  });
});
