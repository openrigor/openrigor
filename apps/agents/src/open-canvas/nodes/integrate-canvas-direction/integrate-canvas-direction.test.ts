import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { findBlockInMarkdown } from "@opencanvas/shared/utils/markdown-canvas";
import {
  MockModel,
  createMockConfig,
  createMockState,
} from "../../__test-helpers__/mock-config.js";

const mockModel = new MockModel();

vi.mock("../../../utils.js", () => ({
  getModelFromConfig: vi.fn(async () => mockModel),
  createContextDocumentMessages: vi.fn(async () => []),
  isUsingO1MiniModel: vi.fn(() => false),
  getStringFromContent: (content: unknown) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .flatMap((c: any) => ("text" in c ? [c.text as string] : []))
        .join("\n");
    }
    return "";
  },
}));

import { integrateCanvasDirection } from "./index.js";

/** Doc with BlockNote-style triple newline — byte-exact copy would fail. */
const DOC_TRIPLE_NL = `# Essay

### 4.5 Formative assessment


Formative assessment emphasises feedback loops during learning.

### 5.1 Results overview

Results go here.
`;

function makeMarkdownState(
  fullMarkdown: string,
  messages: Array<HumanMessage | AIMessage>
) {
  return createMockState({
    _messages: messages,
    messages,
    artifact: {
      currentIndex: 1,
      contents: [
        {
          index: 1,
          type: "text",
          title: "Essay",
          fullMarkdown,
        },
      ],
    },
  });
}

