import { describe, expect, it } from "vitest";
import { getLanguageDirective } from "./language-directive.js";

describe("getLanguageDirective", () => {
  it.each([
    ["de", "German"],
    ["fr", "French"],
    ["es", "Spanish"],
    ["it", "Italian"],
  ])("returns the %s directive", (locale, language) => {
    expect(getLanguageDirective(locale)).toBe(
      `Respond in ${language}. Conduct all Socratic phases in ${language}, including questions, feedback, and guidance.`
    );
  });

  it.each(["en", "", "pt-BR", "unknown"])(
    "falls back to English behavior for %j",
    (locale) => {
      expect(getLanguageDirective(locale)).toBe("");
    }
  );
});
