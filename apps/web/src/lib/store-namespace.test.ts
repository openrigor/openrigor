import { describe, expect, it } from "vitest";
import { resolveStoreNamespace } from "./store-namespace";

describe("resolveStoreNamespace", () => {
  const userId = "auth-user-1";

  it("stamps authenticated user on custom_actions", () => {
    expect(
      resolveStoreNamespace(["custom_actions", "evil-user"], userId)
    ).toEqual({
      ok: true,
      namespace: ["custom_actions", userId],
    });
    expect(resolveStoreNamespace(["custom_actions"], userId)).toEqual({
      ok: true,
      namespace: ["custom_actions", userId],
    });
  });

  it("keeps assistant id for memories", () => {
    expect(resolveStoreNamespace(["memories", "asst-1"], userId)).toEqual({
      ok: true,
      namespace: ["memories", userId, "asst-1"],
    });
  });

  it("scopes context_documents to the user", () => {
    expect(resolveStoreNamespace(["context_documents"], userId)).toEqual({
      ok: true,
      namespace: ["context_documents", userId],
    });
    expect(
      resolveStoreNamespace(["context_documents", "evil-user"], userId)
    ).toEqual({
      ok: true,
      namespace: ["context_documents", userId],
    });
  });

  it("rejects unknown or invalid namespaces", () => {
    expect(resolveStoreNamespace(["secrets"], userId).ok).toBe(false);
    expect(resolveStoreNamespace(["memories"], userId).ok).toBe(false);
    expect(resolveStoreNamespace([], userId).ok).toBe(false);
    expect(resolveStoreNamespace(null, userId).ok).toBe(false);
  });
});
