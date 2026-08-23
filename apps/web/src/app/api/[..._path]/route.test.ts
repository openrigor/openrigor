import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  getCustomAssignmentById: vi.fn(),
  getSeedAssignmentById: vi.fn(),
  recordPlatformProviderRun: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
}));
vi.mock("@/lib/teaching/assignment-file-store", () => ({
  getCustomAssignmentById: harness.getCustomAssignmentById,
}));
vi.mock("@/lib/teaching/seed-loader", () => ({
  getSeedAssignmentById: harness.getSeedAssignmentById,
}));
vi.mock("@/lib/admin/provider-meter", () => ({
  recordPlatformProviderRun: harness.recordPlatformProviderRun,
}));

import { POST } from "./route";

const THREAD_ID = "thread-owned";

function runRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/threads/${THREAD_ID}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/threads/{id}/runs workspace policy", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.getCustomAssignmentById.mockReset();
    harness.getSeedAssignmentById.mockReset();
    harness.recordPlatformProviderRun.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      session: { access_token: "tok" },
      user: { id: "user-1" },
    });
    harness.getCustomAssignmentById.mockResolvedValue(undefined);
    harness.getSeedAssignmentById.mockResolvedValue(undefined);
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_owned",
      ownerId: "user-1",
      kind: "markdown_template",
      templateSnapshot: { assistantGuidance: "trusted guidance" },
    });
    vi.unstubAllGlobals();
  });

  it("fails closed when the workspace metadata re-fetch fails", async () => {
    let threadGets = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        threadGets += 1;
        if (threadGets <= 2) {
          return jsonResponse(200, {
            metadata: {
              user_id: "user-1",
              workspace_item_id: "wi_owned",
            },
          });
        }
        return jsonResponse(503, { error: "unavailable" });
      }
      if (url.endsWith(`/threads/${THREAD_ID}/runs`)) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      runRequest({
        assistant_id: "forged-assistant",
        config: { configurable: { systemPrompt: "forged guidance" } },
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Could not resolve workspace item",
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(`/threads/${THREAD_ID}/runs`)
      )
    ).toBe(false);
  });

  it("strips forged evidence metadata from thread creation", async () => {
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      ownerId: "user-1",
      kind: "method",
      templateSnapshot: { assistantGuidance: "method guidance" },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/threads") && init?.method === "POST") {
          return jsonResponse(200, { ok: true });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadata: {
            workspace_item_id: "wi_method",
            evidence: { method_id: "forged", frozen_values: { count: 999 } },
          },
          config: { configurable: {} },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(forwardedBody(fetchMock).metadata).not.toHaveProperty("evidence");
  });

  it("allows thread-create for an owned Ledger Snapshot workspace item", async () => {
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_snapshot",
      ownerId: "user-1",
      kind: "ledger_snapshot",
      snapshot: { ledgerId: "ledger_a" },
      config: { methodId: "method_a", templateId: "evidence-template" },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/threads") && init?.method === "POST") {
          return jsonResponse(200, { thread_id: "thread-snapshot" });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadata: { workspace_item_id: "wi_snapshot" },
          config: { configurable: {} },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(forwardedBody(fetchMock).metadata.workspace_item_id).toBe(
      "wi_snapshot"
    );
  });

  it("allows thread-create for an owned ledger workspace item (no 403)", async () => {
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_ledger",
      ownerId: "user-1",
      kind: "ledger",
      ledgerConfig: { methodId: "method_a", templateId: "evidence-template" },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/threads") && init?.method === "POST") {
          return jsonResponse(200, { thread_id: "thread-new" });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadata: { workspace_item_id: "wi_ledger" },
          config: { configurable: {} },
        }),
      })
    );

    // Thread-create for an owned ledger item must NOT be rejected by the
    // supportsWorkspaceThreads guard (issue #108 regression).
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(200);
    expect(forwardedBody(fetchMock).metadata.workspace_item_id).toBe(
      "wi_ledger"
    );
  });

  it("rejects thread-create for an unowned/invalid workspace_item_id (403)", async () => {
    harness.getWorkspaceItem.mockResolvedValue(undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error("must not forward unowned thread-create");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new NextRequest("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadata: { workspace_item_id: "wi_not_owned" },
          config: { configurable: {} },
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function forwardedBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST"
  );
  expect(call).toBeDefined();
  return JSON.parse(String((call![1] as RequestInit).body));
}

const CLIENT_MODEL = "claude-3-opus";
const ASSIGNMENT_MODEL = "openai/gpt-5.6-luna";

const clientModelPayload = {
  input: { customModelName: CLIENT_MODEL },
  metadata: { customModelName: CLIENT_MODEL },
  config: {
    configurable: {
      customModelName: CLIENT_MODEL,
      modelConfig: {
        provider: "azure_openai",
        temperatureRange: { current: 0.4 },
        maxTokens: { current: 4096 },
        azureConfig: { azureOpenAIApiKey: "sk-client" },
      },
    },
  },
};

const expectedSamplingModelConfig = {
  temperatureRange: { current: 0.4 },
  maxTokens: { current: 4096 },
};

describe("model sanitization", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.getCustomAssignmentById.mockReset();
    harness.getSeedAssignmentById.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      session: { access_token: "tok" },
      user: { id: "user-1" },
    });
    harness.getCustomAssignmentById.mockResolvedValue(undefined);
    harness.getSeedAssignmentById.mockResolvedValue(undefined);
    harness.getWorkspaceItem.mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("strips customModelName from a free thread run", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/threads/${THREAD_ID}`)) {
          return jsonResponse(200, { metadata: { user_id: "user-1" } });
        }
        if (url.endsWith(`/threads/${THREAD_ID}/runs`)) {
          expect(init?.method).toBe("POST");
          return jsonResponse(200, { ok: true });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      runRequest({
        ...clientModelPayload,
      })
    );

    expect(response.status).toBe(200);
    const body = forwardedBody(fetchMock);
    expect(body.config.configurable).not.toHaveProperty("customModelName");
    expect(body.input.customModelName).toBeUndefined();
    expect(body.metadata.customModelName).toBeUndefined();
    expect(body.config.configurable.modelConfig).toEqual(
      expectedSamplingModelConfig
    );
    expect(body.config.configurable.modelConfig).not.toHaveProperty("provider");
    expect(body.config.configurable.modelConfig).not.toHaveProperty(
      "azureConfig"
    );
  });

  it("overrides customModelName from the assignment record", async () => {
    harness.getCustomAssignmentById.mockResolvedValue({
      id: "asg-1",
      customModelName: ASSIGNMENT_MODEL,
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/threads/${THREAD_ID}`)) {
          return jsonResponse(200, {
            metadata: { user_id: "user-1", assignment_id: "asg-1" },
          });
        }
        if (url.endsWith(`/threads/${THREAD_ID}/runs`)) {
          expect(init?.method).toBe("POST");
          return jsonResponse(200, { ok: true });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(runRequest(clientModelPayload));

    expect(response.status).toBe(200);
    const body = forwardedBody(fetchMock);
    expect(body.config.configurable.customModelName).toBe(ASSIGNMENT_MODEL);
    expect(body.input.customModelName).toBeUndefined();
    expect(body.metadata.customModelName).toBeUndefined();
    expect(body.config.configurable.modelConfig).toEqual(
      expectedSamplingModelConfig
    );
    expect(body.config.configurable.modelConfig).not.toHaveProperty("provider");
    expect(body.config.configurable.modelConfig).not.toHaveProperty(
      "azureConfig"
    );
  });

  it("strips customModelName when the assignment has no model", async () => {
    harness.getCustomAssignmentById.mockResolvedValue({
      id: "asg-2",
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/threads/${THREAD_ID}`)) {
          return jsonResponse(200, {
            metadata: { user_id: "user-1", assignment_id: "asg-2" },
          });
        }
        if (url.endsWith(`/threads/${THREAD_ID}/runs`)) {
          expect(init?.method).toBe("POST");
          return jsonResponse(200, { ok: true });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(runRequest(clientModelPayload));

    expect(response.status).toBe(200);
    const body = forwardedBody(fetchMock);
    expect(body.config.configurable).not.toHaveProperty("customModelName");
    expect(body.input.customModelName).toBeUndefined();
    expect(body.metadata.customModelName).toBeUndefined();
  });

  it("strips client metadata.customModelName on thread-create", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/threads") && init?.method === "POST") {
          return jsonResponse(200, { ok: true });
        }
        throw new Error(`unexpected fetch ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest("threads", {
        metadata: { customModelName: CLIENT_MODEL },
        config: { configurable: { customModelName: CLIENT_MODEL } },
      })
    );

    expect(response.status).toBe(200);
    const body = forwardedBody(fetchMock);
    expect(body.metadata.customModelName).toBeUndefined();
    expect(body.config.configurable).not.toHaveProperty("customModelName");
  });
});
