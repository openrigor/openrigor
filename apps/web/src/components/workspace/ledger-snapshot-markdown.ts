import type { LedgerConfig, LedgerSnapshotData } from "@opencanvas/shared";
import type {
  EvidenceLedgerContribution,
  EvidenceLedgerManifest,
  LedgerDimensionValue,
} from "@/lib/apparatuses/evidence-ledger";

const RESEARCH_BLOB_URL = "https://github.com/evaluchat/research/blob";

function escapeDetailsSummary(summary: string): string {
  return summary
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function markdownCell(value: string | number | undefined): string {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function markdownValue(value: LedgerDimensionValue | undefined): string {
  if (!value) return "unavailable";
  return value.status === "unknown" ? "unknown" : String(value.value);
}

function manifestFor(snapshot: LedgerSnapshotData): EvidenceLedgerManifest {
  const manifest = snapshot.manifest;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Ledger snapshot has no renderable manifest");
  }
  const candidate = manifest as Partial<EvidenceLedgerManifest>;
  if (!Array.isArray(candidate.contributions)) {
    throw new Error("Ledger snapshot manifest has no contributions");
  }
  return candidate as EvidenceLedgerManifest;
}

function humaniseIdentifier(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filterSummary(config: LedgerConfig): string {
  if (!config.filters.length) return "all declared evidence";
  return [...config.filters]
    .sort((left, right) => compare(left.fieldId, right.fieldId))
    .map((filter) => {
      if (filter.control === "multi-select") {
        return `${humaniseIdentifier(filter.fieldId)}: ${[...filter.values]
          .sort(compare)
          .join(", ")}`;
      }
      return `${humaniseIdentifier(filter.fieldId)}: ${[
        filter.min === undefined ? undefined : `≥ ${filter.min}`,
        filter.max === undefined ? undefined : `≤ ${filter.max}`,
      ]
        .filter(Boolean)
        .join(", ")}`;
    })
    .join("; ");
}

/** The title is intentionally factual: method identity plus declared scope. */
export function ledgerScopeTitle(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  return `${humaniseIdentifier(snapshot.methodId)} — ${filterSummary(config)}`;
}

function sourceUrl(snapshot: LedgerSnapshotData, path: string): string {
  return `${RESEARCH_BLOB_URL}/${encodeURIComponent(snapshot.sourceCommit)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function contributionLabel(contribution: EvidenceLedgerContribution): string {
  return contribution.id || contribution.path;
}

function renderContributionRows(
  contributions: EvidenceLedgerContribution[],
  snapshot: LedgerSnapshotData
): string[] {
  if (!contributions.length) return ["No source records in this view."];
  return [
    "| Source | Hash | Method | Template | Declared values | Bucket |",
    "| --- | --- | --- | --- | --- | --- |",
    ...[...contributions]
      .sort((left, right) => compare(left.path, right.path))
      .map((contribution) => {
        const values = Object.entries(contribution.dimensionValues || {})
          .sort(([left], [right]) => compare(left, right))
          .map(([field, value]) => `${field}: ${markdownValue(value)}`)
          .join("; ");
        return `| [${markdownCell(contributionLabel(contribution))}](${sourceUrl(snapshot, contribution.path)}) | ${markdownCell(contribution.sourceHash)} | ${markdownCell(contribution.methodId)}@${markdownCell(contribution.methodVersion)} | ${markdownCell(contribution.templateVersion)} | ${markdownCell(values || "—")} | ${markdownCell(contribution.bucket)} |`;
      }),
  ];
}

function renderDistributions(
  contributions: EvidenceLedgerContribution[]
): string[] {
  const counts = new Map<string, number>();
  for (const contribution of contributions) {
    for (const [field, value] of Object.entries(
      contribution.dimensionValues || {}
    )) {
      const key = `${field}\u0000${markdownValue(value)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (!counts.size) return ["Insufficient information for a distribution."];
  return [
    "| Field | Recorded value | Count |",
    "| --- | --- | ---: |",
    ...[...counts.entries()]
      .sort(([left], [right]) => compare(left, right))
      .map(([key, count]) => {
        const [field, value] = key.split("\u0000");
        return `| ${markdownCell(field)} | ${markdownCell(value)} | ${count} |`;
      }),
  ];
}

function renderCanonicalManifest(
  contributions: EvidenceLedgerContribution[]
): string[] {
  const lines = ["```yaml", "contributions:"];
  for (const contribution of [...contributions].sort((left, right) =>
    compare(left.path, right.path)
  )) {
    lines.push(`  - path: ${JSON.stringify(contribution.path)}`);
    lines.push(`    hash: ${JSON.stringify(contribution.sourceHash || "")}`);
    lines.push(
      `    method: { id: ${JSON.stringify(contribution.methodId || "")}, version: ${JSON.stringify(contribution.methodVersion || "")} }`
    );
    lines.push(
      `    template_version: ${JSON.stringify(contribution.templateVersion || "")}`
    );
    lines.push(`    bucket: ${JSON.stringify(contribution.bucket)}`);
    lines.push("    dimension_values:");
    const values = Object.entries(contribution.dimensionValues || {}).sort(
      ([left], [right]) => compare(left, right)
    );
    if (!values.length) lines.push("      {}");
    for (const [field, value] of values) {
      const status = value?.status ?? "unavailable";
      const declaredValue = value?.value ?? markdownValue(value);
      lines.push(
        `      ${JSON.stringify(field)}: { status: ${JSON.stringify(status)}, value: ${JSON.stringify(declaredValue)} }`
      );
    }
  }
  lines.push("```");
  return lines;
}

/**
 * Client-safe, canonical ledger body. The server publication module delegates
 * here so the canvas and immutable artifact always share the same renderer.
 */
export function renderLedgerSnapshotBody(
  snapshot: LedgerSnapshotData,
  _config: LedgerConfig
): string {
  const manifest = manifestFor(snapshot);
  const contributions = [...manifest.contributions].sort((left, right) =>
    compare(left.path, right.path)
  );
  const included = contributions.filter(
    (contribution) => contribution.bucket === "Included"
  );
  const gaps = contributions.filter(
    (contribution) => contribution.bucket !== "Included"
  );
  const bucketRows = Object.entries(snapshot.buckets).sort(([left], [right]) =>
    compare(left, right)
  );

  return [
    "# Evidence Ledger",
    "",
    "## Scope",
    "",
    `Canonical predicate: \`${snapshot.predicate}\``,
    "",
    "| Bucket | Count |",
    "| --- | ---: |",
    ...bucketRows.map(([bucket, count]) => `| ${bucket} | ${count} |`),
    "",
    "## Evidence",
    "",
    ...renderContributionRows(included, snapshot),
    "",
    "## Descriptive distributions",
    "",
    ...renderDistributions(included),
    "",
    "## Comparability",
    "",
    `The fixed comparison boundary is ${snapshot.methodId}@${snapshot.methodVersion} with ${snapshot.templateId}@${snapshot.templateVersion}.`,
    "",
    `Included source records: ${included.length}. Declared values retain recorded, unknown, unavailable, not-applicable, and insufficient-information values without inference.`,
    "",
    "## Counterevidence and gaps",
    "",
    "Scope exclusions, missingness, and invalid provenance remain visible below. No interpretation is generated.",
    "",
    ...renderContributionRows(gaps, snapshot),
    "",
    "## Canonical manifest",
    "",
    ...renderCanonicalManifest(contributions),
    "",
  ].join("\n");
}

/**
 * Canvas-only presentation layer. The canonical body above remains plain
 * markdown for hashing and publication; this adds native expand groups only
 * while the snapshot is displayed in the BlockNote canvas.
 */
export function renderLedgerSnapshotCanvasMarkdown(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  const body = renderLedgerSnapshotBody(snapshot, config);
  const gaps = manifestFor(snapshot).contributions.filter(
    (contribution) => contribution.bucket !== "Included"
  ).length;
  const [title, ...sections] = body.split(/^## /m);

  return [
    title.trimEnd(),
    ...sections.map((section) => {
      const [heading, ...content] = section.split("\n");
      const summary =
        heading === "Counterevidence and gaps" && gaps > 0
          ? `${heading} (${gaps})`
          : heading;
      const open = heading === "Scope" ? " open" : "";
      return [
        `<details${open}>`,
        `<summary>${escapeDetailsSummary(summary)}</summary>`,
        "",
        content.join("\n").trim(),
        "</details>",
      ].join("\n");
    }),
    "",
  ].join("\n\n");
}
