/** Content/session languages; UI locale dictionaries have their own contract. */
export const LANGUAGE_LOCALES = [
  { code: "en", label: "English", languageName: "English" },
  { code: "de", label: "Deutsch", languageName: "German" },
  { code: "fr", label: "Français", languageName: "French" },
  { code: "es", label: "Español", languageName: "Spanish" },
  { code: "it", label: "Italiano", languageName: "Italian" },
] as const;

export type LanguageLocale = (typeof LANGUAGE_LOCALES)[number]["code"];

export const DEFAULT_LANGUAGE_LOCALE: LanguageLocale = "en";

export function isLanguageLocale(value: string): value is LanguageLocale {
  return LANGUAGE_LOCALES.some(({ code }) => code === value);
}

export function getLanguageName(locale: string): string | undefined {
  if (locale === DEFAULT_LANGUAGE_LOCALE) return undefined;
  return LANGUAGE_LOCALES.find(({ code }) => code === locale)?.languageName;
}

const LANGUAGE_DIRECTIVES: Partial<Record<LanguageLocale, string>> = {
  de: "Respond in German. Conduct all Socratic phases in German, including questions, feedback, and guidance.",
  fr: "Respond in French. Conduct all Socratic phases in French, including questions, feedback, and guidance.",
  es: "Respond in Spanish. Conduct all Socratic phases in Spanish, including questions, feedback, and guidance.",
  it: "Respond in Italian. Conduct all Socratic phases in Italian, including questions, feedback, and guidance.",
};

export function getLanguageDirective(locale: string): string {
  return LANGUAGE_DIRECTIVES[locale as LanguageLocale] ?? "";
}
