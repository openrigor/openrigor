import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it } from "vitest";
import { getLanguageDirective } from "@opencanvas/agents/dist/open-canvas/language-directive";

type LocaleFixture = {
  locale: "en" | "de" | "fr" | "es" | "it";
  language: string;
  markers: RegExp[];
};

const NEUTRAL_CONVERSATION =
  "I am developing a thesis about how stories show courage.";

const LOCALE_FIXTURES: LocaleFixture[] = [
  {
    locale: "en",
    language: "English",
    markers: [/\b(the|and|you|can|is)\b/i],
  },
  {
    locale: "de",
    language: "German",
    markers: [/\b(der|die|das|und|ich|nicht)\b/i],
  },
  {
    locale: "fr",
    language: "French",
    markers: [/\b(le|la|les|et|je|pas)\b/i],
  },
  {
    locale: "es",
    language: "Spanish",
    markers: [/\b(el|la|las|y|yo|no)\b/i],
  },
  {
    locale: "it",
    language: "Italian",
    markers: [/\b(il|la|le|e|io|non)\b/i],
  },
];

function responseMatchesLocale(response: string, fixture: LocaleFixture) {
  return fixture.markers.some((marker) => marker.test(response));
}

describe.skipIf(!process.env.OPENAI_API_KEY)(
  "agent response locale smoke eval",
  () => {
    it.each(LOCALE_FIXTURES)(
      "responds in $language for the $locale session",
      async (fixture) => {
        const directive = getLanguageDirective(fixture.locale);
        const model = new ChatOpenAI({
          model: process.env.OPENRIGOR_LOCALE_EVAL_MODEL ?? "gpt-4o-mini",
          temperature: 0,
        });
        const response = await model.invoke([
          {
            role: "system",
            // The directive alone must control response language — do not
            // restate fixture.language here, or the eval can pass while the
            // directive contract is broken (CodeRabbit #111).
            content: [directive, "Keep the response to two sentences."]
              .filter(Boolean)
              .join("\n\n"),
          },
          { role: "user", content: NEUTRAL_CONVERSATION },
        ]);

        const responseText = String(response.content);
        expect(responseMatchesLocale(responseText, fixture)).toBe(true);
      }
    );
  }
);
