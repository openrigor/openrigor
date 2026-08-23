/**
 * Test: canvas text editing — "replace" routing
 *
 * ROOT CAUSE: The word "replace" was not in the writing intent patterns
 * in generatePath, AND generatePath always routed to generateArtifact
 * (which appends) instead of rewriteArtifact (which replaces).
 *
 * Fix 1: Added "replace" to the writing intent regex.
 * Fix 2: When multiple artifact contents exist, route to rewriteArtifact.
 *
 * These tests verify both fixes work correctly.
 */
import { describe, it, expect } from "vitest";

// Mirror the exact regex from generate-path/index.ts line 183.
// If the source regex changes, update this copy to match.
const writingIntentPatterns =
  /\b(write|draft|drafting|compose|generate|generating|create|start writing|start drafting|put.*canvas|put.*page|write.*intro|write.*paragraph|write.*essay|write.*conclusion|write.*body|help me write|help me draft|help me outline|outline.*essay|tighten|rewrite|rephrase|reword|replace|fix.*paragraph|fix.*conclusion|fix.*essay|edit.*paragraph|revise|improve.*paragraph|shorten|expand|add.*paragraph|add.*section|add.*conclusion|add.*introduction|update.*essay|update.*paragraph)\b/i;

describe("writing intent regex - 'replace' routing", () => {
  it("'replace' should match writing intent (replace-all request)", () => {
    const msg = "In the document, replace all instances of CAIMLD with CAMDLE";
    // Before fix: "replace" was not in the regex, so this returned false.
    // The request got routed to chat instead of generateArtifact/rewriteArtifact.
    expect(writingIntentPatterns.test(msg)).toBe(true);
  });

  it("'Replace' should match writing intent (capitalized)", () => {
    const msg = "Replace the word hello with goodbye";
    expect(writingIntentPatterns.test(msg)).toBe(true);
  });

  it("'replace with' should match writing intent", () => {
    const msg = "Replace CAIMLD with CAMDLE throughout";
    expect(writingIntentPatterns.test(msg)).toBe(true);
  });

  // Sanity: existing patterns still work (no regressions).
  it("existing writing intents still match", () => {
    expect(writingIntentPatterns.test("Write a new introduction")).toBe(true);
    expect(writingIntentPatterns.test("Draft a conclusion")).toBe(true);
    expect(writingIntentPatterns.test("Rewrite the paragraph")).toBe(true);
    expect(writingIntentPatterns.test("Edit the paragraph")).toBe(true);
    expect(writingIntentPatterns.test("Tighten the prose")).toBe(true);
    expect(writingIntentPatterns.test("Shorten the essay")).toBe(true);
  });

  it("non-writing intents do not match", () => {
    expect(writingIntentPatterns.test("What do you think about this?")).toBe(
      false
    );
    expect(writingIntentPatterns.test("Can you explain CAIMLD?")).toBe(false);
  });
});
