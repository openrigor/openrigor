import yaml from "js-yaml";

const RESEARCH_BLOB = "https://github.com/evaluchat/research/blob/main";

type Frontmatter = Record<string, unknown>;

export type MergedLedger = {
  id: string;
  title: string;
  path: string;
  method: { id: string; version: string };
  evidence_template: { id: string; version: string };
  source_commit: string;
  input_fingerprint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMarkdownFrontmatter(source: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: source };
  const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  return {
    frontmatter: isRecord(parsed) ? parsed : {},
    body: source.slice(match[0].length),
  };
}

function identity(value: unknown): { id: string; version: string } | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || typeof value.version !== "string") {
    return undefined;
  }
  return { id: value.id, version: value.version };
}

export function citationFromFrontmatter(
  path: string,
  frontmatter: Frontmatter
): MergedLedger | undefined {
  if (
    frontmatter.type !== "Evidence Ledger" ||
    frontmatter.status !== "stable"
  ) {
    return undefined;
  }
  if (
    typeof frontmatter.id !== "string" ||
    typeof frontmatter.title !== "string"
  ) {
    return undefined;
  }
  const method = identity(frontmatter.method);
  const evidenceTemplate = identity(frontmatter.evidence_template);
  if (
    !method ||
    !evidenceTemplate ||
    typeof frontmatter.source_commit !== "string" ||
    typeof frontmatter.input_fingerprint !== "string"
  ) {
    return undefined;
  }
  return {
    id: frontmatter.id,
    title: frontmatter.title,
    path,
    method,
    evidence_template: evidenceTemplate,
    source_commit: frontmatter.source_commit,
    input_fingerprint: frontmatter.input_fingerprint,
  };
}

function ledgerRefMarker(id: string): string {
  return `<!-- ledger-ref:${id} -->`;
}

export function publishedLedgerUrl(path: string): string {
  return `${RESEARCH_BLOB}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function renderLedgerReferenceCard(ledger: MergedLedger): string {
  return [
    ledgerRefMarker(ledger.id),
    `> **${ledger.title}** (\`${ledger.id}\`) — read-only published ledger reference`,
    ">",
    `> - Method: \`${ledger.method.id}@${ledger.method.version}\``,
    `> - Evidence template: \`${ledger.evidence_template.id}@${ledger.evidence_template.version}\``,
    `> - Input fingerprint: \`${ledger.input_fingerprint}\``,
    `> - Source commit: \`${ledger.source_commit}\``,
    `> - [Published artifact](${publishedLedgerUrl(ledger.path)})`,
    `<!-- /ledger-ref:${ledger.id} -->`,
  ].join("\n");
}

function dumpFrontmatter(frontmatter: Frontmatter): string {
  return yaml
    .dump(frontmatter, {
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
    })
    .trimEnd();
}

function citationFields(ledger: MergedLedger) {
  return {
    id: ledger.id,
    path: ledger.path,
    method: { id: ledger.method.id, version: ledger.method.version },
    evidence_template: {
      id: ledger.evidence_template.id,
      version: ledger.evidence_template.version,
    },
    source_commit: ledger.source_commit,
    input_fingerprint: ledger.input_fingerprint,
  };
}

function insertCard(body: string, card: string, id: string): string {
  if (body.includes(ledgerRefMarker(id))) return body;
  if (/^## Evidence ledgers\s*$/m.test(body)) {
    return body.replace(
      /^## Evidence ledgers\s*$/m,
      `## Evidence ledgers\n\n${card}`
    );
  }
  return `${body.replace(/\s*$/, "")}\n\n## Evidence ledgers\n\n${card}\n`;
}

/** Insert a read-only ledger card + evidence_ledgers entry. Never touches research_questions. */
export function insertLedgerReference(
  markdown: string,
  ledger: MergedLedger
): string {
  const { frontmatter, body } = parseMarkdownFrontmatter(markdown);
  const raw = frontmatter.evidence_ledgers;
  const isList = Array.isArray(raw);
  const alreadyCited =
    isList && raw.some((entry) => isRecord(entry) && entry.id === ledger.id);
  const alreadyCard = body.includes(ledgerRefMarker(ledger.id));
  if (alreadyCited && alreadyCard) return markdown;

  if (isList && !alreadyCited) {
    frontmatter.evidence_ledgers = [...raw, citationFields(ledger)];
  }
  const nextBody = insertCard(
    body,
    renderLedgerReferenceCard(ledger),
    ledger.id
  );
  return `---\n${dumpFrontmatter(frontmatter)}\n---\n${
    nextBody.startsWith("\n") ? nextBody : `\n${nextBody}`
  }`;
}
