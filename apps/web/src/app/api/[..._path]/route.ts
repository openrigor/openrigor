import { LANGGRAPH_API_URL } from "../../../constants";
import { NextRequest, NextResponse } from "next/server";
import { Session, User } from "@supabase/supabase-js";
import { verifyUserAuthenticated } from "../../../lib/supabase/verify_user_server";
import {
  classifyProxyPath,
  isThreadCreate,
  isThreadListGet,
  threadOwnerMatches,
  withOwnedThreadMetadata,
} from "../../../lib/thread-ownership";
import { getCustomAssignmentById } from "../../../lib/teaching/assignment-file-store";
import { getSeedAssignmentById } from "../../../lib/teaching/seed-loader";
import { resolveApparatusConfiguration } from "../../../lib/apparatuses/runtime";
import { getWorkspaceItem } from "../../../lib/workspace/store";
import {
  enforceWorkspaceThreadPolicy,
  supportsWorkspaceThreads,
} from "../../../lib/workspace/thread-policy";
import {
  buildEvidenceSnapshotFromMarker,
  EvidenceRunNotConcludedError,
  EvidenceUnavailableError,
} from "../../../lib/workspace/evidence";
import {
  recordPlatformProviderRun,
  type ProviderTokenUsage,
} from "../../../lib/admin/provider-meter";

const PROVIDER_METERING_TIMEOUT_MS = 2500;

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function tokenUsageFromObject(value: unknown): ProviderTokenUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const tokensIn =
    tokenCount(record.input_tokens) ??
    tokenCount(record.prompt_tokens) ??
    tokenCount(record.inputTokens) ??
    tokenCount(record.tokensIn);
  const tokensOut =
    tokenCount(record.output_tokens) ??
    tokenCount(record.completion_tokens) ??
    tokenCount(record.outputTokens) ??
    tokenCount(record.tokensOut);
  if (tokensIn === undefined && tokensOut === undefined) return undefined;
  return { tokensIn: tokensIn ?? 0, tokensOut: tokensOut ?? 0 };
}

function tokenUsageFromMessage(value: unknown): ProviderTokenUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return (
    tokenUsageFromObject(record) ??
    tokenUsageFromObject(record.usage) ??
    tokenUsageFromObject(record.usage_metadata) ??
    tokenUsageFromObject(
      record.response_metadata && typeof record.response_metadata === "object"
        ? (record.response_metadata as Record<string, unknown>).token_usage
        : undefined
    )
  );
}

function extractProviderTokenUsage(
  body: unknown
): ProviderTokenUsage | undefined {
  const directUsage = tokenUsageFromMessage(body);
  if (directUsage) return directUsage;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const messages = (body as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return undefined;

  let tokensIn = 0;
  let tokensOut = 0;
  let found = false;
  for (const message of messages) {
    const usage = tokenUsageFromMessage(message);
    if (!usage) continue;
    found = true;
    tokensIn += usage.tokensIn ?? 0;
    tokensOut += usage.tokensOut ?? 0;
  }
  return found ? { tokensIn, tokensOut } : undefined;
}

async function runProviderMetering(
  userId: string,
  method: string,
  path: string,
  status: number,
  usageResponse?: Response
): Promise<void> {
  try {
    let tokens: ProviderTokenUsage | undefined;
    if (usageResponse) {
      tokens = extractProviderTokenUsage(await usageResponse.json());
    }
    if (tokens) {
      await recordPlatformProviderRun(userId, method, path, status, tokens);
    } else {
      await recordPlatformProviderRun(userId, method, path, status);
    }
  } catch (error) {
    console.error("Failed to run provider usage metering", error);
  }
}

function scheduleProviderMetering(
  userId: string,
  method: string,
  path: string,
  status: number,
  usageResponse?: Response
): void {
  // There is no post-response hook in this proxy, so defer all metering work
  // until after the response has been returned to the caller.
  setTimeout(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, PROVIDER_METERING_TIMEOUT_MS);
    });
    const metering = runProviderMetering(
      userId,
      method,
      path,
      status,
      usageResponse
    );
    void Promise.race([metering, timeout]).then(
      () => {
        if (timeoutId) clearTimeout(timeoutId);
      },
      (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.error("Provider usage metering failed", error);
      }
    );
  }, 0);
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

