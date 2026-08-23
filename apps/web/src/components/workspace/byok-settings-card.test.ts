import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ByokSettingsCardView,
  buildByokPutBody,
  isByokFormDirty,
  loadByokSettings,
  revokeSharedItem,
  saveByokSettings,
  testByokConnection,
} from "./byok-settings-card";

describe("ByokSettingsCard helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads saved settings from GET /api/byok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          enabled: true,
          base_url: "https://openrouter.ai/api/v1",
          model: "openai/gpt-4o-mini",
          api_key_masked: "sk-…mini",
        },
      }),
    });

    const saved = await loadByokSettings(fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/byok");
    expect(saved).toEqual({
      enabled: true,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      apiKeyMasked: "sk-…mini",
    });
  });

  it("sends api_key on PUT only when entered", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          enabled: true,
          base_url: "https://openrouter.ai/api/v1",
          model: "openai/gpt-4o-mini",
          api_key_masked: "sk-…abcd",
        },
      }),
    });

    await saveByokSettings(
      {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        apiKey: "",
      },
      fetchMock as unknown as typeof fetch
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      enabled: true,
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
    });

    await saveByokSettings(
      {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        apiKey: "sk-new-key",
      },
      fetchMock as unknown as typeof fetch
    );

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      enabled: true,
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key: "sk-new-key",
    });
  });

  it("surfaces validation errors from PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "base_url must be a valid http(s) URL" }),
    });

    await expect(
      saveByokSettings(
        {
          enabled: true,
          baseUrl: "not-a-url",
          model: "m",
          apiKey: "sk-x",
        },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow("base_url must be a valid http(s) URL");
  });

  it("returns inline test connection results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        message: "Connected — openai/gpt-4o-mini responded",
      }),
    });

    const result = await testByokConnection(
      fetchMock as unknown as typeof fetch
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/byok/test", {
      method: "POST",
    });
    expect(result).toEqual({
      ok: true,
      message: "Connected — openai/gpt-4o-mini responded",
    });
  });

  it("omits api_key from put body when blank", () => {
    expect(
      buildByokPutBody({
        enabled: false,
        baseUrl: " https://x.ai/v1 ",
        model: " m ",
        apiKey: "  ",
      })
    ).toEqual({
      enabled: false,
      base_url: "https://x.ai/v1",
      model: "m",
    });
  });

  it("sends the selected scope and an authoritative replacement list", () => {
    expect(
      buildByokPutBody({
        enabled: true,
        baseUrl: "https://provider.example/v1",
        model: "provider/model",
        apiKey: "",
        shareMode: "all_assignments",
      })
    ).toMatchObject({
      share_mode: "all_assignments",
    });
    expect(
      buildByokPutBody({
        enabled: true,
        baseUrl: "https://provider.example/v1",
        model: "provider/model",
        apiKey: "",
        shareMode: "specific_items",
        sharedItemIds: ["method-1", "method-2"],
        shareItemIdsReplace: ["method-2"],
      })
    ).toMatchObject({
      share_mode: "specific_items",
      shareItemIdsReplace: ["method-2"],
    });
  });

  it("detects dirty form vs saved snapshot", () => {
    const saved = {
      enabled: true,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      apiKeyMasked: "sk-…mini",
    };
    expect(
      isByokFormDirty(
        {
          enabled: true,
          baseUrl: "https://openrouter.ai/api/v1",
          model: "openai/gpt-4o-mini",
          apiKey: "",
        },
        saved
      )
    ).toBe(false);
    expect(
      isByokFormDirty(
        {
          enabled: true,
          baseUrl: "https://openrouter.ai/api/v1",
          model: "openai/gpt-4o-mini",
          apiKey: "sk-new",
        },
        saved
      )
    ).toBe(true);
  });

  it("resets the sharing scope when the last specific assignment is revoked", () => {
    expect(revokeSharedItem(["method-1"], "method-1")).toEqual({
      shareMode: "none",
      sharedItemIds: [],
      shareItemIdsReplace: [],
    });
  });

  it("clears persisted ids when leaving specific sharing before a later new-item share", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          enabled: true,
          base_url: "https://provider.example/v1",
          model: "provider/model",
          api_key_masked: "sk-…abcd",
        },
      }),
    });

    await saveByokSettings(
      {
        enabled: true,
        baseUrl: "https://provider.example/v1",
        model: "provider/model",
        apiKey: "",
        shareMode: "none",
        sharedItemIds: [],
        shareItemIdsReplace: [],
      },
      fetchMock as unknown as typeof fetch
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      share_mode: "none",
      shareItemIdsReplace: [],
    });

    await saveByokSettings(
      {
        enabled: true,
        baseUrl: "https://provider.example/v1",
        model: "provider/model",
        apiKey: "",
        shareMode: "specific_items",
        sharedItemIds: ["method-new"],
        shareItemIdsReplace: ["method-new"],
      },
      fetchMock as unknown as typeof fetch
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).shareItemIdsReplace
    ).toEqual(["method-new"]);
  });
});

