import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { getWorkspaceItem } from "@/lib/workspace/store";
import type { UsableWorkspaceItem, WorkspaceItem } from "@/lib/workspace/types";
import { getGithubInstallationRepository } from "@/lib/workspace/research-repository/github-app";
import { readArtifactBlob } from "@/lib/workspace/research-repository/git-adapter";
import {
  resolveRepositoryArtifactPath,
  RepositoryLayoutError,
} from "@/lib/workspace/research-repository/layout";
import { parseArtifactFrontMatter } from "@/lib/workspace/research-repository/authoring";
import yaml from "js-yaml";
import {
  exportAsEvidencePacket,
  exportAsMarkdown,
  type ResearchExportProvenance,
} from "@/lib/export/research-export";
import { normalizeOpenRigorAiMode } from "@opencanvas/shared/ai-mode";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type ExportFormat = "markdown" | "evidence-packet";

type LoadedArtifact = {
  content: string;
  name?: string;
  path?: string;
  methodName?: string;
  methodVersion?: string;
  repository?: string;
  repositoryId?: number;
  branch?: string;
  commitSha?: string;
};

function formatFromRequest(request: Request): ExportFormat | undefined {
  const format = new URL(request.url).searchParams.get("format");
  if (!format || format === "markdown") return "markdown";
  if (format === "evidence-packet") return format;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringContent(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function methodMetadataFromMarkdown(
  content: string
): Pick<LoadedArtifact, "methodName" | "methodVersion"> {
  const parsed = parseArtifactFrontMatter(content);
  if (!parsed.ok) return {};
  const method = recordValue(parsed.data.method);
  if (parsed.data.type !== "Method" && !method) return {};
  return {
    methodName:
      stringValue(parsed.data.title) ??
      stringValue(parsed.data.name) ??
      stringValue(method?.title) ??
      stringValue(method?.name),
    methodVersion:
      stringValue(parsed.data.version) ?? stringValue(method?.version),
  };
}

function localArtifact(item: WorkspaceItem): LoadedArtifact {
  const raw = item as unknown as Record<string, unknown>;
  const submission = recordValue(raw.submission);
  const templateSnapshot = recordValue(raw.templateSnapshot);
  const methodSource = recordValue(raw.methodSource);
  const source = recordValue(raw.source);
  const ledgerSource = source;
  const artifactProvenance = recordValue(raw.provenance);
  const artifactBinding =
    recordValue(raw.repositoryBinding) ?? recordValue(raw.binding);
  const method = recordValue(raw.method);
  const nestedArtifact = recordValue(raw.artifact);
  const content =
    stringContent(raw.content) ??
    stringContent(raw.markdown) ??
    stringContent(nestedArtifact?.content) ??
    stringContent(nestedArtifact?.markdown) ??
    stringContent(nestedArtifact?.fullMarkdown) ??
    stringContent(submission?.resolvedMarkdown) ??
    stringContent(templateSnapshot?.initialMarkdown) ??
    stringContent(templateSnapshot?.layoutMarkdown) ??
    "";
  const privateRepository =
    recordValue(methodSource?.privateRepository) ??
    recordValue(ledgerSource?.privateRepository);

  return {
    content,
    name:
      stringValue(raw.name) ??
      stringValue(raw.title) ??
      stringValue(templateSnapshot?.title),
    methodName:
      stringValue(methodSource?.title) ??
      stringValue(methodSource?.name) ??
      stringValue(method?.title) ??
      stringValue(method?.name) ??
      stringValue(ledgerSource?.methodTitle),
    methodVersion:
      stringValue(methodSource?.version) ??
      stringValue(method?.version) ??
      stringValue(ledgerSource?.methodVersion),
    repositoryId:
      numberValue(privateRepository?.repositoryId) ??
      numberValue(artifactProvenance?.repositoryId) ??
      numberValue(artifactBinding?.repositoryId),
    repository:
      stringValue(artifactProvenance?.repository) ??
      stringValue(artifactBinding?.repositoryFullName) ??
      stringValue(raw.repository),
    branch:
      stringValue(artifactProvenance?.branch) ??
      stringValue(artifactBinding?.branch) ??
      stringValue(raw.branch),
    commitSha:
      stringValue(privateRepository?.commitSha) ??
      stringValue(artifactProvenance?.commitSha) ??
      stringValue(raw.commitSha),
  };
}

async function repositoryProvenance(
  userId: string,
  item: UsableWorkspaceItem,
  artifact: LoadedArtifact
): Promise<ResearchExportProvenance> {
  const binding =
    item.kind === "research_repository" ? item.binding : undefined;
  const raw = item as unknown as Record<string, unknown>;
  const methodSource = recordValue(raw.methodSource);
  const itemSource = recordValue(raw.source);
  const privateRepository =
    recordValue(methodSource?.privateRepository) ??
    recordValue(itemSource?.privateRepository);
  const repositoryItemId = stringValue(privateRepository?.repositoryItemId);
  const repositoryItem = repositoryItemId
    ? await getWorkspaceItem(userId, repositoryItemId)
    : undefined;
  const repositoryBinding =
    repositoryItem?.kind === "research_repository"
      ? repositoryItem.binding
      : undefined;

  return {
    repository:
      binding?.repositoryFullName ??
      repositoryBinding?.repositoryFullName ??
      artifact.repository ??
      null,
    repositoryId:
      binding?.repositoryId ??
      repositoryBinding?.repositoryId ??
      artifact.repositoryId ??
      null,
    branch:
      binding?.branch ?? repositoryBinding?.branch ?? artifact.branch ?? null,
    commitSha:
      artifact.commitSha ??
      repositoryBinding?.headCommitSha ??
      binding?.headCommitSha ??
      null,
    methodName: artifact.methodName ?? null,
    methodVersion: artifact.methodVersion ?? null,
  };
}

async function readConsent(userId: string): Promise<{
  mode: ReturnType<typeof normalizeOpenRigorAiMode>;
  privacyNoticeVersion: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_ai_consent")
    .select("mode, privacy_notice_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load AI-use consent");

  const row = recordValue(data);
  return {
    mode: normalizeOpenRigorAiMode(row?.mode),
    privacyNoticeVersion: stringValue(row?.privacy_notice_version) ?? null,
  };
}

async function loadRepositoryArtifact(
  item: Extract<UsableWorkspaceItem, { kind: "research_repository" }>,
  artifactId: string
): Promise<LoadedArtifact> {
  // The workspace item is owner-scoped before this function is reached. The
  // GitHub adapter resolves the path server-side and returns the commit that
  // was actually read for the export.
  const identity = resolveRepositoryArtifactPath(
    artifactId,
    item.binding.layoutVersion
  );
  const repository = await getGithubInstallationRepository(
    item.binding.installationId,
    item.binding.repositoryId
  );
  const result = await readArtifactBlob(
    item.binding.installationId,
    repository,
    item.binding.branch,
    identity.path
  );
  const methodMetadata =
    identity.kind === "method"
      ? methodMetadataFromMarkdown(result.content)
      : {};
  return {
    content: result.content,
    name: identity.path.split("/").at(-1) ?? identity.artifactId,
    path: identity.path,
    methodName: methodMetadata.methodName,
    methodVersion: methodMetadata.methodVersion,
    repository: item.binding.repositoryFullName ?? repository.nameWithOwner,
    repositoryId: item.binding.repositoryId,
    branch: item.binding.branch,
    commitSha: result.commitSha,
  };
}

/** Extract evidence_ledgers entries from artifact markdown frontmatter. */
function ledgerEntriesFromContent(content: string): unknown[] {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return [];
  try {
    const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as Record<string, unknown>).evidence_ledgers)
    ) {
      return (parsed as Record<string, unknown>).evidence_ledgers as unknown[];
    }
  } catch {
    // Malformed frontmatter — return empty rather than failing export.
  }
  return [];
}

