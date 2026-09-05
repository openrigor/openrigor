const ASSIGNMENT_LANGUAGE_NAMES = {
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
} as const;

function languageName(locale: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(ASSIGNMENT_LANGUAGE_NAMES, locale)
    ? ASSIGNMENT_LANGUAGE_NAMES[
        locale as keyof typeof ASSIGNMENT_LANGUAGE_NAMES
      ]
    : undefined;
}

/**
 * Interim web-side copy until the agents-side language directive from #98 is
 * available. Keep this pure so its body can be replaced without changing the
 * prompt contract.
 */
export function getAssignmentLanguageDirective(locale: string): string {
  const language = languageName(locale);
  return language
    ? `Respond in ${language}. Conduct all Socratic phases in ${language}, including questions, feedback, and guidance.`
    : "";
}

export function getAssignmentLanguageName(locale: string): string | undefined {
  return languageName(locale);
}
