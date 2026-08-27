/**
 * Token/API restore for the shared beta GitHub research connection.
 *
 * The OAuth-UI restore requires the GitHub app-owner sign-in secrets
 * (E2E_BETA_GITHUB_USERNAME/PASSWORD), which are not part of the fixture
 * env. The connection is instead restored through the LangGraph **Store
 * API**: the fixture's own credentials record (namespace
 * `github_research_credentials/<userId>`, key `credentials`) is snapshotted
 * BEFORE the destructive disconnect, then PUT back verbatim afterwards.
 * Records are encrypted with the server-wide
 * `GITHUB_RESEARCH_TOKEN_ENCRYPTION_KEY`, so a record is byte-for-byte
 * reusable across users/namespaces — the same recipe as ops-side
 * provisioning/restore.
 *
 * Store access comes from exported E2E_BETA_* variables:
 *   E2E_BETA_LANGGRAPH_API_URL    (required; e.g. http://127.0.0.1:54367 —
 *                                 point it at the LangGraph server, usually
 *                                 via an SSH tunnel from the runner host)
 *   E2E_BETA_LANGGRAPH_API_KEY    (optional; sent as x-api-key when set)
 *
 * Missing store config or a missing live record FAILS hard (never skips):
 * the revoke journey must not run without a working restore path, and the
 * gate must not go green with the journey unexercised.
 */
import { Page } from "@playwright/test";
import { baseUrl, requireEnv } from "./auth";

const STORE_ROOT = "github_research_credentials";
const CREDENTIALS_KEY = "credentials";
const CONNECTION_STATUS_KEY = "connection_status";
const SEARCH_PAGE_SIZE = 100;

export type GithubStoreClient = {
  baseUrl: string;
  apiKey?: string;
};

export type GithubCredentialsRecord = {
  accessTokenEnc: string;
  repositoryIds: number[];
  installationId?: number;
  [key: string]: unknown;
};

/** Build the store client from the exported E2E_BETA_LANGGRAPH_* env. */
export function githubStoreClient(): GithubStoreClient {
  const { E2E_BETA_LANGGRAPH_API_URL } = requireEnv(
    "E2E_BETA_LANGGRAPH_API_URL"
  );
  const apiKey = process.env.E2E_BETA_LANGGRAPH_API_KEY?.trim();
  return {
    baseUrl: E2E_BETA_LANGGRAPH_API_URL.replace(/\/+$/, ""),
    ...(apiKey ? { apiKey } : {}),
  };
}

async function storeRequest(
  client: GithubStoreClient,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (client.apiKey) headers.set("x-api-key", client.apiKey);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${client.baseUrl}${path}`, { ...init, headers });
}

/**
 * Derive the current user's Supabase id from the session JWT. The app stores
 * the session in the `sb-<ref>-auth-token` cookie, base64-wrapped; `sub` is
 * the user id that keys the github_research_credentials namespace.
 */
export async function currentSupabaseUserId(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find((cookie) =>
    /^sb-[^-]+-auth-token$/.test(cookie.name)
  );
  if (!tokenCookie) {
    throw new Error(
      "GitHub restore: no Supabase session cookie (sb-*-auth-token) found — log in before snapshotting"
    );
  }
  const raw = tokenCookie.value.startsWith("base64-")
    ? tokenCookie.value.slice("base64-".length)
    : tokenCookie.value;
  const jwt = Buffer.from(raw, "base64").toString("utf8");
  const payloadSegment = jwt.split(".")[1];
  if (!payloadSegment) {
    throw new Error("GitHub restore: session cookie did not contain a JWT");
  }
  const payload = Buffer.from(
    payloadSegment.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
  const parsed = JSON.parse(payload) as { sub?: unknown };
  if (typeof parsed.sub !== "string" || !parsed.sub) {
    throw new Error("GitHub restore: session JWT had no sub (user id)");
  }
  return parsed.sub;
}

/** Read the raw stored credentials record; null when the user has none. */
export async function readStoredCredentials(
  client: GithubStoreClient,
  userId: string
): Promise<GithubCredentialsRecord | null> {
  const url = new URL(`${client.baseUrl}/store/items`);
  url.searchParams.set("namespace", `${STORE_ROOT}.${userId}`);
  url.searchParams.set("key", CREDENTIALS_KEY);
  const response = await storeRequest(
    client,
    `${url.pathname}?${url.searchParams}`
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub restore: store GET failed with HTTP ${response.status}`
    );
  }
  const body = (await response.json()) as { value?: unknown };
  if (!body.value || typeof body.value !== "object") return null;
  return body.value as GithubCredentialsRecord;
}

