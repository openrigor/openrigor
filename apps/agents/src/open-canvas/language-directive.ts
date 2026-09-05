import { getLanguageDirective as getSharedLanguageDirective } from "@opencanvas/shared/language";

export function getLanguageDirective(locale: string): string {
  return getSharedLanguageDirective(locale);
}

export function appendLanguageDirective(
  systemPrompt: string,
  locale: string | undefined
): string {
  const directive = getLanguageDirective(locale ?? "en");
  return directive ? `${systemPrompt}\n\n${directive}` : systemPrompt;
}
