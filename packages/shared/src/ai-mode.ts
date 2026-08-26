/** The only inference modes supported by the OpenRigor public beta. */
export const OPENRIGOR_AI_MODES = [
  "byok",
  "shared_model",
  "markdown_only",
] as const;

export type OpenRigorAiMode = (typeof OPENRIGOR_AI_MODES)[number];

/** Short aliases kept for callers that do not need the product-prefixed name. */
export type AiMode = OpenRigorAiMode;
export type LlmMode = OpenRigorAiMode;

/** Immutable version recorded when a user accepts the shared-model notice. */
export const SHARED_MODEL_NOTICE_VERSION = "2026-08-25" as const;
export const SHARED_MODEL_NOTICE_EFFECTIVE_DATE = "2026-08-25" as const;
export const SHARED_MODEL_NOTICE_PATH = "/privacy/shared-model" as const;

export interface UserAiConsentRow {
  user_id: string;
  mode: OpenRigorAiMode | null;
  privacy_notice_version: string | null;
  revoked_at: string | null;
  updated_at: string;
}

export function isOpenRigorAiMode(value: unknown): value is OpenRigorAiMode {
  return (
    typeof value === "string" &&
    (OPENRIGOR_AI_MODES as readonly string[]).includes(value)
  );
}

/** Accept presentation-style spellings at API boundaries, store one form. */
export function normalizeOpenRigorAiMode(
  value: unknown
): OpenRigorAiMode | undefined {
  if (isOpenRigorAiMode(value)) return value;
  if (value === "shared-model") return "shared_model";
  if (value === "markdown-only") return "markdown_only";
  return undefined;
}

export function isSharedModelNoticeVersionCurrent(
  version: unknown
): version is typeof SHARED_MODEL_NOTICE_VERSION {
  return version === SHARED_MODEL_NOTICE_VERSION;
}

export function assertCurrentSharedModelNoticeVersion(
  version: unknown
): asserts version is typeof SHARED_MODEL_NOTICE_VERSION {
  if (!isSharedModelNoticeVersionCurrent(version)) {
    throw new Error(
      `Shared-model privacy notice is stale; current version is ${SHARED_MODEL_NOTICE_VERSION}`
    );
  }
}
