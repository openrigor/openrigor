import {
  normalizeOpenRigorAiMode,
  type OpenRigorAiMode,
} from "@opencanvas/shared/ai-mode";

export type ResearchExportArtifact = unknown;

export type ResearchExportProvenance = {
  repository?: string | null;
  repositoryId?: number | string | null;
  branch?: string | null;
  commitSha?: string | null;
  methodName?: string | null;
  methodVersion?: string | null;
  exportDate?: string | null;
  llmMode?: OpenRigorAiMode | string | null;
  privacyNoticeVersion?: string | null;
};

export type ResearchExportProvenanceBlock = {
  repository: string | null;
  repositoryId: number | string | null;
  branch: string | null;
  commitSha: string | null;
  methodName: string | null;
  methodVersion: string | null;
  exportDate: string;
  llmMode: OpenRigorAiMode | null;
  privacyNoticeVersion: string | null;
};

export type EvidencePacket = {
  artifact: string;
  provenance: ResearchExportProvenanceBlock;
  ledgerEntries: readonly unknown[];
  disclosureAppendix: string;
};

const AI_MODE_LABELS: Record<OpenRigorAiMode, string> = {
  byok: "BYOK (user-provided API key)",
  shared_model: "Shared model (OpenRigor-provided)",
  markdown_only: "Markdown-only (no AI inference)",
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function artifactMarkdown(artifact: unknown): string {
  if (typeof artifact === "string") return artifact;
  if (!artifact || typeof artifact !== "object") return "";

  const value = artifact as Record<string, unknown>;
  for (const key of ["content", "markdown", "fullMarkdown"]) {
    if (typeof value[key] === "string") return value[key] as string;
  }

  if (typeof value.artifact === "string") return value.artifact;

  if (Array.isArray(value.contents)) {
    const contents = value.contents.filter(
      (content): content is Record<string, unknown> =>
        Boolean(content) && typeof content === "object"
    );
    const currentIndex =
      typeof value.currentIndex === "number" ? value.currentIndex : undefined;
    const current =
      contents.find((content) => content.index === currentIndex) ??
      contents.find((content) => content.type === "text") ??
      contents.at(-1);
    if (typeof current?.fullMarkdown === "string") {
      return current.fullMarkdown;
    }
  }

  return "";
}

function normalizedProvenance(
  provenance: ResearchExportProvenance = {}
): ResearchExportProvenanceBlock {
  const mode = normalizeOpenRigorAiMode(provenance.llmMode) ?? null;
  return {
    repository: nonEmptyString(provenance.repository),
    repositoryId:
      typeof provenance.repositoryId === "number" ||
      typeof provenance.repositoryId === "string"
        ? provenance.repositoryId
        : null,
    branch: nonEmptyString(provenance.branch),
    commitSha: nonEmptyString(provenance.commitSha),
    methodName: nonEmptyString(provenance.methodName),
    methodVersion: nonEmptyString(provenance.methodVersion),
    exportDate:
      nonEmptyString(provenance.exportDate) ?? new Date().toISOString(),
    llmMode: mode,
    privacyNoticeVersion:
      mode === "markdown_only"
        ? null
        : nonEmptyString(provenance.privacyNoticeVersion),
  };
}

function display(value: string | number | null): string {
  return value === null ? "N/A" : String(value);
}

function shortCommitSha(commitSha: string | null): string {
  return commitSha ? commitSha.slice(0, 7) : "N/A";
}

function yamlString(value: string | number | null): string {
  return JSON.stringify(value === null ? "N/A" : value);
}

/** Render Markdown with a complete, machine-readable provenance header. */
export function exportAsMarkdown(
  artifact: ResearchExportArtifact,
  provenance: ResearchExportProvenance = {}
): string {
  const normalized = normalizedProvenance(provenance);
  const frontMatter = [
    "---",
    `repository: ${yamlString(normalized.repository)}`,
    `repository_id: ${yamlString(normalized.repositoryId)}`,
    `branch: ${yamlString(normalized.branch)}`,
    `commit_sha: ${yamlString(normalized.commitSha)}`,
    `method_name: ${yamlString(normalized.methodName)}`,
    `method_version: ${yamlString(normalized.methodVersion)}`,
    `export_date: ${yamlString(normalized.exportDate)}`,
    `llm_mode: ${yamlString(normalized.llmMode)}`,
    `privacy_notice_version: ${yamlString(normalized.privacyNoticeVersion)}`,
    "---",
    "",
  ].join("\n");

  return `${frontMatter}${artifactMarkdown(artifact)}`;
}

/** Build a JSON-safe evidence packet with its disclosure appendix. */
export function exportAsEvidencePacket(
  artifact: ResearchExportArtifact,
  provenance: ResearchExportProvenance = {},
  ledgerEntries: readonly unknown[] = []
): EvidencePacket {
  const normalized = normalizedProvenance(provenance);
  return {
    artifact: artifactMarkdown(artifact),
    provenance: normalized,
    ledgerEntries: [...ledgerEntries],
    disclosureAppendix: generateDisclosureAppendix(normalized),
  };
}

/** Generate the appendix that records the actual consent and repository state. */
export function generateDisclosureAppendix(
  provenance: ResearchExportProvenance = {}
): string {
  const normalized = normalizedProvenance(provenance);
  const mode = normalized.llmMode ? AI_MODE_LABELS[normalized.llmMode] : "N/A";
  const privacyNoticeVersion =
    normalized.llmMode === "markdown_only"
      ? "N/A"
      : display(normalized.privacyNoticeVersion);

  return [
    "## AI-use disclosure",
    "",
    `- Method: ${display(normalized.methodName)} (version ${display(
      normalized.methodVersion
    )})`,
    `- Selected AI mode: ${mode}`,
    `- Privacy-notice version: ${privacyNoticeVersion}`,
    `- Repository commit SHA: ${shortCommitSha(normalized.commitSha)}`,
    "- Evidence/telemetry scope: Artifact content and provenance metadata are stored in the user's private GitHub repository. Workspace telemetry is retained per the OpenRigor data-flow policy.",
    "- Data-flow details: https://openrigor.org#data-flow",
  ].join("\n");
}
