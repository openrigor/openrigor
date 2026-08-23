import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsBreadcrumb } from "./settings-breadcrumb";

describe("SettingsBreadcrumb", () => {
  it("links back to workspace and labels the current page", () => {
    const markup = renderToStaticMarkup(createElement(SettingsBreadcrumb));

    expect(markup).toContain('href="/workspace"');
    expect(markup).toContain("Workspace");
    expect(markup).toContain("Settings");
    expect(markup).toContain('data-testid="settings-breadcrumb"');
  });
});