describe("integrateCanvasDirection", () => {
  beforeEach(() => {
    mockModel.clearToolCallResponses();
    mockModel.setTextContent("Mock response");
    mockModel.invoke.mockClear();
  });

  it("includes prior AI message when human sends a short ack", async () => {
    const aiOffer = new AIMessage({
      content: "I can fix the LaTeX in section 5.1 Results overview — shall I?",
      id: "ai-1",
    });
    const humanAck = new HumanMessage({ content: "yes", id: "h-2" });
    const state = makeMarkdownState(DOC_TRIPLE_NL, [aiOffer, humanAck]);

    mockModel.setToolCallResponse("integrate_section", {
      targetSectionHint: "5.1 Results overview",
      updatedSection:
        "### 5.1 Results overview\n\nResults go here with fixed LaTeX.\n",
    });

    await integrateCanvasDirection(state, createMockConfig());

    expect(mockModel.invoke).toHaveBeenCalledTimes(1);
    const invokeArgs = mockModel.invoke.mock.calls[0][0] as unknown[];
    // system + prior AI + human ack
    expect(invokeArgs.length).toBeGreaterThanOrEqual(3);
    const rolesOrTypes = invokeArgs.map((m: any) => {
      if (m?.getType) return m.getType();
      return m.role;
    });
    expect(rolesOrTypes).toContain("ai");
    expect(rolesOrTypes[rolesOrTypes.length - 1]).toBe("human");
    // Prior AI appears immediately before the human ack
    const humanIdx = rolesOrTypes.lastIndexOf("human");
    expect(rolesOrTypes[humanIdx - 1]).toBe("ai");
  });

  it("surfaces model text when there is no tool call (clarification)", async () => {
    const state = makeMarkdownState(DOC_TRIPLE_NL, [
      new HumanMessage({ content: "yes", id: "h-1" }),
    ]);
    mockModel.clearToolCallResponses();
    mockModel.setTextContent("Which section did you mean — 4.5 or 5.1?");

    const result = await integrateCanvasDirection(state, createMockConfig());

    expect(result.artifact).toBeUndefined();
    expect(result.textEditSummary).toEqual({
      op: "replace_in_selection",
      error: "Which section did you mean — 4.5 or 5.1?",
    });
  });

  it("succeeds via hint where findBlockInMarkdown would fail on whitespace drift", async () => {
    // Old protocol: model returns double-newline copy of a triple-newline section
    const driftedNeedle =
      "### 4.5 Formative assessment\n\nFormative assessment emphasises feedback loops during learning.\n";
    expect(findBlockInMarkdown(DOC_TRIPLE_NL, driftedNeedle)).toBeNull();

    const state = makeMarkdownState(DOC_TRIPLE_NL, [
      new HumanMessage({
        content: "Tighten the formative assessment section",
        id: "h-1",
      }),
    ]);

    mockModel.setToolCallResponse("integrate_section", {
      targetSectionHint:
        "4.5 Formative assessment Formative assessment emphasises",
      updatedSection:
        "### 4.5 Formative assessment\n\nFormative assessment emphasises timely feedback.\n",
    });

    const result = await integrateCanvasDirection(state, createMockConfig());

    expect(result.artifact?.currentIndex).toBe(2);
    const content = result.artifact?.contents[1] as { fullMarkdown: string };
    expect(content.fullMarkdown).toContain(
      "Formative assessment emphasises timely feedback."
    );
    expect(content.fullMarkdown).toContain("### 5.1 Results overview");
    expect(content.fullMarkdown).not.toContain(
      "Formative assessment emphasises feedback loops during learning."
    );
  });

  it("inserts section 4.6 after 4.5 via insertAfterHint", async () => {
    const state = makeMarkdownState(DOC_TRIPLE_NL, [
      new HumanMessage({
        content: "Add a point 4.6 with something that would work there",
        id: "h-1",
      }),
    ]);

    mockModel.setToolCallResponse("integrate_section", {
      targetSectionHint: "4.5 Formative assessment",
      insertAfterHint: "4.5 Formative assessment",
      newHeading: "4.6 Peer review loops",
      updatedSection:
        "### 4.6 Peer review loops\n\nPeer review supports formative goals.\n",
    });

    const result = await integrateCanvasDirection(state, createMockConfig());

    expect(result.artifact?.currentIndex).toBe(2);
    const md = (result.artifact?.contents[1] as { fullMarkdown: string })
      .fullMarkdown;
    const i45 = md.indexOf("### 4.5 Formative assessment");
    const i46 = md.indexOf("### 4.6 Peer review loops");
    const i51 = md.indexOf("### 5.1 Results overview");
    expect(i45).toBeGreaterThan(-1);
    expect(i46).toBeGreaterThan(i45);
    expect(i51).toBeGreaterThan(i46);
  });

  it("replaces instead of duplicating when insertAfterHint names an existing section", async () => {
    // Live dev run: an ack to "shall I rewrite 5.1?" came back with
    // insertAfterHint set, which appended a second "### 5.1" to the document.
    const state = makeMarkdownState(DOC_TRIPLE_NL, [
      new AIMessage({
        content: "Want me to rewrite 5.1 so it names each stage?",
        id: "ai-1",
      }),
      new HumanMessage({ content: "yes", id: "h-2" }),
    ]);

    mockModel.setToolCallResponse("integrate_section", {
      targetSectionHint: "5.1 Results overview",
      insertAfterHint: "5.1 Results overview",
      newHeading: "5.1 Results overview",
      updatedSection:
        "### 5.1 Results overview\n\nResults are reported per cohort.\n",
    });

    const result = await integrateCanvasDirection(state, createMockConfig());

    const md = (result.artifact?.contents[1] as { fullMarkdown: string })
      .fullMarkdown;
    expect(md.match(/### 5\.1 Results overview/g)).toHaveLength(1);
    expect(md).toContain("Results are reported per cohort.");
    expect(md).not.toContain("Results go here.");
  });

  it("returns clarification on ambiguous duplicate headings (no wrong-section write)", async () => {
    const dupDoc = `## Intro\n\nFirst intro.\n\n## Body\n\nMiddle.\n\n## Intro\n\nSecond intro.\n`;
    const state = makeMarkdownState(dupDoc, [
      new HumanMessage({ content: "Improve the Intro section", id: "h-1" }),
    ]);

    mockModel.setToolCallResponse("integrate_section", {
      targetSectionHint: "Intro",
      updatedSection: "## Intro\n\nChanged wrongly.\n",
    });

    const result = await integrateCanvasDirection(state, createMockConfig());

    expect(result.artifact).toBeUndefined();
    expect(result.textEditSummary?.op).toBe("replace_in_selection");
    expect((result.textEditSummary as { error?: string })?.error).toMatch(
      /couldn't confidently locate|Closest heading/i
    );
    expect((result.textEditSummary as { error?: string })?.error).not.toMatch(
      /Changed wrongly/
    );
  });
});
