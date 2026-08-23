import { describe, it, expect, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";

vi.mock("../../utils.js", () => ({
  getStringFromContent: (c: any) => (typeof c === "string" ? c : ""),
}));

import { applyTextEdits } from "./applyTextEdits.js";

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    _messages: [new HumanMessage('Replace all "CAIMLD" with "CAMDLE"')],
    artifact: {
      currentIndex: 1,
      contents: [
        {
          index: 1,
          type: "text",
          title: "Essay",
          fullMarkdown: "CAIMLD is great. CAIMLD rocks.",
        },
      ],
    },
    textEditIntent: {
      kind: "replace_all",
      find: "CAIMLD",
      replace: "CAMDLE",
    },
    ...overrides,
  } as any;
}

describe("applyTextEdits", () => {
  it("appends a new artifact version on successful replace_all", async () => {
    const state = makeState();
    const result = await applyTextEdits(state, {} as any);

    expect(result.textEditSummary).toEqual({
      op: "replace_all",
      find: "CAIMLD",
      replace: "CAMDLE",
      matchCount: 2,
    });
    expect(result.artifact?.currentIndex).toBe(2);
    expect(result.artifact?.contents).toHaveLength(2);
    const content1 = result.artifact?.contents[1] as { fullMarkdown: string };
    expect(content1.fullMarkdown).toBe("CAMDLE is great. CAMDLE rocks.");
  });

  it("does not bump artifact version when there are no matches", async () => {
    const state = makeState({
      textEditIntent: {
        kind: "replace_all",
        find: "missing",
        replace: "nope",
      },
    });

    const result = await applyTextEdits(state, {} as any);
    expect(result.textEditSummary).toEqual({
      op: "replace_all",
      find: "missing",
      replace: "nope",
      matchCount: 0,
    });
    expect(result.artifact).toBeUndefined();
  });

  it("replaces text inside a highlighted selection", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Change brown to red")],
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            title: "Essay",
            fullMarkdown: "The quick brown fox",
          },
        ],
      },
      textEditIntent: {
        kind: "replace_in_selection",
        find: "brown",
        replace: "red",
      },
      highlightedText: {
        fullMarkdown: "The quick brown fox",
        markdownBlock: "The quick brown fox",
        selectedText: "brown",
      },
    });

    const result = await applyTextEdits(state, {} as any);
    expect(result.textEditSummary).toEqual({
      op: "replace_in_selection",
      find: "brown",
      replace: "red",
      matchCount: 1,
    });
    const content2 = result.artifact?.contents[1] as { fullMarkdown: string };
    expect(content2.fullMarkdown).toBe("The quick red fox");
  });
});