function safeFilenamePart(value: string | undefined): string {
  const cleaned = (value || "artifact")
    .replace(/\.(?:md|markdown|yml|yaml|cff)$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "artifact";
}

function downloadHeaders(filename: string, contentType: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = formatFromRequest(request);
  if (!format) {
    return NextResponse.json(
      { error: "Unsupported export format" },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item) {
    return NextResponse.json(
      { error: "Workspace item not found" },
      { status: 404 }
    );
  }

  const artifactId = new URL(request.url).searchParams.get("artifactId");
  let artifact: LoadedArtifact;
  try {
    if (item.kind === "research_repository" && artifactId) {
      artifact = await loadRepositoryArtifact(item, artifactId);
    } else {
      artifact = localArtifact(item);
    }
  } catch (error) {
    if (
      error instanceof RepositoryLayoutError ||
      (error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 404)
    ) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }
    console.error("[workspace] failed to load export artifact", error);
    return NextResponse.json(
      { error: "Could not load artifact for export" },
      { status: 500 }
    );
  }

  const exportedAt = new Date().toISOString();
  let provenance: ResearchExportProvenance;
  try {
    const consent = await readConsent(auth.user.id);
    provenance = {
      ...(await repositoryProvenance(auth.user.id, item, artifact)),
      exportDate: exportedAt,
      llmMode: consent.mode ?? null,
      privacyNoticeVersion: consent.privacyNoticeVersion,
    } satisfies ResearchExportProvenance;
  } catch (error) {
    console.error("[workspace] failed to load export provenance", error);
    return NextResponse.json(
      { error: "Could not load provenance for export" },
      { status: 500 }
    );
  }
  const name = safeFilenamePart(artifact.name ?? artifact.path);
  const date = exportedAt.slice(0, 10);

  if (format === "evidence-packet") {
    const entries = ledgerEntriesFromContent(artifact.content);
    const packet = exportAsEvidencePacket(artifact, provenance, entries);
    return new Response(`${JSON.stringify(packet, null, 2)}\n`, {
      headers: downloadHeaders(
        `${name}-evidence-${date}.json`,
        "application/json; charset=utf-8"
      ),
    });
  }

  return new Response(exportAsMarkdown(artifact, provenance), {
    headers: downloadHeaders(
      `${name}-${date}.md`,
      "text/markdown; charset=utf-8"
    ),
  });
}
