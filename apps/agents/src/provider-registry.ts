/**
 * Multi-provider model fallback system.
 *
 * Provides a registry of LLM provider configs, chain resolution from env vars,
 * retryable-error detection, and a factory that creates a ChatOpenAI model
 * for any named provider.
 *
 * The provider chain is ordered by priority:
 *   1. Primary (first) — tried first, e.g. free tier (rate-limited)
 *   2. Fallback (second) — tried on retryable failure, e.g. paid tier
 *
 * Configure via `LLM_PROVIDER_CHAIN` env var (comma-separated provider names).
 */

import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** OpenAI-compatible base URL. */
  baseURL: string;
  /** Model name to request (e.g. "deepseek-v4-flash-free"). */
  model: string;
  /** API key — falls back to OPENAI_API_KEY when not set for a specific provider. */
  apiKey?: string;
  /** Provider identifier passed to LangChain's initChatModel (always "openai" here). */
  modelProvider: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  "opencode-zen": {
    baseURL: process.env.OPENCODE_ZEN_BASE_URL || "https://opencode.ai/zen/v1",
    // deepseek-v4-flash-free has been returning empty/timeout upstream; mimo is the
    // working Zen free SKU (override with OPENCODE_ZEN_MODEL).
    model: process.env.OPENCODE_ZEN_MODEL || "mimo-v2.5-free",
    apiKey: process.env.OPENCODE_ZEN_API_KEY || process.env.OPENAI_API_KEY,
    modelProvider: "openai",
  },
  "opencode-go": {
    baseURL:
      process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1",
    model: process.env.OPENCODE_GO_MODEL || "deepseek-v4-flash",
    apiKey: process.env.OPENCODE_GO_API_KEY || process.env.OPENAI_API_KEY,
    modelProvider: "openai",
  },
};

const DEFAULT_PROVIDER_CHAIN = ["opencode-zen", "opencode-go"];

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

/**
 * Returns the ordered list of provider names to try.
 *
 * Reads `LLM_PROVIDER_CHAIN` env var as a comma-separated list.
 * Falls back to `["opencode-zen", "opencode-go"]` when unset.
 */
export function getProviderChain(): string[] {
  const raw = process.env.LLM_PROVIDER_CHAIN;
  if (raw && raw.trim().length > 0) {
    return raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_PROVIDER_CHAIN];
}

/**
 * Returns the **first** provider name from the chain.
 * Used to decide whether the fallback wrapper is needed at all.
 */
export function getPrimaryProviderName(): string {
  return getProviderChain()[0];
}

export function getProviderConfig(providerName: string): ProviderConfig {
  const cfg = PROVIDER_REGISTRY[providerName];
  if (!cfg) {
    throw new Error(
      `Unknown provider "${providerName}". ` +
        `Available: ${Object.keys(PROVIDER_REGISTRY).join(", ")}`
    );
  }

  return { ...cfg };
}

