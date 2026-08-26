// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  AiModeOnboardingDialog,
  AiModeSettingsCardView,
  buildAiModePutBody,
  loadAiMode,
} from "./ai-mode-settings-card";
import { SHARED_MODEL_NOTICE_VERSION } from "@opencanvas/shared/ai-mode";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callbacks = {
  onModeChange: () => undefined,
  onSharedNoticeAcceptedChange: () => undefined,
  onSave: () => undefined,
  onRevoke: () => undefined,
};

describe("AI mode settings", () => {
  it("shows exactly three modes with BYOK visually primary and shared model unselected", () => {
    const markup = renderToStaticMarkup(
      createElement(AiModeSettingsCardView, {
        state: null,
        selectedMode: null,
        sharedNoticeAccepted: false,
        saving: false,
        revoking: false,
        error: null,
        ...callbacks,
      })
    );

    expect(
      (
        markup.match(
          /data-testid="ai-mode-(byok|shared_model|markdown_only)"/g
        ) ?? []
      ).length
    ).toBe(3);
    expect(markup).toContain("BYOK (recommended)");
    expect(markup).toContain("Shared model");
    expect(markup).toContain("Markdown-only");
    expect(markup).toContain('data-testid="ai-mode-shared_model"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain("border-indigo-300");
  });

  it("records the current notice version only for accepted shared-model mode", () => {
    expect(buildAiModePutBody("byok")).toEqual({ mode: "byok" });
    expect(buildAiModePutBody("markdown_only")).toEqual({
      mode: "markdown_only",
    });
    expect(buildAiModePutBody("shared_model", true)).toEqual({
      mode: "shared_model",
      privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
    });
    expect(() => buildAiModePutBody("shared_model")).toThrow(/missing/i);
  });

  it("loads an explicit missing state from the mode API", async () => {
    const state = await loadAiMode(
      async () =>
        new Response(
          JSON.stringify({
            mode: null,
            privacy_notice_version: null,
            revoked_at: null,
            updated_at: null,
            authorization_state: "missing",
          }),
          { status: 200 }
        )
    );
    expect(state).toMatchObject({
      mode: null,
      authorization_state: "missing",
    });
  });

  it("moves focus to the onboarding dialog when it opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              mode: null,
              privacy_notice_version: null,
              revoked_at: null,
              updated_at: null,
              authorization_state: "missing",
            }),
            { status: 200 }
          )
      )
    );

    render(createElement(AiModeOnboardingDialog));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute("tabindex")).toBe("-1");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      "ai-mode-onboarding-title"
    );
  });

  it("shows a load error with a retry action", async () => {
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(JSON.stringify({ error: "Service unavailable" }), {
          status: 503,
        });
      }
      return new Response(
        JSON.stringify({
          mode: null,
          privacy_notice_version: null,
          revoked_at: null,
          updated_at: null,
          authorization_state: "missing",
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(AiModeOnboardingDialog));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Service unavailable"
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
