import { locales } from "@blocknote/core";
import type { LocaleCode } from "@/lib/i18n/locales";

/**
 * Maps app UI locales to BlockNote dictionary keys. BlockNote ships
 * en/de/fr/es dictionaries; locales without a native dictionary (it)
 * fall back to English strings. Partial by design: unmapped locales
 * resolve to "en" so registry/catalog additions never require edits here.
 */
export const BLOCKNOTE_LOCALE_BY_APP_LOCALE: Partial<
  Record<LocaleCode, keyof typeof locales>
> = {
  en: "en",
  de: "de",
  fr: "fr",
  es: "es",
  it: "en",
};

export function resolveBlockNoteLocale(
  appLocale: LocaleCode
): keyof typeof locales {
  return BLOCKNOTE_LOCALE_BY_APP_LOCALE[appLocale] ?? "en";
}
