import { NextRequest, NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  exchangeGithubOAuthCode,
  refreshGithubUserTokenIfNeeded,
  resolveGithubResearchConnection,
} from "@/lib/workspace/research-repository/github-app";
import {
  consumeGithubOAuthState,
  storeGithubResearchCredentials,
} from "@/lib/workspace/research-repository/credentials";
import { refreshResearchRepositoryBindings } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

function positiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function appRedirect(request: NextRequest, status: string): URL {
  // Anchor the post-auth redirect on the canonical app URL when configured.
  // Behind the Cloudflare tunnel the Host header seen by this route can be an
  // internal origin, which sent users to https://localhost:3000/... after
  // GitHub authorization. SITE_URL is the same escape hatch admin-client uses.
  let base = request.url;
  const configuredBase = process.env.SITE_URL?.trim();
  if (configuredBase) {
    try {
      const parsed = new URL(configuredBase);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        base = configuredBase;
      }
    } catch {
      // Malformed SITE_URL (e.g. "https://"): fall back to the request URL.
    }
  }
  const target = new URL("/workspace/settings", base);
  target.searchParams.set("github", status);
  return target;
}

export async function GET(request: NextRequest) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(appRedirect(request, "denied"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json(
      { error: "Invalid OAuth callback" },
      { status: 400 }
    );
  }

  try {
    const verifier = await consumeGithubOAuthState(auth.user.id, state);
    if (!verifier) {
      return NextResponse.json(
        { error: "Invalid or expired OAuth state" },
        { status: 400 }
      );
    }

    const exchanged = await exchangeGithubOAuthCode(code, verifier);
    const tokens = await refreshGithubUserTokenIfNeeded(exchanged);
    const connection = await resolveGithubResearchConnection(
      tokens.accessToken,
      positiveInteger(request.nextUrl.searchParams.get("installation_id"))
    );
    await storeGithubResearchCredentials(auth.user.id, {
      tokens,
      installationId: connection.installationId,
      repositoryIds: connection.repositoryIds,
      displayMetadata: connection.displayMetadata,
    });
    try {
      await refreshResearchRepositoryBindings(auth.user.id);
    } catch (error) {
      console.error(
        "[github-research] repository refresh failed",
        error instanceof Error ? error.message : "unknown error"
      );
    }
    return NextResponse.redirect(appRedirect(request, "connected"));
  } catch (error) {
    console.error(
      "[github-research] OAuth callback failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.redirect(appRedirect(request, "error"));
  }
}