// ---------------------------------------------------------------------------
// Retryable-error detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the error indicates a transient provider failure
 * that justifies falling back to the next provider in the chain.
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  const err = error as Record<string, unknown>;

  // HTTP status codes
  if (err.status === 429) return true;
  if (err.status === 503) return true;

  // Node.js connection reset
  if (err.code === "ECONNRESET") return true;

  // Textual match for rate-limit messages
  if (
    typeof err.message === "string" &&
    (err.message as string).includes("Rate limit")
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Model factory
// ---------------------------------------------------------------------------

/**
 * Creates a `ChatOpenAI` instance configured for the named provider.
 *
 * @param providerName  Key in `PROVIDER_REGISTRY` (e.g. "opencode-zen").
 * @param generationConfig  Optional overrides for `temperature`, `maxTokens`, etc.
 */
export function createModelForProvider(
  providerName: string,
  generationConfig?: Record<string, unknown>
): BaseChatModel {
  const cfg = getProviderConfig(providerName);

  return new ChatOpenAI({
    model: cfg.model,
    ...(generationConfig || {}),
    ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
    maxRetries: 0,
    configuration: {
      baseURL: cfg.baseURL,
    },
  }) as unknown as BaseChatModel;
}

// ---------------------------------------------------------------------------
// Wrap a model instance with fallback logic
// ---------------------------------------------------------------------------

/**
 * Wraps a `BaseChatModel` instance so that `invoke`, `stream`, and `batch`
 * automatically retry with the next provider in the chain on retryable errors.
 *
 * @param primaryModel     The model instance returned by the existing logic.
 * @param providerChain    Ordered list of provider names (the first is the
 *                         provider that matches `primaryModel`).
 * @param generationConfig Optional generation params passed through to
 *                         `createModelForProvider` on fallback.
 */
export function wrapModelWithFallback(
  primaryModel: BaseChatModel,
  providerChain: string[],
  generationConfig?: Record<string, unknown>
): BaseChatModel {
  // No fallback possible with a single provider.
  if (providerChain.length <= 1) {
    return primaryModel;
  }

  // Save originals before patching — we must call the unbound prototype
  // method, not the patched instance property, to avoid infinite recursion.
  const originalInvoke = primaryModel.invoke;
  const originalStream = primaryModel.stream;
  const originalBatch = primaryModel.batch;

  let currentModel: BaseChatModel = primaryModel;
  let currentProviderIndex = 0;

  // -- helpers ---------------------------------------------------------------

  function switchToProvider(providerIndex: number, lastError: unknown): void {
    const newIndex = providerIndex + 1;
    if (newIndex >= providerChain.length) {
      throw lastError; // No more providers to try.
    }
    const nextProvider = providerChain[newIndex];
    console.warn(
      `[LLM Fallback] Switching from "${providerChain[currentProviderIndex]}" ` +
        `to "${nextProvider}" after error: ${(lastError as Error)?.message || lastError}`
    );
    currentModel = createModelForProvider(nextProvider, generationConfig);
    currentProviderIndex = newIndex;
  }

  async function tryInvoke(messages: unknown, options?: unknown): Promise<any> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await originalInvoke.call(
          currentModel,
          messages as never,
          options as never
        );
      } catch (err) {
        if (
          isRetryableError(err) &&
          currentProviderIndex < providerChain.length - 1
        ) {
          switchToProvider(currentProviderIndex, err);
          continue;
        }
        throw err;
      }
    }
  }

  async function tryStream(messages: unknown, options?: unknown): Promise<any> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await originalStream.call(
          currentModel,
          messages as never,
          options as never
        );
      } catch (err) {
        if (
          isRetryableError(err) &&
          currentProviderIndex < providerChain.length - 1
        ) {
          switchToProvider(currentProviderIndex, err);
          continue;
        }
        throw err;
      }
    }
  }

  async function tryBatch(messages: any[], options?: unknown): Promise<any[]> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await originalBatch.call(
          currentModel,
          messages,
          options as never
        );
      } catch (err) {
        if (
          isRetryableError(err) &&
          currentProviderIndex < providerChain.length - 1
        ) {
          switchToProvider(currentProviderIndex, err);
          continue;
        }
        throw err;
      }
    }
  }

  // -- Patch the model instance ----------------------------------------------
  // Replace `invoke`, `stream`, and `batch` on the instance itself (own
  // properties shadow the prototype) so that bindTools → RunnableBinding
  // picks up the wrapped versions.

  primaryModel.invoke = tryInvoke as typeof primaryModel.invoke;

  // Replace `stream` and `batch` on the instance so that bindTools →
  // RunnableBinding picks up the wrapped versions.
  Object.defineProperty(primaryModel, "stream", {
    value: tryStream,
    writable: true,
    configurable: true,
  });

  primaryModel.batch = tryBatch as typeof primaryModel.batch;

  return primaryModel;
}
