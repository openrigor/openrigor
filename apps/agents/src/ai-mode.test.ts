import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockConfig } from "./open-canvas/__test-helpers__/mock-config.js";
import { SHARED_MODEL_NOTICE_VERSION } from "@opencanvas/shared/ai-mode";

const {
  initChatModelMock,
  chatOpenAIInvocations,
  MockChatOpenAI,
  getByokModelSettingsMock,
  getSharedByokModelSettingsMock,
  getPrimaryProviderNameMock,
  getProviderConfigMock,
  getProviderChainMock,
  supabaseAuthGetUserMock,
  supabaseFromMock,
  maybeSingleMock,
} = vi.hoisted(() => {
  const initChatModelMock = vi.fn();
  const chatOpenAIInvocations: Record<string, unknown>[] = [];
  class MockChatOpenAI {
    constructor(public readonly options: Record<string, unknown>) {
      chatOpenAIInvocations.push(options);
    }
  }
  const getByokModelSettingsMock = vi.fn();
  const getSharedByokModelSettingsMock = vi.fn();
  const getPrimaryProviderNameMock = vi.fn(() => "opencode-zen");
  const getProviderConfigMock = vi.fn(() => ({
    modelProvider: "openai",
    apiKey: "shared-model-key",
    baseURL: "https://provider.example/v1",
    model: "shared-model",
  }));
  const getProviderChainMock = vi.fn(() => []);
  const supabaseAuthGetUserMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const supabaseFromMock = vi.fn(() => ({ select: selectMock }));
  return {
    initChatModelMock,
    chatOpenAIInvocations,
    MockChatOpenAI,
    getByokModelSettingsMock,
    getSharedByokModelSettingsMock,
    getPrimaryProviderNameMock,
    getProviderConfigMock,
    getProviderChainMock,
    supabaseAuthGetUserMock,
    supabaseFromMock,
    maybeSingleMock,
  };
});

vi.mock("langchain/chat_models/universal", () => ({
  initChatModel: initChatModelMock,
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI,
}));
vi.mock("./byok.js", () => ({
  getByokModelSettings: getByokModelSettingsMock,
  getSharedByokModelSettings: getSharedByokModelSettingsMock,
}));
vi.mock("./provider-registry.js", () => ({
  getPrimaryProviderName: getPrimaryProviderNameMock,
  getProviderConfig: getProviderConfigMock,
  getProviderChain: getProviderChainMock,
  wrapModelWithFallback: vi.fn((model) => model),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: supabaseAuthGetUserMock },
    from: supabaseFromMock,
  })),
}));
vi.mock("pdf-parse", () => ({ default: vi.fn() }));

import {
  assertAiModeAuthorization,
  getAiModeAuthorization,
} from "./ai-mode.js";
import { getModelFromConfig } from "./utils.js";

const ORIGINAL_ENV = { ...process.env };

function consentRow(
  mode: "byok" | "shared_model" | "markdown_only",
  overrides: Record<string, unknown> = {}
) {
  return {
    user_id: "user-1",
    mode,
    privacy_notice_version:
      mode === "shared_model" ? SHARED_MODEL_NOTICE_VERSION : null,
    revoked_at: null,
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function authorizedConfig() {
  return createMockConfig({
    customModelName: "mimo-v2.5-free",
    supabase_session: { access_token: "user-token" },
  });
}

describe("OpenRigor LLM mode authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatOpenAIInvocations.length = 0;
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE: "service-role-key",
      OPENCODE_ZEN_API_KEY: "shared-model-key",
      OPENCODE_ZEN_BASE_URL: "https://provider.example/v1",
    };
    supabaseAuthGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    maybeSingleMock.mockResolvedValue({
      data: consentRow("shared_model"),
      error: null,
    });
    getByokModelSettingsMock.mockResolvedValue(null);
    getSharedByokModelSettingsMock.mockResolvedValue(null);
    initChatModelMock.mockResolvedValue({ invoke: vi.fn() });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("BYOK success path", async () => {
    getByokModelSettingsMock.mockResolvedValue({
      baseUrl: "https://provider.example/v1",
      model: "provider/model",
      apiKey: "user-key",
    });
    maybeSingleMock.mockResolvedValue({
      data: consentRow("byok"),
      error: null,
    });

    await getModelFromConfig(authorizedConfig());

    expect(getByokModelSettingsMock).toHaveBeenCalledTimes(1);
    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "provider/model",
      apiKey: "user-key",
    });
    expect(initChatModelMock).not.toHaveBeenCalled();
  });

  it("shared-model success WITH recorded current version", async () => {
    await getModelFromConfig(authorizedConfig());

    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(getByokModelSettingsMock).not.toHaveBeenCalled();
    expect(getSharedByokModelSettingsMock).not.toHaveBeenCalled();
  });

  it("Markdown-only workspace works with no inference", async () => {
    maybeSingleMock.mockResolvedValue({
      data: consentRow("markdown_only"),
      error: null,
    });

    await expect(getModelFromConfig(authorizedConfig())).rejects.toThrow(
      /Markdown-only.*does not authorize.*inference/i
    );
    expect(initChatModelMock).not.toHaveBeenCalled();
    expect(chatOpenAIInvocations).toHaveLength(0);
  });

  it("missing consent -> named error", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getModelFromConfig(authorizedConfig())).rejects.toThrow(
      /missing/i
    );
    expect(initChatModelMock).not.toHaveBeenCalled();
  });

  it("stale (older version) consent -> named error", async () => {
    maybeSingleMock.mockResolvedValue({
      data: consentRow("shared_model", {
        privacy_notice_version: "2026-08-24",
      }),
      error: null,
    });

    await expect(getModelFromConfig(authorizedConfig())).rejects.toThrow(
      /stale/i
    );
    expect(initChatModelMock).not.toHaveBeenCalled();
  });

  it("revoked-mid-session -> named error", async () => {
    maybeSingleMock.mockResolvedValue({
      data: consentRow("shared_model", {
        revoked_at: "2026-08-26T01:00:00.000Z",
      }),
      error: null,
    });

    await expect(getModelFromConfig(authorizedConfig())).rejects.toThrow(
      /revoked/i
    );
    expect(initChatModelMock).not.toHaveBeenCalled();
  });

  it("notice-version change rejects until re-accept", () => {
    expect(() =>
      assertAiModeAuthorization(
        consentRow("shared_model", {
          privacy_notice_version: "2026-08-24",
        })
      )
    ).toThrow(/stale/i);
    expect(
      assertAiModeAuthorization(
        consentRow("shared_model", {
          privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
        })
      ).mode
    ).toBe("shared_model");
  });

  it("does not authorize inference without an authenticated session", async () => {
    await expect(
      getAiModeAuthorization(createMockConfig({ supabase_session: undefined }))
    ).rejects.toThrow(/missing/i);
  });
});
