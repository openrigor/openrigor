import { ChatOpenAI } from "@langchain/openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function isOpenRouterEnabled(): boolean {
  return (
    process.env.OPENROUTER_ENABLED === "true" ||
    Boolean(process.env.OPENAI_API_BASE_URL?.includes("openrouter.ai"))
  );
}

/**
 * OpenRouter endpoint only. Do not reuse OPENAI_API_BASE_URL when it points
 * at a non-OpenRouter host (e.g. OpenCode Zen on public-dev) — premium
 * assignment traffic must not hit Zen with OpenRouter model slugs.
 */
export function getOpenRouterBaseUrl(): string {
  const explicit = process.env.OPENROUTER_BASE_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const openaiBase = process.env.OPENAI_API_BASE_URL?.trim();
  if (openaiBase?.includes("openrouter.ai")) {
    return openaiBase;
  }
  return OPENROUTER_BASE_URL;
}

export function getOpenRouterDefaultHeaders(): Record<string, string> {
  return {
    ...(process.env.OPENROUTER_HTTP_REFERER
      ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
      : {}),
    ...(process.env.OPENROUTER_APP_TITLE
      ? { "X-Title": process.env.OPENROUTER_APP_TITLE }
      : {}),
  };
}

export function resolvePremiumOpenRouterApiKey(): string {
  const apiKey = process.env.PREMIUM_OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "PREMIUM_OPENROUTER_API_KEY is required for premium assignments."
    );
  }
  return apiKey;
}

/**
 * Map legacy canvas model ids to OpenRouter slugs when the name has no vendor prefix.
 */
export function resolveOpenRouterModelName(modelName: string): string {
  if (modelName.includes("/")) {
    return modelName;
  }
  if (modelName.startsWith("claude-")) {
    return `anthropic/${modelName}`;
  }
  if (modelName.includes("gemini-")) {
    return `google/${modelName}`;
  }
  if (
    modelName.startsWith("gpt-") ||
    modelName.startsWith("o1") ||
    modelName.startsWith("o3") ||
    modelName.startsWith("o4")
  ) {
    return `openai/${modelName}`;
  }
  return modelName;
}

export function getOpenRouterSidecarModel(): string {
  return (
    process.env.OPENROUTER_SIDECAR_MODEL ||
    process.env.OPENROUTER_DEFAULT_MODEL ||
    "openai/gpt-4o-mini"
  );
}

/**
 * Small, cheap model for thread-title generation via OpenRouter.
 * Authenticates with PREMIUM_OPENROUTER_API_KEY — OPENAI_API_KEY is an
 * OpenCode/Zen key and OpenRouter rejects it (HTTP 401).
 */
export function createOpenRouterChatModel(
  modelName?: string,
  temperature = 0
): ChatOpenAI {
  const model = resolveOpenRouterModelName(
    modelName || getOpenRouterSidecarModel()
  );
  return new ChatOpenAI({
    model,
    temperature,
    apiKey: resolvePremiumOpenRouterApiKey(),
    configuration: {
      baseURL: getOpenRouterBaseUrl(),
      defaultHeaders: getOpenRouterDefaultHeaders(),
    },
  });
}
