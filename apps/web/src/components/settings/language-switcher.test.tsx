// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

// Controlled useLocale: the test re-renders with a new locale to simulate
// the server-provided locale changing after router.refresh().
let currentLocale = "en";
vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations: () => (key: string) => key,
}));

import { CompactLanguageSwitcher, LanguageSwitcher } from "./language-switcher";

afterEach(() => {
  cleanup();
  currentLocale = "en";
});

function renderWithLocale(locale: string) {
  currentLocale = locale;
  return render(createElement(CompactLanguageSwitcher));
}

describe("CompactLanguageSwitcher", () => {
  it("derives the selected locale from useLocale, not mount-time state", () => {
    const view = renderWithLocale("en");
    const select = screen.getByLabelText("English") as HTMLSelectElement;
    expect(select.value).toBe("en");

    // Locale changes server-side (settings switcher wrote the cookie +
    // router.refresh()). The compact control must follow without a remount.
    currentLocale = "de";
    view.rerender(createElement(CompactLanguageSwitcher));
    const selectAfter = screen.getByLabelText("Deutsch") as HTMLSelectElement;
    expect(selectAfter.value).toBe("de");
  });

  it("exposes a visible keyboard-focus indicator on the wrapper", () => {
    renderWithLocale("en");
    const select = screen.getByLabelText("English");
    const wrapper = select.closest("div");
    expect(wrapper?.className).toContain("focus-within:ring-2");
  });
});

describe("LanguageSwitcher", () => {
  it("renders the settings select synced to the provided locale", () => {
    currentLocale = "de";
    render(createElement(LanguageSwitcher));
    const select = document.getElementById(
      "language-switcher"
    ) as HTMLSelectElement;
    expect(select.value).toBe("de");
  });
});
