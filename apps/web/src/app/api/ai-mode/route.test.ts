import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SHARED_MODEL_NOTICE_VERSION } from "@opencanvas/shared/ai-mode";

const harness = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const selectAfterEq = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ maybeSingle, select: selectAfterEq }));
  const select = vi.fn(() => ({ eq, maybeSingle }));
  const upsert = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert, update }));
  const getUser = vi.fn();
  const createClient = vi.fn(() => ({
    auth: { getUser },
    from,
  }));
  return {
    maybeSingle,
    eq,
    select,
    upsert,
    update,
    from,
    getUser,
    createClient,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: harness.createClient,
}));

import { DELETE, GET, PUT } from "./route";

const currentRow = {
  user_id: "user-1",
  mode: "shared_model" as const,
  privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
  revoked_at: null,
  updated_at: "2026-08-26T00:00:00.000Z",
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/ai-mode", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("/api/ai-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    harness.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("reports missing authorization without silently selecting a mode", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      mode: null,
      authorization_state: "missing",
      consent: null,
    });
  });

  it("persists BYOK mode without putting provider keys in the consent row", async () => {
    harness.maybeSingle.mockResolvedValue({
      data: {
        user_id: "user-1",
        mode: "byok",
        privacy_notice_version: null,
        revoked_at: null,
        updated_at: currentRow.updated_at,
      },
      error: null,
    });

    const response = await PUT(request({ mode: "byok" }));
    expect(response.status).toBe(200);
    expect(harness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        mode: "byok",
        privacy_notice_version: null,
        revoked_at: null,
      }),
      { onConflict: "user_id" }
    );
    expect(await json(response)).toMatchObject({
      mode: "byok",
      authorization_state: "byok",
    });
  });

  it("accepts shared-model mode only with the current recorded notice version", async () => {
    harness.maybeSingle.mockResolvedValue({
      data: currentRow,
      error: null,
    });

    const response = await PUT(
      request({
        mode: "shared_model",
        privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
      })
    );
    expect(response.status).toBe(200);
    expect(harness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "shared_model",
        privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
      }),
      { onConflict: "user_id" }
    );
    expect(await json(response)).toMatchObject({
      mode: "shared_model",
      authorization_state: "shared_model",
    });
  });

  it("rejects stale consent and requires re-accept after a notice-version change", async () => {
    const stale = await PUT(
      request({
        mode: "shared_model",
        privacy_notice_version: "2026-08-24",
      })
    );
    expect(stale.status).toBe(400);
    expect((await json(stale)).error).toMatch(/stale/i);
    expect(harness.upsert).not.toHaveBeenCalled();

    harness.maybeSingle.mockResolvedValue({
      data: currentRow,
      error: null,
    });
    const reaccepted = await PUT(
      request({
        mode: "shared_model",
        privacy_notice_version: SHARED_MODEL_NOTICE_VERSION,
      })
    );
    expect(reaccepted.status).toBe(200);
  });

  it("marks the current mode revoked and exposes that state", async () => {
    harness.maybeSingle
      .mockResolvedValueOnce({ data: currentRow, error: null })
      .mockResolvedValueOnce({
        data: { ...currentRow, revoked_at: "2026-08-26T01:00:00.000Z" },
        error: null,
      });

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      mode: "shared_model",
      authorization_state: "revoked",
      revoked_at: "2026-08-26T01:00:00.000Z",
    });
  });
});