describe("ByokSettingsCardView", () => {
  it("populates inputs and enables test when a masked key is saved", () => {
    const markup = renderToStaticMarkup(
      createElement(ByokSettingsCardView, {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        apiKey: "",
        savedMaskedKey: "sk-…mini",
        saving: false,
        testing: false,
        testResult: null,
        onEnabledChange: () => undefined,
        onBaseUrlChange: () => undefined,
        onModelChange: () => undefined,
        onApiKeyChange: () => undefined,
        onSave: () => undefined,
        onTest: () => undefined,
      })
    );

    expect(markup).toContain("Your own AI provider");
    expect(markup).toContain('value="https://openrouter.ai/api/v1"');
    expect(markup).toContain('value="openai/gpt-4o-mini"');
    expect(markup).toContain("sk-…mini");
    expect(markup).toContain(
      'type="button" data-testid="byok-test">Test connection</button>'
    );
  });

  it("disables test connection when nothing is saved", () => {
    const markup = renderToStaticMarkup(
      createElement(ByokSettingsCardView, {
        enabled: true,
        baseUrl: "",
        model: "",
        apiKey: "",
        savedMaskedKey: null,
        saving: false,
        testing: false,
        testResult: null,
        onEnabledChange: () => undefined,
        onBaseUrlChange: () => undefined,
        onModelChange: () => undefined,
        onApiKeyChange: () => undefined,
        onSave: () => undefined,
        onTest: () => undefined,
      })
    );

    expect(markup).toContain(
      'type="button" disabled="" data-testid="byok-test">Test connection</button>'
    );
  });

  it("renders inline test results", () => {
    const okMarkup = renderToStaticMarkup(
      createElement(ByokSettingsCardView, {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        apiKey: "",
        savedMaskedKey: "sk-…mini",
        saving: false,
        testing: false,
        testResult: {
          ok: true,
          message: "Connected — openai/gpt-4o-mini responded",
        },
        onEnabledChange: () => undefined,
        onBaseUrlChange: () => undefined,
        onModelChange: () => undefined,
        onApiKeyChange: () => undefined,
        onSave: () => undefined,
        onTest: () => undefined,
      })
    );
    expect(okMarkup).toContain("Connected — openai/gpt-4o-mini responded");
    expect(okMarkup).toContain("text-green-700");

    const errMarkup = renderToStaticMarkup(
      createElement(ByokSettingsCardView, {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
        apiKey: "",
        savedMaskedKey: "sk-…mini",
        saving: false,
        testing: false,
        testResult: { ok: false, message: "HTTP 401 Unauthorized" },
        onEnabledChange: () => undefined,
        onBaseUrlChange: () => undefined,
        onModelChange: () => undefined,
        onApiKeyChange: () => undefined,
        onSave: () => undefined,
        onTest: () => undefined,
      })
    );
    expect(errMarkup).toContain("HTTP 401 Unauthorized");
    expect(errMarkup).toContain("text-red-700");
  });

  it("renders owner sharing controls without exposing provider secrets", () => {
    const markup = renderToStaticMarkup(
      createElement(ByokSettingsCardView, {
        enabled: true,
        baseUrl: "https://provider.example/v1",
        model: "provider/model",
        apiKey: "",
        savedMaskedKey: "sk-…abcd",
        saving: false,
        testing: false,
        testResult: null,
        shareMode: "specific_items",
        sharedItemIds: ["method-1"],
        onEnabledChange: () => undefined,
        onBaseUrlChange: () => undefined,
        onModelChange: () => undefined,
        onApiKeyChange: () => undefined,
        onShareModeChange: () => undefined,
        onRevokeSharedItem: () => undefined,
        onSave: () => undefined,
        onTest: () => undefined,
      })
    );

    expect(markup).toContain('data-testid="byok-share-control"');
    expect(markup).not.toContain("Specific assignments");
    expect(markup).toContain("method-1");
    expect(markup).toContain('data-testid="byok-share-revoke-method-1"');
    expect(markup).not.toContain("<select");
    expect(markup).toContain("Provided by instructor");
    expect(markup).not.toContain("sk-owner-secret");
  });
});