async function assertThreadOwnership(
  threadId: string,
  authenticatedUserId: string
): Promise<NextResponse | null> {
  const res = await fetch(`${LANGGRAPH_API_URL}/threads/${threadId}`, {
    headers: {
      "x-api-key": process.env.LANGCHAIN_API_KEY || "",
    },
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (!res.ok) {
    console.error("Failed to fetch thread for ownership check", res.status);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await res.json();
  if (!threadOwnerMatches(thread?.metadata, authenticatedUserId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workspaceItemId = thread?.metadata?.workspace_item_id;
  if (typeof workspaceItemId === "string") {
    const item = await getWorkspaceItem(authenticatedUserId, workspaceItemId);
    if (!item)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

/** Keep only sampling fields from a client-supplied CustomModelConfig. */
function whitelistModelConfigSampling(
  container: Record<string, unknown> | undefined
): void {
  if (!container || typeof container !== "object") return;
  if (!Object.prototype.hasOwnProperty.call(container, "modelConfig")) return;
  const src = container.modelConfig;
  const next: Record<string, unknown> = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const rec = src as Record<string, unknown>;
    if ("temperatureRange" in rec) {
      next.temperatureRange = rec.temperatureRange;
    }
    if ("maxTokens" in rec) {
      next.maxTokens = rec.maxTokens;
    }
  }
  container.modelConfig = next;
}

function sanitizeClientModelConfig(parsedBody: {
  config?: { configurable?: Record<string, unknown> };
  input?: unknown;
  metadata?: unknown;
}): void {
  whitelistModelConfigSampling(parsedBody.config?.configurable);
  if (parsedBody.input && typeof parsedBody.input === "object") {
    whitelistModelConfigSampling(parsedBody.input as Record<string, unknown>);
  }
  if (parsedBody.metadata && typeof parsedBody.metadata === "object") {
    whitelistModelConfigSampling(
      parsedBody.metadata as Record<string, unknown>
    );
  }
}

async function getAssignmentTreatment(assignmentId: unknown) {
  if (typeof assignmentId !== "string" || assignmentId.length === 0) {
    return undefined;
  }
  const assignment =
    (await getCustomAssignmentById(assignmentId)) ||
    (await getSeedAssignmentById(assignmentId));
  if (!assignment) return undefined;
  return (
    assignment.apparatusConfiguration ??
    resolveApparatusConfiguration({
      apparatusId: assignment.apparatusId,
      profileId: assignment.apparatusProfileId,
    }).apparatusConfiguration
  );
}

async function handleRequest(req: NextRequest, method: string) {
  let session: Session | undefined;
  let user: User | undefined;
  try {
    const authRes = await verifyUserAuthenticated();
    session = authRes?.session;
    user = authRes?.user;
    if (!session || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (e) {
    console.error("Failed to fetch user", e);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const path = req.nextUrl.pathname.replace(/^\/?api\//, "");
    const classification = classifyProxyPath(path);

    // Store must go through dedicated /api/store/* routes with namespace scoping.
    if (classification.kind === "store") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ownership gate for any threads/{id}/... path.
    if (classification.kind === "thread_by_id") {
      const denied = await assertThreadOwnership(
        classification.threadId,
        user.id
      );
      if (denied) return denied;
    }

    const url = new URL(req.url);
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete("_path");
    searchParams.delete("nxtP_path");

    // GET /threads — scope list to the authenticated user.
    if (isThreadListGet(method, classification)) {
      searchParams.set("metadata", JSON.stringify({ user_id: user.id }));
    }

    const queryString = searchParams.toString()
      ? `?${searchParams.toString()}`
      : "";

    const options: RequestInit = {
      method,
      headers: {
        "x-api-key": process.env.LANGCHAIN_API_KEY || "",
      },
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      options.headers = {
        ...options.headers,
        "Content-Type": "application/json",
      };
      const bodyText = await req.text();

      if (typeof bodyText === "string" && bodyText.length > 0) {
        const parsedBody = JSON.parse(bodyText);
        parsedBody.config = parsedBody.config || {};
        parsedBody.config.configurable = {
          ...parsedBody.config.configurable,
          supabase_session: session,
          supabase_user_id: user.id,
        };
        if (
          (classification.kind === "thread_by_id" ||
            isThreadCreate(method, classification)) &&
          parsedBody.metadata &&
          typeof parsedBody.metadata === "object"
        ) {
          delete parsedBody.metadata.evidence;
        }

        // Apparatus treatment is server-authoritative. Resolve the immutable
        // snapshot from the assignment recorded on the owned thread and
        // overwrite any browser-supplied knob values before forwarding.
        if (
          classification.kind === "thread_by_id" ||
          isThreadCreate(method, classification)
        ) {
          try {
            let assignmentId: unknown = parsedBody.metadata?.assignment_id;
            if (classification.kind === "thread_by_id") {
              const threadRes = await fetch(
                `${LANGGRAPH_API_URL}/threads/${classification.threadId}`,
                {
                  headers: { "x-api-key": process.env.LANGCHAIN_API_KEY || "" },
                }
              );
              const thread = threadRes.ok ? await threadRes.json() : null;
              assignmentId = thread?.metadata?.assignment_id;
            }
            const treatment = await getAssignmentTreatment(assignmentId);
            if (treatment) {
              if (parsedBody.input && typeof parsedBody.input === "object") {
                parsedBody.input.apparatusConfiguration = treatment;
              }
              parsedBody.config.configurable.apparatusConfiguration = treatment;
            } else {
              if (parsedBody.input && typeof parsedBody.input === "object") {
                delete parsedBody.input.apparatusConfiguration;
              }
              delete parsedBody.config.configurable.apparatusConfiguration;
            }
          } catch (apparatusError) {
            console.error(
              "Failed to resolve server apparatus snapshot",
              apparatusError
            );
            return NextResponse.json(
              { error: "Could not resolve assignment treatment" },
              { status: 409 }
            );
          }
        }

        // POST /threads — stamp ownership metadata.
        if (isThreadCreate(method, classification)) {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        // Workspace threads are server-bound to an owned item. The browser may
        // propose the item id, but it cannot choose its contents, guidance, or
        // assistant. Existing workspace threads are resolved again for every
        // run so forged config values never reach LangGraph.
        let workspaceItemId: unknown = isThreadCreate(method, classification)
          ? parsedBody.metadata?.workspace_item_id
          : undefined;
        let ownedThreadMetadata: Record<string, unknown> | undefined;
        if (classification.kind === "thread_by_id") {
          const threadRes = await fetch(
            `${LANGGRAPH_API_URL}/threads/${classification.threadId}`,
            { headers: { "x-api-key": process.env.LANGCHAIN_API_KEY || "" } }
          );
          if (!threadRes.ok) {
            console.error(
              "Failed to re-read thread metadata for workspace policy",
              threadRes.status
            );
            return NextResponse.json(
              { error: "Could not resolve workspace item" },
              { status: 409 }
            );
          }
          const thread = await threadRes.json();
          ownedThreadMetadata =
            thread?.metadata && typeof thread.metadata === "object"
              ? (thread.metadata as Record<string, unknown>)
              : undefined;
          workspaceItemId = thread?.metadata?.workspace_item_id;
        }

        if (workspaceItemId !== undefined) {
          if (typeof workspaceItemId !== "string" || !workspaceItemId) {
            return NextResponse.json(
              { error: "Invalid workspace item" },
              { status: 403 }
            );
          }
          const workspaceItem = await getWorkspaceItem(
            user.id,
            workspaceItemId
          );
          if (!workspaceItem) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
          if (!supportsWorkspaceThreads(workspaceItem)) {
            return NextResponse.json(
              {
                error: "This workspace item does not support assistant threads",
              },
              { status: 403 }
            );
          }

          // Evidence is server-stamped at creation. Reuse only that marker on
          // subsequent runs; client metadata cannot select a different
          // template, layout, guidance, or frozen snapshot.
          if (parsedBody.metadata && typeof parsedBody.metadata === "object") {
            delete parsedBody.metadata.evidence;
          }
          if (ownedThreadMetadata?.evidence) {
            parsedBody.metadata = {
              ...(parsedBody.metadata && typeof parsedBody.metadata === "object"
                ? parsedBody.metadata
                : {}),
              evidence: ownedThreadMetadata.evidence,
            };
          }

          let evidenceSnapshot:
            | ReturnType<typeof buildEvidenceSnapshotFromMarker>
            | undefined;
          if (
            workspaceItem.kind === "method" &&
            ownedThreadMetadata &&
            typeof ownedThreadMetadata === "object" &&
            (ownedThreadMetadata as Record<string, unknown>).evidence
          ) {
            try {
              evidenceSnapshot = buildEvidenceSnapshotFromMarker(
                workspaceItem,
                (ownedThreadMetadata as Record<string, unknown>).evidence
              );
            } catch (error) {
              if (
                error instanceof EvidenceRunNotConcludedError ||
                error instanceof EvidenceUnavailableError
              ) {
                return NextResponse.json(
                  { error: "Evidence snapshot is no longer available" },
                  { status: 409 }
                );
              }
              throw error;
            }
          }

          Object.assign(
            parsedBody,
            enforceWorkspaceThreadPolicy(
              parsedBody,
              workspaceItem,
              user.id,
              process.env.EVALUCHAT_WORKSPACE_ASSISTANT_ID || "agent",
              evidenceSnapshot
            )
          );
          if (isThreadCreate(method, classification)) {
            // assistant_id is a run field; keep thread creation payloads
            // limited to thread metadata/configuration.
            delete parsedBody.assistant_id;
          }
        }

        // POST /threads/search — force metadata filter to this user.
        if (classification.kind === "thread_search") {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        // PATCH thread metadata — prevent ownership reassignment.
        if (
          method === "PATCH" &&
          classification.kind === "thread_by_id" &&
          parsedBody.metadata
        ) {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        // Model name is server-authoritative. Strip client-supplied
        // customModelName; override from the assignment record when set.
        if (
          classification.kind === "thread_by_id" ||
          isThreadCreate(method, classification)
        ) {
          try {
            let assignmentId: unknown = parsedBody.metadata?.assignment_id;
            if (classification.kind === "thread_by_id") {
              const threadRes = await fetch(
                `${LANGGRAPH_API_URL}/threads/${classification.threadId}`,
                {
                  headers: { "x-api-key": process.env.LANGCHAIN_API_KEY || "" },
                }
              );
              const thread = threadRes.ok ? await threadRes.json() : null;
              assignmentId = thread?.metadata?.assignment_id;
            }
            const assignment =
              typeof assignmentId === "string" && assignmentId.length > 0
                ? (await getCustomAssignmentById(assignmentId)) ||
                  (await getSeedAssignmentById(assignmentId))
                : undefined;
            const assignmentModel =
              typeof assignment?.customModelName === "string"
                ? assignment.customModelName
                : "";
            if (parsedBody.input && typeof parsedBody.input === "object") {
              delete parsedBody.input.customModelName;
            }
            if (
              parsedBody.metadata &&
              typeof parsedBody.metadata === "object"
            ) {
              delete parsedBody.metadata.customModelName;
            }
            if (assignmentModel) {
              parsedBody.config.configurable.customModelName = assignmentModel;
            } else {
              delete parsedBody.config.configurable.customModelName;
            }
            sanitizeClientModelConfig(parsedBody);
          } catch (modelError) {
            console.error("Failed to resolve server model name", modelError);
            if (parsedBody.input && typeof parsedBody.input === "object") {
              delete parsedBody.input.customModelName;
            }
            if (
              parsedBody.metadata &&
              typeof parsedBody.metadata === "object"
            ) {
              delete parsedBody.metadata.customModelName;
            }
            delete parsedBody.config.configurable.customModelName;
            sanitizeClientModelConfig(parsedBody);
          }
        }

        options.body = JSON.stringify(parsedBody);
      } else {
        options.body = bodyText;
      }
    }

    const res = await fetch(
      `${LANGGRAPH_API_URL}/${path}${queryString}`,
      options
    );

    if (res.status >= 400) {
      console.error(
        "ERROR IN PROXY",
        `${LANGGRAPH_API_URL}/${path}${queryString}`,
        res.status,
        res.statusText
      );
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
      });
    }

    const usageResponse =
      !path.endsWith("/stream") &&
      res.status < 400 &&
      /^threads\/[^/]+\/runs$/.test(path)
        ? res.clone()
        : undefined;
    // Stream token totals are intentionally not counted in v1 (best-effort per
    // issue #66); never consume or buffer a streaming response to meter tokens.

    const headers = new Headers({
      ...getCorsHeaders(),
    });
    // Safely add headers from the original response
    res.headers.forEach((value, key) => {
      try {
        headers.set(key, value);
      } catch (error) {
        console.warn(`Failed to set header: ${key}`, error);
      }
    });

    const response = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
    scheduleProviderMetering(user.id, method, path, res.status, usageResponse);
    return response;
  } catch (e: any) {
    console.error("Error in proxy");
    console.error(e);
    console.error("\n\n\nEND ERROR\n\n");
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

export const GET = (req: NextRequest) => handleRequest(req, "GET");
export const POST = (req: NextRequest) => handleRequest(req, "POST");
export const PUT = (req: NextRequest) => handleRequest(req, "PUT");
export const PATCH = (req: NextRequest) => handleRequest(req, "PATCH");
export const DELETE = (req: NextRequest) => handleRequest(req, "DELETE");

// Add a new OPTIONS handler
export const OPTIONS = () => {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(),
    },
  });
};
