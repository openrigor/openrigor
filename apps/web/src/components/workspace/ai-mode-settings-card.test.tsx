import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AiModeSettingsCardView,
  buildAiModePutBody,
  loadAiMode,
} from "./ai-mode-settings-card";
import { SHARED_MODEL_NOTICE_VERSION } from "@opencanvas/shared/ai-mode";

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
});
