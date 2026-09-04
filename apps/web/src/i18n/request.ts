import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  isLocaleCode,
  LOCALE_COOKIE,
  type LocaleCode,
} from "@/lib/i18n/locales";

export function resolveLocaleFromAcceptLanguage(
  acceptLanguage: string | null
): LocaleCode {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const preferences = acceptLanguage
    .split(",")
    .map((entry, order) => {
      const [range, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        /^q\s*=/i.test(parameter.trim())
      );
      const quality = qualityParameter
        ? Number(qualityParameter.split("=")[1]?.trim())
        : 1;

      return {
        order,
        quality:
          Number.isFinite(quality) && quality >= 0 && quality <= 1
            ? quality
            : 0,
        range: range?.trim().toLowerCase() ?? "",
      };
    })
    .filter(({ quality, range }) => quality > 0 && range && range !== "*")
    .sort((a, b) => b.quality - a.quality || a.order - b.order);

  for (const { range } of preferences) {
    if (isLocaleCode(range)) return range;

    const primarySubtag = range.split("-")[0];
    if (primarySubtag && isLocaleCode(primarySubtag)) {
      return primarySubtag;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = requestedLocale
    ? isLocaleCode(requestedLocale)
      ? requestedLocale
      : DEFAULT_LOCALE
    : resolveLocaleFromAcceptLanguage((await headers()).get("accept-language"));

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
