import { describe, it, expect } from "vitest";
import {
  applyReplaceAll,
  applyReplaceAllSequence,
  applyReplaceInSelection,
  assertBlockInMarkdown,
  expandRenamePairs,
  isLiteralReplace,
  parseReplaceAllIntent,
  parseReplaceIntent,
} from "./text-edits.js";

describe("applyReplaceAll", () => {
  it("returns 0 matches when find is absent", () => {
    const result = applyReplaceAll("hello world", {
      find: "foo",
      replace: "bar",
    });
    expect(result.matchCount).toBe(0);
    expect(result.markdown).toBe("hello world");
  });

  it("replaces a single occurrence", () => {
    const result = applyReplaceAll("The quick brown fox", {
      find: "brown",
      replace: "red",
    });
    expect(result.matchCount).toBe(1);
    expect(result.markdown).toBe("The quick red fox");
  });

  it("replaces multiple occurrences", () => {
    const result = applyReplaceAll("CAIMLD is great. CAIMLD is awesome.", {
      find: "CAIMLD",
      replace: "CAMDLE",
    });
    expect(result.matchCount).toBe(2);
    expect(result.markdown).toBe("CAMDLE is great. CAMDLE is awesome.");
  });

  it("is case-sensitive by default", () => {
    const result = applyReplaceAll("Foo foo FOO", {
      find: "foo",
      replace: "bar",
    });
    expect(result.matchCount).toBe(1);
    expect(result.markdown).toBe("Foo bar FOO");
  });

  it("supports case-insensitive replacement", () => {
    const result = applyReplaceAll("Foo foo FOO", {
      find: "foo",
      replace: "bar",
      matchCase: false,
    });
    expect(result.matchCount).toBe(3);
    expect(result.markdown).toBe("bar bar bar");
  });

  it("handles unicode text", () => {
    const result = applyReplaceAll("café café", {
      find: "café",
      replace: "tea",
    });
    expect(result.matchCount).toBe(2);
    expect(result.markdown).toBe("tea tea");
  });
});

describe("parseReplaceAllIntent", () => {
  it("parses quoted replace", () => {
    expect(
      parseReplaceAllIntent('Replace "split-screen" with "split screen"')
    ).toEqual({
      kind: "replace_all",
      find: "split-screen",
      replace: "split screen",
      matchCase: true,
    });
  });

  it("parses quoted replace all", () => {
    expect(
      parseReplaceAllIntent('Replace all instances of "CAIMLD" with "CAMDLE"')
    ).toEqual({
      kind: "replace_all",
      find: "CAIMLD",
      replace: "CAMDLE",
      matchCase: true,
    });
  });

  it("parses unquoted replace", () => {
    expect(
      parseReplaceAllIntent("replace split-screen with split screen")
    ).toEqual({
      kind: "replace_all",
      find: "split-screen",
      replace: "split screen",
      matchCase: true,
    });
  });

  it("parses throughout phrasing", () => {
    expect(parseReplaceAllIntent("Change CAIMLD to CAMDLE throughout")).toEqual(
      {
        kind: "replace_all",
        find: "CAIMLD",
        replace: "CAMDLE",
        matchCase: true,
      }
    );
  });

  it("rejects empty find", () => {
    expect(parseReplaceAllIntent('Replace "" with "x"')).toBeNull();
  });

  it("rejects find equal to replace", () => {
    expect(parseReplaceAllIntent('Replace "foo" with "foo"')).toBeNull();
  });

  it("parses case insensitive flag", () => {
    expect(
      parseReplaceAllIntent('Replace all "Foo" with "Bar" case insensitive')
        ?.matchCase
    ).toBe(false);
  });

  it("parses natural-language changing quoted phrasing", () => {
    expect(
      parseReplaceAllIntent(
        'We\'re changing "Constrained AI-Mediated Language Development (CAIMLD)" to "Constrained AI-Mediated Dialogic Language Education (CAMDLE)"\n\nUpdate the canvas.'
      )
    ).toEqual({
      kind: "replace_all",
      find: "Constrained AI-Mediated Language Development (CAIMLD)",
      replace: "Constrained AI-Mediated Dialogic Language Education (CAMDLE)",
      matchCase: true,
    });
  });
});

