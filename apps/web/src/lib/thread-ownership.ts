/**
 * Pure helpers for LangGraph proxy thread ownership checks.
 * Fail closed: missing/legacy metadata is treated as unauthorized.
 */

export type ProxyPathClassification =
  | { kind: "store" }
  | { kind: "thread_list" }
  | { kind: "thread_search" }
  | { kind: "thread_create" }
  | { kind: "thread_by_id"; threadId: string }
  | { kind: "other" };

/**
 * Classify a path after the `/api/` prefix has been stripped
 * (e.g. `threads/abc/runs/stream`).
 */
export function classifyProxyPath(path: string): ProxyPathClassification {
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");

  if (normalized === "store" || normalized.startsWith("store/")) {
    return { kind: "store" };
  }

  if (normalized === "threads/search") {
    return { kind: "thread_search" };
  }

  if (normalized === "threads") {
    return { kind: "thread_list" }; // GET list or POST create — method decides
  }

  const threadMatch = normalized.match(/^threads\/([^/]+)(?:\/.*)?$/);
  if (threadMatch) {
    return { kind: "thread_by_id", threadId: threadMatch[1] };
  }

  return { kind: "other" };
}

/** Whether this request is an explicit thread create (POST /threads). */
export function isThreadCreate(
  method: string,
  classification: ProxyPathClassification
): boolean {
  return method === "POST" && classification.kind === "thread_list";
}

/** Whether this request is a GET thread list (GET /threads). */
export function isThreadListGet(
  method: string,
  classification: ProxyPathClassification
): boolean {
  return method === "GET" && classification.kind === "thread_list";
}

/**
 * Fail-closed ownership check against thread metadata.user_id.
 */
export function threadOwnerMatches(
  metadata: unknown,
  authenticatedUserId: string
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const owner = (metadata as Record<string, unknown>).user_id;
  return typeof owner === "string" && owner === authenticatedUserId;
}

/**
 * Merge/override metadata so user_id is always the authenticated user.
 */
export function withOwnedThreadMetadata(
  metadata: unknown,
  authenticatedUserId: string
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, user_id: authenticatedUserId };
}
