import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reactState = vi.hoisted(() => {
  let providerLabel: string | undefined;
  let pendingEffect: (() => void | (() => void)) | undefined;
  let effectCleanup: (() => void) | undefined;

  return {
    getProviderLabel: () => providerLabel,
    flushEffects() {
      effectCleanup?.();
      effectCleanup = undefined;
      if (!pendingEffect) return;
      const cleanup = pendingEffect();
      pendingEffect = undefined;
      if (typeof cleanup === "function") effectCleanup = cleanup;
    },
    reset() {
      providerLabel = undefined;
      pendingEffect = undefined;
      effectCleanup?.();
      effectCleanup = undefined;
    },
    useState: () =>
      [
        providerLabel,
        (next: string | undefined) => {
          providerLabel = next;
        },
      ] as const,
    useEffect: (fn: () => void | (() => void)) => {
      pendingEffect = fn;
    },
  };
});

vi.mock("react", () => ({
  useState: reactState.useState,
  useEffect: reactState.useEffect,
}));

import { useSharedProviderLabel } from "./shared-provider";

const INSTRUCTOR_LABEL = "Provided by instructor — openai/gpt-4o-mini";

function jsonResponse(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => body,
  };
}

describe("useSharedProviderLabel", () => {
  beforeEach(() => {
    reactState.reset();
  });

  afterEach(() => {
    reactState.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the label when /api/byok/shared returns a non-OK response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(true, [
          { itemId: "item-a", providerLabel: INSTRUCTOR_LABEL },
        ])
      )
      .mockResolvedValueOnce(jsonResponse(false, { error: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    useSharedProviderLabel("item-a");
    reactState.flushEffects();
    await vi.waitFor(() => {
      expect(reactState.getProviderLabel()).toBe(INSTRUCTOR_LABEL);
    });

    useSharedProviderLabel("item-b");
    reactState.flushEffects();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(reactState.getProviderLabel()).toBeUndefined();
  });

  it("sets the provider label from a successful lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(true, [
            { itemId: "item-a", providerLabel: INSTRUCTOR_LABEL },
          ])
        )
    );

    useSharedProviderLabel("item-a");
    reactState.flushEffects();

    await vi.waitFor(() => {
      expect(reactState.getProviderLabel()).toBe(INSTRUCTOR_LABEL);
    });
    expect(fetch).toHaveBeenCalledWith("/api/byok/shared", {
      credentials: "include",
      cache: "no-store",
    });
  });

  it("clears a stale label as soon as itemId switches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(true, [
          { itemId: "item-a", providerLabel: INSTRUCTOR_LABEL },
        ])
      );
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    useSharedProviderLabel("item-a");
    reactState.flushEffects();
    await vi.waitFor(() => {
      expect(reactState.getProviderLabel()).toBe(INSTRUCTOR_LABEL);
    });

    useSharedProviderLabel("item-b");
    reactState.flushEffects();

    expect(reactState.getProviderLabel()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
