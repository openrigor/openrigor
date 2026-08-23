import { describe, it, expect } from "vitest";
import {
  isCanvasWriteRequest,
  isSelectionEditRequest,
  isWholeDocumentRewriteRequest,
  isTargetedEditRequest,
} from "./canvas-direction.js";

describe("isSelectionEditRequest", () => {
  it("returns false for questions about highlighted content (regression: evaluchat session)", () => {
    const msg =
      'We moved this section down - which was previously in the introduction - does it work under the head "Strategic dissemination and support structure"?';
    expect(isSelectionEditRequest(msg)).toBe(false);
  });

  it("returns true for explicit edit verbs", () => {
    expect(isSelectionEditRequest("Make this sound more formal")).toBe(true);
    expect(isSelectionEditRequest("Can you change this word to CAMDLE?")).toBe(
      true
    );
  });

  it("returns false for edit failure complaints", () => {
    expect(isSelectionEditRequest("that was a bad edit, try again")).toBe(
      false
    );
  });
});

describe("isWholeDocumentRewriteRequest", () => {
  it("true for explicit full-document rewrites", () => {
    expect(isWholeDocumentRewriteRequest("Rewrite the whole document")).toBe(
      true
    );
    expect(
      isWholeDocumentRewriteRequest("Rewrite the entire essay to be shorter")
    ).toBe(true);
    expect(
      isWholeDocumentRewriteRequest("Make the document much shorter")
    ).toBe(true);
    expect(
      isWholeDocumentRewriteRequest("Please rewrite this paper from scratch")
    ).toBe(true);
  });

  it("false for targeted section edits", () => {
    expect(
      isWholeDocumentRewriteRequest(
        "Remove 4.5 and the corresponding reference"
      )
    ).toBe(false);
    expect(isWholeDocumentRewriteRequest("Rewrite the conclusion")).toBe(false);
    expect(isWholeDocumentRewriteRequest("Fix section 3")).toBe(false);
    expect(
      isWholeDocumentRewriteRequest("Can you rewrite this argument?")
    ).toBe(false);
  });
});

describe("isCanvasWriteRequest", () => {
  it.each([
    "write some tips about Evaluchat in the canvas",
    "put that in the canvas",
    "add this section to the document",
    "give me more tips in the canvas",
    "create a summary on the canvas",
  ])("returns true for explicit canvas writing requests: %s", (message) => {
    expect(isCanvasWriteRequest(message)).toBe(true);
  });

  it.each([
    "what do you think?",
    "how is my essay looking?",
    "what should I write in the canvas?",
    "thanks",
  ])(
    "returns false for coaching, questions, and acknowledgments: %s",
    (message) => {
      expect(isCanvasWriteRequest(message)).toBe(false);
    }
  );
});

describe("isTargetedEditRequest", () => {
  it("true for removals (never whole-doc)", () => {
    expect(
      isTargetedEditRequest("Remove 4.5 and the corresponding reference")
    ).toBe(true);
    expect(isTargetedEditRequest("Delete the Bloom section")).toBe(true);
  });

  it("true for section/number-targeted edits", () => {
    expect(isTargetedEditRequest("Rewrite the conclusion")).toBe(true);
    expect(isTargetedEditRequest("Fix section 3")).toBe(true);
    expect(
      isTargetedEditRequest("Can you rewrite section 4.4 to be clearer?")
    ).toBe(true);
  });

  it("false for whole-document rewrites and open questions", () => {
    expect(isTargetedEditRequest("Rewrite the whole document")).toBe(false);
    expect(isTargetedEditRequest("What do you think about section 4?")).toBe(
      false
    );
  });
});
