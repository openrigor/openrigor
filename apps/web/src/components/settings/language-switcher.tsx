"use client";

import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_LOCALE,
  isLocaleCode,
  LOCALE_COOKIE,
  LOCALES,
} from "@/lib/i18n/locales";

function LocaleOptions() {
  return LOCALES.map(({ code, label }) => (
    <option key={code} value={code}>
      {label}
    </option>
  ));
}

function writeLocaleCookie(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function localeLabel(locale: string) {
  return LOCALES.find((entry) => entry.code === locale)?.label ?? "English";
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("settings");
  const selectedLocale = isLocaleCode(locale) ? locale : DEFAULT_LOCALE;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    if (!isLocaleCode(nextLocale)) return;

    writeLocaleCookie(nextLocale);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="language-switcher">{t("languageSelection")}</Label>
      <select
        id="language-switcher"
        value={selectedLocale}
        onChange={handleChange}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <LocaleOptions />
      </select>
      <p className="text-sm text-muted-foreground">
        {t("languageDescription")}
      </p>
    </div>
  );
}

export function CompactLanguageSwitcher() {
  const router = useRouter();
  const [selectedLocale, setSelectedLocale] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];
    if (cookieLocale && isLocaleCode(cookieLocale)) {
      setSelectedLocale(cookieLocale);
    }
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    if (!isLocaleCode(nextLocale)) return;

    setSelectedLocale(nextLocale);
    writeLocaleCookie(nextLocale);
    router.refresh();
  }

  return (
    <div
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
      title={localeLabel(selectedLocale)}
    >
      <Languages className="h-4 w-4" aria-hidden />
      <select
        aria-label={localeLabel(selectedLocale)}
        value={selectedLocale}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <LocaleOptions />
      </select>
    </div>
  );
}
