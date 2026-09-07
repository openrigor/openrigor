export const LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocaleCode(v: string): v is LocaleCode {
  return LOCALES.some((locale) => locale.code === v);
}
