/**
 * Server-side store namespace resolution.
 * Clients may propose a root + optional suffix; the authenticated user id is
 * stamped into user-scoped positions. Unknown roots are rejected.
 */

export type ResolveNamespaceResult =
  | { ok: true; namespace: string[] }
  | { ok: false; error: string };

const ALLOWED_ROOTS = new Set([
  "memories",
  "custom_actions",
  "context_documents",
]);

export function resolveStoreNamespace(
  clientNamespace: unknown,
  authenticatedUserId: string
): ResolveNamespaceResult {
  if (!authenticatedUserId) {
    return { ok: false, error: "Missing authenticated user" };
  }

  if (!Array.isArray(clientNamespace) || clientNamespace.length === 0) {
    return { ok: false, error: "Invalid namespace" };
  }

  if (!clientNamespace.every((segment) => typeof segment === "string")) {
    return { ok: false, error: "Invalid namespace" };
  }

  const [root, ...rest] = clientNamespace as string[];

  if (!ALLOWED_ROOTS.has(root)) {
    return { ok: false, error: "Unknown namespace" };
  }

  switch (root) {
    case "custom_actions":
      // Always stamp the authenticated user — ignore any client-supplied id.
      return { ok: true, namespace: ["custom_actions", authenticatedUserId] };

    case "memories": {
      // Agents use ["memories", assistantId]; keep assistantId from client.
      const assistantId = rest[0];
      if (!assistantId || rest.length !== 1) {
        return { ok: false, error: "Invalid memories namespace" };
      }
      return {
        ok: true,
        namespace: ["memories", authenticatedUserId, assistantId],
      };
    }

    case "context_documents":
      // Scope documents per user; item key remains assistantId.
      return {
        ok: true,
        namespace: ["context_documents", authenticatedUserId],
      };

    default:
      return { ok: false, error: "Unknown namespace" };
  }
}
