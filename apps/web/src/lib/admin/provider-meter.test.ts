import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  appendProviderUsageEvent: vi.fn(),
}));

vi.mock("@/lib/teaching/admin-client", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: harness.maybeSingle })),
      })),
    })),
  })),
}));
vi.mock("@/lib/workspace/usage-store", () => ({
  appendProviderUsageEvent: harness.appendProviderUsageEvent,
}));

import {
  isProviderRunRequest,
  recordPlatformProviderRun,
} from "./provider-meter";

describe("provider usage meter", () => {
  beforeEach(() => {
    harness.maybeSingle
      .mockReset()
      .mockResolvedValue({ data: { enabled: false }, error: null });
    harness.appendProviderUsageEvent.mockReset().mockResolvedValue(undefined);
  });

  it("recognizes only thread run requests", () => {
    expect(isProviderRunRequest("POST", "threads/one/runs/stream")).toBe(true);
    expect(isProviderRunRequest("POST", "threads/one/runs")).toBe(true);
    expect(isProviderRunRequest("GET", "threads/one/runs/stream")).toBe(false);
    expect(isProviderRunRequest("POST", "threads")).toBe(false);
  });

  it("records exactly one event for each successful platform run", async () => {
    await recordPlatformProviderRun(
      "user-1",
      "POST",
      "threads/one/runs/stream",
      200
    );
    expect(harness.appendProviderUsageEvent).toHaveBeenCalledTimes(1);
    expect(harness.appendProviderUsageEvent).toHaveBeenCalledWith("user-1");
  });

  it("does not meter non-run or failed proxy responses", async () => {
    await recordPlatformProviderRun("user-1", "POST", "threads", 200);
    await recordPlatformProviderRun("user-1", "POST", "threads/one/runs", 500);

    expect(harness.maybeSingle).not.toHaveBeenCalled();
    expect(harness.appendProviderUsageEvent).not.toHaveBeenCalled();
  });

  it("skips successful runs when BYOK is enabled", async () => {
    harness.maybeSingle.mockResolvedValue({
      data: { enabled: true },
      error: null,
    });
    await recordPlatformProviderRun("user-1", "POST", "threads/one/runs", 200);
    expect(harness.appendProviderUsageEvent).not.toHaveBeenCalled();
  });

  it("fails closed when the BYOK lookup returns an error", async () => {
    harness.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("lookup failed"),
    });

    await recordPlatformProviderRun("user-1", "POST", "threads/one/runs", 200);

    expect(harness.appendProviderUsageEvent).not.toHaveBeenCalled();
  });

  it("passes token metadata to the usage event", async () => {
    await recordPlatformProviderRun("user-1", "POST", "threads/one/runs", 200, {
      tokensIn: 12,
      tokensOut: 8,
    });

    expect(harness.appendProviderUsageEvent).toHaveBeenCalledWith("user-1", {
      tokensIn: 12,
      tokensOut: 8,
    });
  });
});