describe("expandRenamePairs", () => {
  it("derives long name and abbreviation pairs", () => {
    expect(
      expandRenamePairs(
        "Constrained AI-Mediated Language Development (CAIMLD)",
        "Constrained AI-Mediated Dialogic Language Education (CAMDLE)"
      ).map((p) => p.find)
    ).toEqual([
      "Constrained AI-Mediated Language Development (CAIMLD)",
      "Constrained AI-Mediated Language Development",
      "CAIMLD",
    ]);
  });
});

describe("applyReplaceAllSequence", () => {
  it("renames construct with abbreviation throughout", () => {
    const source =
      "Intro to Constrained AI-Mediated Language Development (CAIMLD). Later CAIMLD appears.";
    const pairs = expandRenamePairs(
      "Constrained AI-Mediated Language Development (CAIMLD)",
      "Constrained AI-Mediated Dialogic Language Education (CAMDLE)"
    );
    const { markdown, matchCount } = applyReplaceAllSequence(source, pairs);
    expect(matchCount).toBe(2);
    expect(markdown).toBe(
      "Intro to Constrained AI-Mediated Dialogic Language Education (CAMDLE). Later CAMDLE appears."
    );
  });
});

describe("parseReplaceIntent", () => {
  it("parses change X to Y", () => {
    expect(parseReplaceIntent("Change brown to red")).toEqual({
      find: "brown",
      replace: "red",
      replaceAllInBlock: false,
    });
  });

  it("parses replace X with Y", () => {
    expect(parseReplaceIntent("replace brown with red")).toEqual({
      find: "brown",
      replace: "red",
      replaceAllInBlock: false,
    });
  });

  it("parses quoted selection replace", () => {
    expect(parseReplaceIntent('Replace "brown" with "red"')).toEqual({
      find: "brown",
      replace: "red",
      replaceAllInBlock: false,
    });
  });

  it("parses changing quoted phrasing", () => {
    expect(parseReplaceIntent('changing "CAIMLD" to "CAMDLE"')).toEqual({
      find: "CAIMLD",
      replace: "CAMDLE",
      replaceAllInBlock: false,
    });
  });

  it("detects replace all within block", () => {
    expect(parseReplaceIntent("replace all brown with red")).toEqual({
      find: "brown",
      replace: "red",
      replaceAllInBlock: true,
    });
  });
});

describe("isLiteralReplace", () => {
  it("returns true when find appears in selection", () => {
    expect(
      isLiteralReplace(
        { find: "brown", replace: "red" },
        {
          fullMarkdown: "The quick brown fox",
          markdownBlock: "The quick brown fox",
          selectedText: "brown",
        }
      )
    ).toBe(true);
  });

  it("returns true for case-insensitive selection match", () => {
    expect(
      isLiteralReplace(
        { find: "Brown", replace: "red" },
        {
          fullMarkdown: "The quick brown fox",
          markdownBlock: "The quick brown fox",
          selectedText: "brown",
        }
      )
    ).toBe(true);
  });
});

describe("applyReplaceInSelection", () => {
  it("replaces selected word inside a block", () => {
    const result = applyReplaceInSelection(
      "The quick brown fox",
      "The quick brown fox",
      "brown",
      "brown",
      "red"
    );
    expect(result).toEqual({
      markdown: "The quick red fox",
      matchCount: 1,
    });
  });

  it("preserves markdown formatting in the block", () => {
    const fullMarkdown = "Intro\n\nThe **quick** brown fox";
    const block = "The **quick** brown fox";
    const result = applyReplaceInSelection(
      fullMarkdown,
      block,
      "brown",
      "brown",
      "red"
    );
    expect(result).toEqual({
      markdown: "Intro\n\nThe **quick** red fox",
      matchCount: 1,
    });
  });

  it("returns block_not_found when block is missing", () => {
    expect(
      applyReplaceInSelection("hello", "missing", "brown", "brown", "red")
    ).toEqual({ error: "block_not_found" });
  });

  it("returns no_matches when find is absent from the block", () => {
    expect(
      applyReplaceInSelection(
        "The quick brown fox",
        "The quick brown fox",
        "brown",
        "purple",
        "red"
      )
    ).toEqual({ error: "selection_not_found" });
  });
});

describe("assertBlockInMarkdown", () => {
  it("throws when block is not found", () => {
    expect(() => assertBlockInMarkdown("hello", "missing")).toThrow(
      "Selected text not found in current content"
    );
  });
});
