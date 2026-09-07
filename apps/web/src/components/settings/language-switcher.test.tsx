// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

// Controlled useLocale: the test re-renders with a new locale to simulate
// the server-provided locale changing after router.refresh().
let currentLocale = "en";
vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations: () => (key: string) => key,
}));

import {
  CompactLanguageSwitcher,
  LanguageSwitcher,
  PreAuthLanguageSwitcher,
} from "./language-switcher";
import { WorkspaceSiteHeader } from "@/components/teaching/workspace-site-header";

afterEach(() => {
  cleanup();
  currentLocale = "en";
  routerMock.refresh.mockClear();
  document.cookie = "NEXT_LOCALE=; Max-Age=0; path=/";
});

vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) => createElement("img", props),
}));

function walkAncestorsUntil(element: Element, stopAt: Element) {
  const ancestors: Element[] = [];
  let current: Element | null = element.parentElement;
  while (current && current !== stopAt) {
    ancestors.push(current);
    current = current.parentElement;
  }
  if (current !== stopAt) {
    throw new Error(
      "language menu is not rendered inside WorkspaceSiteHeader — regression test would pass vacuously"
    );
  }
  return ancestors;
}

function renderWithLocale(locale: string) {
  currentLocale = locale;
  return render(createElement(CompactLanguageSwitcher));
}

describe("CompactLanguageSwitcher", () => {
  it("shows the locale code instead of a translation icon", () => {
    renderWithLocale("de");
    const trigger = screen.getByLabelText("Deutsch");

    expect(trigger.textContent).toBe("DE");
    expect(trigger.querySelector("svg")).toBeNull();
  });

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

describe("PreAuthLanguageSwitcher", () => {
  it("lists every locale and writes the selected locale cookie", () => {
    render(createElement(PreAuthLanguageSwitcher));
    const trigger = screen.getByTestId("preauth-language-switcher");

    expect(trigger.textContent).toBe("EN");

    fireEvent.click(trigger);

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent)).toEqual([
      "English",
      "Deutsch",
      "Français",
      "Español",
      "Italiano",
    ]);
    expect(items[1].getAttribute("data-locale")).toBe("de");
    expect(items[1].getAttribute("data-value")).toBe("de");

    fireEvent.click(items[1]);

    expect(document.cookie).toContain("NEXT_LOCALE=de");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape with aria-expanded false", () => {
    render(createElement(PreAuthLanguageSwitcher));
    const trigger = screen.getByTestId("preauth-language-switcher");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("WorkspaceSiteHeader language dropdown", () => {
  it("does not clip the dropdown: header and ancestors carry no overflow-hidden", () => {
    // Regression for the clipped language menu: the header previously carried
    // `overflow-hidden` (added for the gradient wash), which cut the menu
    // rendered at `absolute right-0 top-full` inside the header down to its
    // 60px bar. jsdom cannot measure pixels, so assert on classes/styles:
    // neither the header itself nor any element between the open menu and the
    // header may clip, and the wash must live in its own overflow-hidden
    // layer instead.
    // WorkspaceSiteHeader renders CompactLanguageSwitcher in its own nav, so
    // no children are needed for the dropdown to be present.
    render(
      createElement(WorkspaceSiteHeader, { workspaceLabel: "Research tools" })
    );

    const header = screen.getByTestId("workspace-site-header");
    expect(header.className).not.toContain("overflow-hidden");

    const menu = screen.getByRole("menu", { name: "Language options" });
    for (const ancestor of walkAncestorsUntil(menu, header)) {
      expect(ancestor.className).not.toContain("overflow-hidden");
      expect(getComputedStyle(ancestor).overflow).not.toBe("hidden");
    }

    const wash = header.querySelector("div[aria-hidden]");
    expect(wash).not.toBeNull();
    expect(wash?.className).toContain("overflow-hidden");
  });
});
