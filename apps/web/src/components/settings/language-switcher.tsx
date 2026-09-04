"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LOCALE,
  isLocaleCode,
  LOCALE_COOKIE,
  LOCALES,
  type LocaleCode,
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

function useLocaleSelection() {
  const router = useRouter();
  const locale = useLocale();
  const selectedLocale = isLocaleCode(locale) ? locale : DEFAULT_LOCALE;

  function selectLocale(nextLocale: string) {
    if (!isLocaleCode(nextLocale)) return;

    writeLocaleCookie(nextLocale);
    router.refresh();
  }

  return { selectedLocale, selectLocale };
}

function LocaleCodeMenu({
  selectedLocale,
  onSelect,
  testId,
  variant,
}: {
  selectedLocale: LocaleCode;
  onSelect: (locale: LocaleCode) => void;
  testId?: string;
  variant: "compact" | "preauth";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openBeforePointerDown = useRef(false);
  const selectedLabel = localeLabel(selectedLocale);

  function focusItem(index: number) {
    setOpen(true);
    window.setTimeout(() => itemRefs.current[index]?.focus(), 0);
  }

  function moveFocus(direction: 1 | -1) {
    const currentIndex = itemRefs.current.indexOf(
      document.activeElement as HTMLButtonElement
    );
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : LOCALES.length - 1
        : (currentIndex + direction + LOCALES.length) % LOCALES.length;
    itemRefs.current[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(LOCALES.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[LOCALES.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setOpen(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative inline-flex items-center justify-center rounded-md focus-within:ring-2",
        variant === "compact"
          ? "h-9 min-w-12 text-white/90 focus-within:ring-white"
          : "h-9 min-w-10 text-white/80 focus-within:ring-white/90"
      )}
      title={selectedLabel}
      onBlur={handleBlur}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        value={selectedLocale}
        aria-label={selectedLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid={testId}
        onClick={() => setOpen(!openBeforePointerDown.current)}
        onPointerDown={(event) => {
          openBeforePointerDown.current =
            event.pointerType === "touch" ? false : open;
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex h-full min-w-full items-center justify-center rounded-md px-2 font-mono text-xs font-semibold tracking-[0.14em] outline-none hover:bg-white/10",
          variant === "compact" ? "text-white/90" : "text-white/80"
        )}
      >
        {selectedLocale.toUpperCase()}
      </button>

      <div
        role="menu"
        aria-label="Language options"
        onKeyDown={handleMenuKeyDown}
        className={cn(
          "invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity duration-150",
          "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
          open && "visible opacity-100"
        )}
      >
        <div className="min-w-[8rem] rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">
          {LOCALES.map(({ code, label }, index) => (
            <button
              key={code}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              data-locale={code}
              data-value={code}
              onClick={() => {
                onSelect(code);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="block w-full rounded-sm px-3 py-1.5 text-left text-sm outline-none hover:bg-slate-100 focus:bg-slate-100"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
  // Derive from useLocale() (server-provided, updates on router.refresh())
  // rather than mount-time cookie state — the settings switcher shares the
  // same source, so both controls stay in sync after a locale change.
  const { selectedLocale, selectLocale } = useLocaleSelection();

  return (
    <LocaleCodeMenu
      selectedLocale={selectedLocale}
      onSelect={selectLocale}
      variant="compact"
    />
  );
}

export function PreAuthLanguageSwitcher({
  mobile = false,
}: { mobile?: boolean } = {}) {
  const { selectedLocale, selectLocale } = useLocaleSelection();

  if (mobile) {
    return (
      <select
        aria-label={localeLabel(selectedLocale)}
        value={selectedLocale}
        onChange={(event) => selectLocale(event.target.value)}
        className="w-full cursor-pointer rounded-md border border-white/25 bg-transparent px-3 py-2 text-sm text-white/85 outline-none focus:ring-2 focus:ring-white"
      >
        <LocaleOptions />
      </select>
    );
  }

  return (
    <LocaleCodeMenu
      selectedLocale={selectedLocale}
      onSelect={selectLocale}
      testId="preauth-language-switcher"
      variant="preauth"
    />
  );
}
