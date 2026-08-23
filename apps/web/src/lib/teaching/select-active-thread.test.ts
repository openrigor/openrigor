import { describe, expect, it } from "vitest";
import {
  emptyKickoffsToAbandon,
  isEmptyKickoffThread,
  isSubmittedThread,
  selectActiveThread,
  shouldMintNewAssignmentThread,
  shouldRejectCachedThread,
  threadContentScore,
  type ThreadLike,
} from "./select-active-thread";

function thread(
  id: string,
  opts: {
    abandoned?: boolean;
    completionPercent?: number;
    messages?: number;
    markdown?: string;
    valuesNull?: boolean;
  } = {}
): ThreadLike {
  const values = opts.valuesNull
    ? null
    : {
        messages: Array.from({ length: opts.messages ?? 0 }, (_, i) => ({
          id: String(i),
        })),
        artifact: {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              type: "text",
              title: "t",
              fullMarkdown: opts.markdown ?? "",
            },
          ],
        },
      };
  return {
    thread_id: id,
    metadata: {
      ...(opts.abandoned ? { abandoned: true } : {}),
      ...(opts.completionPercent != null
        ? { completionPercent: opts.completionPercent }
        : {}),
    },
    values,
  };
}

describe("selectActiveThread", () => {
  it("prefers richest incomplete over newer empty kickoff", () => {
    const empty = thread("empty", { messages: 2, markdown: "" });
    const rich = thread("rich", {
      messages: 21,
      markdown: "x".repeat(1000),
    });
    expect(selectActiveThread([empty, rich])?.thread_id).toBe("rich");
    expect(selectActiveThread([rich, empty])?.thread_id).toBe("rich");
  });

  it("skips abandoned threads", () => {
    const abandonedRich = thread("abandoned", {
      abandoned: true,
      messages: 40,
      markdown: "y".repeat(500),
    });
    const empty = thread("empty", { messages: 2, markdown: "" });
    expect(selectActiveThread([abandonedRich, empty])?.thread_id).toBe("empty");
  });

  it("prefers incomplete empty over submitted when no richer incomplete", () => {
    const incomplete = thread("inc", { messages: 1, markdown: "" });
    const submitted = thread("sub", {
      completionPercent: 100,
      messages: 10,
      markdown: "z".repeat(300),
    });
    // Fresh attempt / empty incomplete must win over submitted read-only.
    expect(selectActiveThread([incomplete, submitted])?.thread_id).toBe("inc");
  });

  it("returns submitted when all incomplete are abandoned", () => {
    const submitted = thread("sub", {
      completionPercent: 100,
      messages: 5,
      markdown: "hello world essay",
    });
    const abandoned = thread("ab", {
      abandoned: true,
      messages: 2,
      markdown: "",
    });
    expect(selectActiveThread([abandoned, submitted])?.thread_id).toBe("sub");
  });

  it("returns undefined when all abandoned", () => {
    expect(
      selectActiveThread([
        thread("a", { abandoned: true, messages: 2 }),
        thread("b", { abandoned: true, messages: 9 }),
      ])
    ).toBeUndefined();
  });
  it("treats phase_state submitted as submitted even without completionPercent", () => {
    const submitted = {
      thread_id: "sub",
      metadata: {},
      values: {
        phase_state: "submitted",
        messages: [{ id: "1" }, { id: "2" }, { id: "3" }],
        artifact: {
          currentIndex: 1,
          contents: [
            {
              index: 1,
              type: "text",
              title: "t",
              fullMarkdown: "x".repeat(500),
            },
          ],
        },
      },
    };
    const empty = thread("empty", { messages: 2, markdown: "" });
    expect(isSubmittedThread(submitted)).toBe(true);
    // Incomplete empty preferred over submitted-only for active resume;
    // selectActiveThread still returns submitted when it is the only non-abandoned
    // incomplete-less candidate — empty incomplete wins first.
    expect(selectActiveThread([submitted, empty])?.thread_id).toBe("empty");
  });

  it("treats camelCase metadata.phaseState as submitted", () => {
    expect(
      isSubmittedThread({
        thread_id: "sub",
        metadata: { phaseState: "submitted" },
      })
    ).toBe(true);
  });
});

describe("shouldMintNewAssignmentThread", () => {
  it("resumes a submitted workspace-bound thread instead of minting", () => {
    const submitted = thread("sub", { completionPercent: 100, messages: 8 });
    expect(
      shouldMintNewAssignmentThread(submitted, { workspaceBound: true })
    ).toBe(false);
    expect(shouldMintNewAssignmentThread(submitted)).toBe(true);
    expect(
      shouldMintNewAssignmentThread(undefined, { workspaceBound: true })
    ).toBe(true);
  });
});

describe("isEmptyKickoffThread / abandon helpers", () => {
  it("detects kickoff-only threads", () => {
    expect(
      isEmptyKickoffThread(thread("e", { messages: 2, markdown: "" }))
    ).toBe(true);
    expect(
      isEmptyKickoffThread(
        thread("r", { messages: 3, markdown: "x".repeat(50) })
      )
    ).toBe(false);
    expect(
      isEmptyKickoffThread(
        thread("m", { messages: 2, markdown: "x".repeat(250) })
      )
    ).toBe(false);
  });

  it("lists empty siblings to abandon when rich wins", () => {
    const rich = thread("rich", { messages: 10, markdown: "x".repeat(500) });
    const empty = thread("empty", { messages: 2, markdown: "" });
    const already = thread("done", {
      abandoned: true,
      messages: 2,
      markdown: "",
    });
    expect(
      emptyKickoffsToAbandon([rich, empty, already], rich).map(
        (t) => t.thread_id
      )
    ).toEqual(["empty"]);
  });

  it("rejects cached empty when richer sibling exists", () => {
    const cached = thread("empty", { messages: 2, markdown: "" });
    const rich = thread("rich", { messages: 8, markdown: "x".repeat(400) });
    expect(shouldRejectCachedThread(cached, [cached, rich])).toBe(true);
    expect(shouldRejectCachedThread(rich, [cached, rich])).toBe(false);
  });
});

describe("threadContentScore", () => {
  it("ranks message count above short markdown", () => {
    const few = thread("a", { messages: 2, markdown: "x".repeat(5000) });
    const many = thread("b", { messages: 3, markdown: "" });
    expect(threadContentScore(many)).toBeGreaterThan(threadContentScore(few));
  });
});