/** Write a credentials record verbatim, with the app's search indexes. */
export async function writeStoredCredentials(
  client: GithubStoreClient,
  userId: string,
  value: GithubCredentialsRecord
): Promise<void> {
  const response = await storeRequest(client, "/store/items", {
    method: "PUT",
    body: JSON.stringify({
      namespace: [STORE_ROOT, userId],
      key: CREDENTIALS_KEY,
      value,
      index: ["installationId", "githubUserIdHash"],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub restore: store PUT failed with HTTP ${response.status}`
    );
  }
}

/** Remove a stale per-user store item (e.g. connection_status); 404 is fine. */
export async function deleteStoredItem(
  client: GithubStoreClient,
  userId: string,
  key: string
): Promise<void> {
  const response = await storeRequest(client, "/store/items", {
    method: "DELETE",
    body: JSON.stringify({ namespace: [STORE_ROOT, userId], key }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `GitHub restore: store DELETE ${key} failed with HTTP ${response.status}`
    );
  }
}

/**
 * Find any live credentials record bound to the fixture repository (the
 * owner-clone fallback: same verbatim-copy recipe as ops-side restore). Used
 * when the fixture's own snapshot is unavailable (e.g. a crashed prior run
 * left the fixture disconnected before this run started).
 */
export async function findCloneableCredentialsRecord(
  client: GithubStoreClient,
  repositoryId: number
): Promise<GithubCredentialsRecord | null> {
  const response = await storeRequest(client, "/store/items/search", {
    method: "POST",
    body: JSON.stringify({
      namespace_prefix: [STORE_ROOT],
      limit: SEARCH_PAGE_SIZE,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub restore: store search failed with HTTP ${response.status}`
    );
  }
  const body = (await response.json()) as {
    items?: Array<{ key?: unknown; value?: unknown }>;
  };
  for (const item of body.items ?? []) {
    if (item.key !== CREDENTIALS_KEY) continue;
    const value = item.value as GithubCredentialsRecord | undefined;
    if (
      value &&
      typeof value.accessTokenEnc === "string" &&
      Array.isArray(value.repositoryIds) &&
      value.repositoryIds.includes(repositoryId)
    ) {
      return value;
    }
  }
  return null;
}

/**
 * Restore the GitHub research connection after the disconnect journey:
 * write the snapshot (or a clone of any live record bound to the fixture
 * repository) back through the Store API, then verify the app reports
 * connected again. Throws on any failure — the shared fixture must never be
 * left disconnected silently.
 */
export async function restoreGithubConnectionViaStore(
  page: Page,
  client: GithubStoreClient,
  input: {
    userId: string;
    repositoryId: number;
    snapshot: GithubCredentialsRecord | null;
  }
): Promise<void> {
  const record =
    input.snapshot ??
    (await findCloneableCredentialsRecord(client, input.repositoryId));
  if (!record) {
    throw new Error(
      "GitHub restore: no credentials record to restore (no snapshot taken and no live record matches the fixture repository). Reconnect ops-side, then re-run the gate."
    );
  }
  await writeStoredCredentials(client, input.userId, record);
  await deleteStoredItem(client, input.userId, CONNECTION_STATUS_KEY);

  const restored = await page.request.get(
    `${baseUrl()}/api/workspace/github/repositories`
  );
  if (restored.status() !== 200) {
    throw new Error(
      `GitHub restore: verification GET failed with HTTP ${restored.status()}`
    );
  }
  const body = (await restored.json()) as { connected?: unknown };
  if (body.connected !== true) {
    throw new Error(
      "GitHub restore: verification failed — /api/workspace/github/repositories did not report connected=true"
    );
  }
}
