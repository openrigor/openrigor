import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  resolveMethodTrackingAccess: vi.fn(),
  appendTrackingEvents: vi.fn(),
  readTrackingEvents: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  resolveMethodTrackingAccess: harness.resolveMethodTrackingAccess,
}));
vi.mock("@/lib/workspace/method-tracking", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspace/method-tracking")
  >("@/lib/workspace/method-tracking");
  return {
    ...actual,
    appendTrackingEvents: harness.appendTrackingEvents,
    readTrackingEvents: harness.readTrackingEvents,
  };
});

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/tracking/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tracking/events", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.resolveMethodTrackingAccess.mockReset();
    harness.appendTrackingEvents.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-2" },
    });
  });

  it("omits events when the frozen tracking lever is off", async () => {
    harness.resolveMethodTrackingAccess.mockResolvedValue({
      allowed: false,
      canWrite: false,
      canRead: false,
    });
    const response = await POST(
      request({
        threadId: "thread-1",
        events: [{ type: "session_summary", threadId: "thread-1" }],
      })
    );
    expect(response.status).toBe(403);
    expect(harness.appendTrackingEvents).not.toHaveBeenCalled();
  });

  it("stores events for a method-participant thread with tracking on", async () => {
    harness.resolveMethodTrackingAccess.mockResolvedValue({
      allowed: true,
      canWrite: true,
      canRead: true,
    });
    harness.appendTrackingEvents.mockResolvedValue(undefined);
    const response = await POST(
      request({
        threadId: "thread-1",
        events: [{ type: "session_summary", threadId: "thread-1" }],
      })
    );
    expect(response.status).toBe(200);
    expect(harness.appendTrackingEvents).toHaveBeenCalled();
  });
});
