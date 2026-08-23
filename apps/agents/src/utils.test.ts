import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockConfig } from "./open-canvas/__test-helpers__/mock-config.js";
import { encryptApiKey } from "@opencanvas/shared/byok/crypto";
import dns from "node:dns/promises";

const BYOK_TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const {
  initChatModelMock,
  wrapModelWithFallbackMock,
  getProviderChainMock,
  getPrimaryProviderNameMock,
  getProviderConfigMock,
  chatOpenAIInvocations,
  MockChatOpenAI,
  supabaseFromMock,
  supabaseAuthGetUserMock,
  createClientMock,
  maybeSingleMock,
} = vi.hoisted(() => {
  const initChatModelMock = vi.fn();
  const wrapModelWithFallbackMock = vi.fn((model) => model);
  const getProviderChainMock = vi.fn(() => ["opencode-zen", "opencode-go"]);
  const getPrimaryProviderNameMock = vi.fn(() => "opencode-zen");
  const getProviderConfigMock = vi.fn(() => ({
    modelProvider: "openai",
    apiKey: "zen-key",
    baseURL: "https://opencode.ai/zen/v1",
    model: "mimo-v2.5-free",
  }));
  const chatOpenAIInvocations: Record<string, unknown>[] = [];

  class MockChatOpenAI {
    invoke = vi.fn();
    stream = vi.fn();
    batch = vi.fn();
    bindTools = vi.fn(() => this);

    constructor(public readonly options: Record<string, unknown>) {
      chatOpenAIInvocations.push(options);
    }
  }

  const supabaseAuthGetUserMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn((_column: string, userId: string) => ({
    maybeSingle: () => maybeSingleMock(userId),
  }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const supabaseFromMock = vi.fn(() => ({ select: selectMock }));
  const createClientMock = vi.fn(() => ({
    auth: { getUser: supabaseAuthGetUserMock },
    from: supabaseFromMock,
  }));

  return {
    initChatModelMock,
    wrapModelWithFallbackMock,
    getProviderChainMock,
    getPrimaryProviderNameMock,
    getProviderConfigMock,
    chatOpenAIInvocations,
    MockChatOpenAI,
    supabaseFromMock,
    supabaseAuthGetUserMock,
    createClientMock,
    maybeSingleMock,
  };
});

vi.mock("langchain/chat_models/universal", () => ({
  initChatModel: initChatModelMock,
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI,
}));

vi.mock("./provider-registry.js", () => ({
  getProviderChain: getProviderChainMock,
  getPrimaryProviderName: getPrimaryProviderNameMock,
  getProviderConfig: getProviderConfigMock,
  wrapModelWithFallback: wrapModelWithFallbackMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("pdf-parse", () => ({ default: vi.fn() }));

import { getModelConfig, getModelFromConfig } from "./utils.js";
import { getSharedByokModelSettings } from "./byok.js";

const ORIGINAL_ENV = { ...process.env };

function mockByokRow(
  row: {
    user_id: string;
    base_url: string;
    model: string;
    api_key_enc: string;
    enabled: boolean;
    share_mode?: "none" | "all_assignments" | "specific_items";
    shared_item_ids?: string[];
  } | null
) {
  supabaseAuthGetUserMock.mockResolvedValue({
    data: { user: { id: "byok-user" } },
  });
  maybeSingleMock.mockResolvedValue({ data: row, error: null });
}

describe("provider resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatOpenAIInvocations.length = 0;
    process.env = {
      ...ORIGINAL_ENV,
      OPENAI_API_KEY: "default-openai-key",
      OPENAI_API_BASE_URL: "https://openrouter.ai/api/v1",
      PREMIUM_OPENROUTER_API_KEY: "premium-openrouter-key",
      OPENCODE_ZEN_API_KEY: "zen-key",
      OPENCODE_ZEN_BASE_URL: "https://opencode.ai/zen/v1",
      OPENROUTER_ENABLED: "true",
    };
    delete process.env.BYOK_ENCRYPTION_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE;
    mockByokRow(null);
    initChatModelMock.mockResolvedValue({
      invoke: vi.fn(),
      stream: vi.fn(),
      batch: vi.fn(),
    });
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
    ] as any);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("defaults to the budget model when customModelName is missing", () => {
    const config = createMockConfig();
    delete config.configurable!.customModelName;

    const modelConfig = getModelConfig(config);

    expect(modelConfig).toMatchObject({
      modelName: "mimo-v2.5-free",
      modelProvider: "openai",
      apiKey: "zen-key",
      baseUrl: "https://opencode.ai/zen/v1",
    });
  });

  it("defaults to the budget model when customModelName is empty", () => {
    const config = createMockConfig({
      customModelName: "",
    });

    const modelConfig = getModelConfig(config);

    expect(modelConfig).toMatchObject({
      modelName: "mimo-v2.5-free",
      modelProvider: "openai",
      apiKey: "zen-key",
      baseUrl: "https://opencode.ai/zen/v1",
    });
  });

  it("routes free assignments through the OpenCode Zen rail", async () => {
    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
    });

    const modelConfig = getModelConfig(config);
    await getModelFromConfig(config);

    expect(modelConfig).toMatchObject({
      modelName: "mimo-v2.5-free",
      modelProvider: "openai",
      apiKey: "zen-key",
      baseUrl: "https://opencode.ai/zen/v1",
    });
    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(wrapModelWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(getProviderChainMock).toHaveBeenCalledTimes(1);
    expect(getPrimaryProviderNameMock).toHaveBeenCalledTimes(2);
    expect(getProviderConfigMock).toHaveBeenCalledTimes(2);
  });

  it("remaps legacy free DeepSeek ids onto the configured Zen budget model", async () => {
    const config = createMockConfig({
      customModelName: "deepseek-v4-flash-free",
    });

    const modelConfig = getModelConfig(config);

    expect(modelConfig).toMatchObject({
      modelName: "mimo-v2.5-free",
      apiKey: "zen-key",
      baseUrl: "https://opencode.ai/zen/v1",
    });
  });

  it("routes premium assignments through OpenRouter with the premium key", async () => {
    const config = createMockConfig({
      customModelName: "openai/gpt-5.6-luna",
    });

    const modelConfig = getModelConfig(config);
    await getModelFromConfig(config);

    expect(modelConfig).toMatchObject({
      modelName: "openai/gpt-5.6-luna",
      modelProvider: "openai",
      apiKey: "premium-openrouter-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(wrapModelWithFallbackMock).not.toHaveBeenCalled();
  });

  it("keeps premium on OpenRouter when OPENAI_API_BASE_URL points at OpenCode Zen", async () => {
    process.env.OPENAI_API_BASE_URL = "https://opencode.ai/zen/v1";

    const config = createMockConfig({
      customModelName: "openai/gpt-5.6-luna",
    });

    const modelConfig = getModelConfig(config);
    await getModelFromConfig(config);

    expect(modelConfig.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(modelConfig.apiKey).toBe("premium-openrouter-key");
    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "openai/gpt-5.6-luna",
      apiKey: "premium-openrouter-key",
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    });
  });

  it("fails loudly when the premium OpenRouter key is missing", () => {
    delete process.env.PREMIUM_OPENROUTER_API_KEY;

    const config = createMockConfig({
      customModelName: "openai/gpt-5.6-luna",
    });

    expect(() => getModelConfig(config)).toThrow(
      "PREMIUM_OPENROUTER_API_KEY is required for premium assignments."
    );
  });

  it("uses BYOK ChatOpenAI when enabled settings are present", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    const plaintextKey = "sk-user-byok-secret";
    mockByokRow({
      user_id: "byok-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey(plaintextKey, BYOK_TEST_KEY),
      enabled: true,
    });

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      supabase_session: { access_token: "user-token" },
    });

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "openai/gpt-4o-mini",
      apiKey: plaintextKey,
      maxRetries: 0,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    });
    expect(typeof (chatOpenAIInvocations[0]?.configuration as any)?.fetch).toBe(
      "function"
    );
    expect(wrapModelWithFallbackMock).not.toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("user_byok_settings");
    expect(supabaseAuthGetUserMock).toHaveBeenCalledWith("user-token");
  });

  it("throws when BYOK is enabled but the stored API key cannot be decrypted", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    mockByokRow({
      user_id: "byok-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: "not-valid-encrypted-payload",
      enabled: true,
    });

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      supabase_session: { access_token: "user-token" },
    });

    await expect(getModelFromConfig(config)).rejects.toThrow(
      "BYOK is enabled, but the stored API key cannot be decrypted"
    );
    expect(wrapModelWithFallbackMock).not.toHaveBeenCalled();
    expect(chatOpenAIInvocations).toHaveLength(0);
  });

  it("falls back to platform providers when BYOK is absent", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";
    mockByokRow(null);

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      supabase_session: { access_token: "user-token" },
    });

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(wrapModelWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "mimo-v2.5-free",
      apiKey: "zen-key",
    });
  });

  it("falls back to platform providers when BYOK is disabled", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    mockByokRow({
      user_id: "byok-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey("sk-user-byok-secret", BYOK_TEST_KEY),
      enabled: false,
    });

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      supabase_session: { access_token: "user-token" },
    });

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations).toHaveLength(1);
    expect(wrapModelWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "mimo-v2.5-free",
      apiKey: "zen-key",
    });
  });

  it("an active instructor grant overrides a participant's own BYOK settings", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    const participantItem = {
      id: "participant-item",
      ownerId: "participant-user",
      kind: "method_participant",
      operatorId: "owner-user",
      operatorItemId: "method-item",
    };
    const ownerItem = {
      id: "method-item",
      ownerId: "owner-user",
      kind: "method",
      run: {
        participants: [
          {
            itemId: "participant-item",
            userId: "participant-user",
            email: "student@example.com",
          },
        ],
      },
    };
    const store = {
      get: vi.fn(async (namespace: string[], key: string) => {
        const items =
          namespace[1] === "participant-user"
            ? { "participant-item": participantItem }
            : { "method-item": ownerItem };
        return key === "manifest" ? { value: { items } } : undefined;
      }),
    };
    supabaseAuthGetUserMock.mockResolvedValue({
      data: {
        user: { id: "participant-user", email: "student@example.com" },
      },
    });
    const ownerRow = {
      user_id: "owner-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey("sk-owner-secret", BYOK_TEST_KEY),
      enabled: true,
      share_mode: "all_assignments" as const,
      shared_item_ids: [] as string[],
    };
    const participantRow = {
      user_id: "participant-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o",
      api_key_enc: encryptApiKey("sk-participant-secret", BYOK_TEST_KEY),
      enabled: true,
    };
    maybeSingleMock.mockReset().mockImplementation((userId: string) =>
      Promise.resolve({
        data:
          userId === "owner-user"
            ? ownerRow
            : userId === "participant-user"
              ? participantRow
              : null,
        error: null,
      })
    );

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      store,
      supabase_session: { access_token: "participant-token" },
    });
    config.configurable!.workspace_item_id = "participant-item";

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-owner-secret",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
    });
    expect(chatOpenAIInvocations[0]).not.toMatchObject({
      apiKey: "sk-participant-secret",
    });
    expect(store.get).toHaveBeenCalledTimes(2);
  });

  it("an instructor specific_items grant covering the method overrides participant BYOK", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    const participantItem = {
      id: "participant-item",
      ownerId: "participant-user",
      kind: "method_participant",
      operatorId: "owner-user",
      operatorItemId: "method-item",
    };
    const ownerItem = {
      id: "method-item",
      ownerId: "owner-user",
      kind: "method",
      run: {
        participants: [
          {
            itemId: "participant-item",
            userId: "participant-user",
            email: "student@example.com",
          },
        ],
      },
    };
    const store = {
      get: vi.fn(async (namespace: string[], key: string) => {
        const items =
          namespace[1] === "participant-user"
            ? { "participant-item": participantItem }
            : { "method-item": ownerItem };
        return key === "manifest" ? { value: { items } } : undefined;
      }),
    };
    supabaseAuthGetUserMock.mockResolvedValue({
      data: {
        user: { id: "participant-user", email: "student@example.com" },
      },
    });
    const ownerRow = {
      user_id: "owner-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey("sk-owner-secret", BYOK_TEST_KEY),
      enabled: true,
      share_mode: "specific_items" as const,
      shared_item_ids: ["method-item"],
    };
    const participantRow = {
      user_id: "participant-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o",
      api_key_enc: encryptApiKey("sk-participant-secret", BYOK_TEST_KEY),
      enabled: true,
    };
    maybeSingleMock.mockReset().mockImplementation((userId: string) =>
      Promise.resolve({
        data:
          userId === "owner-user"
            ? ownerRow
            : userId === "participant-user"
              ? participantRow
              : null,
        error: null,
      })
    );

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      store,
      supabase_session: { access_token: "participant-token" },
    });
    config.configurable!.workspace_item_id = "participant-item";

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-owner-secret",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
    });
    expect(chatOpenAIInvocations[0]).not.toMatchObject({
      apiKey: "sk-participant-secret",
    });
  });

  it("a participant with no instructor grant falls back to their own BYOK settings", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    const participantItem = {
      id: "participant-item",
      ownerId: "participant-user",
      kind: "method_participant",
      operatorId: "owner-user",
      operatorItemId: "method-item",
    };
    const ownerItem = {
      id: "method-item",
      ownerId: "owner-user",
      kind: "method",
      run: {
        participants: [
          {
            itemId: "participant-item",
            userId: "participant-user",
            email: "student@example.com",
          },
        ],
      },
    };
    const store = {
      get: vi.fn(async (namespace: string[], key: string) => {
        const items =
          namespace[1] === "participant-user"
            ? { "participant-item": participantItem }
            : { "method-item": ownerItem };
        return key === "manifest" ? { value: { items } } : undefined;
      }),
    };
    supabaseAuthGetUserMock.mockResolvedValue({
      data: {
        user: { id: "participant-user", email: "student@example.com" },
      },
    });
    const ownerRow = {
      user_id: "owner-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey("sk-owner-secret", BYOK_TEST_KEY),
      enabled: true,
      share_mode: "none" as const,
      shared_item_ids: [] as string[],
    };
    const participantRow = {
      user_id: "participant-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o",
      api_key_enc: encryptApiKey("sk-participant-secret", BYOK_TEST_KEY),
      enabled: true,
    };
    maybeSingleMock.mockReset().mockImplementation((userId: string) =>
      Promise.resolve({
        data:
          userId === "owner-user"
            ? ownerRow
            : userId === "participant-user"
              ? participantRow
              : null,
        error: null,
      })
    );

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      store,
      supabase_session: { access_token: "participant-token" },
    });
    config.configurable!.workspace_item_id = "participant-item";

    await getModelFromConfig(config);

    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "openai/gpt-4o",
      apiKey: "sk-participant-secret",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
    });
    expect(chatOpenAIInvocations[0]).not.toMatchObject({
      apiKey: "sk-owner-secret",
    });
  });

  it("a revoked instructor grant does not override; falls back to own or platform BYOK", async () => {
    process.env.BYOK_ENCRYPTION_KEY = BYOK_TEST_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "service-role-key";

    const participantItem = {
      id: "participant-item",
      ownerId: "participant-user",
      kind: "method_participant",
      operatorId: "owner-user",
      operatorItemId: "method-item",
    };
    const ownerItem = {
      id: "method-item",
      ownerId: "owner-user",
      kind: "method",
      run: {
        participants: [
          { itemId: "participant-item", userId: "participant-user" },
        ],
      },
    };
    const store = {
      get: vi.fn(async (namespace: string[], key: string) => ({
        value:
          key === "manifest"
            ? {
                items:
                  namespace[1] === "participant-user"
                    ? { "participant-item": participantItem }
                    : { "method-item": ownerItem },
              }
            : undefined,
      })),
    };
    supabaseAuthGetUserMock.mockResolvedValue({
      data: { user: { id: "participant-user" } },
    });
    const revokedRow = {
      user_id: "owner-user",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      api_key_enc: encryptApiKey("sk-owner-secret", BYOK_TEST_KEY),
      enabled: true,
      share_mode: "specific_items" as const,
      shared_item_ids: ["another-method-item"],
    };
    maybeSingleMock.mockReset().mockImplementation((userId: string) =>
      Promise.resolve({
        data: userId === "owner-user" ? revokedRow : null,
        error: null,
      })
    );

    const config = createMockConfig({
      customModelName: "mimo-v2.5-free",
      store,
      supabase_session: { access_token: "participant-token" },
    });
    config.configurable!.workspace_item_id = "participant-item";

    await expect(getSharedByokModelSettings(config)).resolves.toBeNull();
    await getModelFromConfig(config);

    expect(chatOpenAIInvocations[0]).toMatchObject({
      model: "mimo-v2.5-free",
      apiKey: "zen-key",
    });
    expect(chatOpenAIInvocations[0]).not.toMatchObject({
      apiKey: "sk-owner-secret",
    });
  });
});
