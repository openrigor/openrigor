import { parseMarkdownFrontmatter } from "./ledger-reference";
import { fetchResearchArtifact } from "./ledger-picker";

export type FindingValidationIssue = {
  fieldId: string;
  message: string;
};

export class FindingValidationError extends Error {
  constructor(public readonly issues: FindingValidationIssue[]) {
    super("Finding validation failed");
    this.name = "FindingValidationError";
  }
}

export type ResearchArtifactFetcher = (
  path: string
) => Promise<{ path: string; source: string } | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identity(value: unknown): { id: string; version: string } | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || typeof value.version !== "string") {
    return undefined;
  }
  return { id: value.id, version: value.version };
}

export function researchQuestionPath(resource: string): string | undefined {
  const trimmed = resource.trim();
  const github = trimmed.match(
    /^https:\/\/github\.com\/evaluchat\/research\/(?:blob|tree)\/[^/]+\/(.+)$/i
  );
  const raw = github
    ? github[1]
    : trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? undefined
      : trimmed;
  if (!raw) return undefined;
  return raw.replace(/^\/+/, "").replace(/@[^@/]+$/, "");
}

function questionResources(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (isRecord(entry) && typeof entry.resource === "string") {
      return entry.resource;
    }
    return "";
  });
}

type LedgerEntry = {
  id?: string;
  path: string;
  method: { id: string; version: string };
  evidence_template: { id: string; version: string };
  source_commit: string;
  input_fingerprint: string;
};

function ledgerEntries(value: unknown): LedgerEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      return {
        path: "",
        method: { id: "", version: "" },
        evidence_template: { id: "", version: "" },
        source_commit: "",
        input_fingerprint: "",
      };
    }
    return {
      ...(typeof entry.id === "string" ? { id: entry.id } : {}),
      path: entry.path.replace(/^\/+/, ""),
      method: identity(entry.method) || { id: "", version: "" },
      evidence_template: identity(entry.evidence_template) || {
        id: "",
        version: "",
      },
      source_commit:
        typeof entry.source_commit === "string" ? entry.source_commit : "",
      input_fingerprint:
        typeof entry.input_fingerprint === "string"
          ? entry.input_fingerprint
          : "",
    };
  });
}

function frontmatterType(source: string): unknown {
  return parseMarkdownFrontmatter(source).frontmatter.type;
}

export async function validateFindingSubmission(
  markdown: string,
  options: { fetchArtifact?: ResearchArtifactFetcher } = {}
): Promise<{ ok: true }> {
  const fetchArtifact =
    options.fetchArtifact ??
    (async (path: string) => {
      const source = await fetchResearchArtifact(path);
      return source === null ? null : { path, source };
    });
  const { frontmatter } = parseMarkdownFrontmatter(markdown);
  const issues: FindingValidationIssue[] = [];
  if (frontmatter.type !== "Finding") {
    issues.push({ fieldId: "type", message: 'type must be "Finding".' });
  }
  const questions = questionResources(frontmatter.research_questions);
  const ledgers = ledgerEntries(frontmatter.evidence_ledgers);

  if (!questions || questions.length === 0) {
    issues.push({
      fieldId: "research_questions",
      message: "research_questions must be a non-empty list.",
    });
  }
  if (!ledgers || ledgers.length === 0) {
    issues.push({
      fieldId: "evidence_ledgers",
      message: "evidence_ledgers must be a non-empty list.",
    });
  }

  if (ledgers) {
    for (const entry of ledgers) {
      if (!entry.path) {
        issues.push({
          fieldId: "evidence_ledgers",
          message: "Every evidence ledger needs a resolvable path.",
        });
        continue;
      }
      const artifact = await fetchArtifact(entry.path);
      if (!artifact) {
        issues.push({
          fieldId: "evidence_ledgers",
          message: `Ledger path is unresolvable on research main: ${entry.path}`,
        });
        continue;
      }
      const published = parseMarkdownFrontmatter(artifact.source).frontmatter;
      if (published.type !== "Evidence Ledger") {
        issues.push({
          fieldId: "evidence_ledgers",
          message: `Path ${entry.path} is not a merged Evidence Ledger artifact.`,
        });
        continue;
      }
      const method = identity(published.method);
      const template = identity(published.evidence_template);
      if (
        !method ||
        !template ||
        method.id !== entry.method.id ||
        method.version !== entry.method.version ||
        template.id !== entry.evidence_template.id ||
        template.version !== entry.evidence_template.version
      ) {
        issues.push({
          fieldId: "evidence_ledgers",
          message: `Ledger ${entry.path} method or evidence_template identity does not match the published artifact.`,
        });
      }
      if (
        published.source_commit !== entry.source_commit ||
        published.input_fingerprint !== entry.input_fingerprint
      ) {
        issues.push({
          fieldId: "evidence_ledgers",
          message: `Ledger ${entry.path} source_commit or input_fingerprint does not match the published artifact.`,
        });
      }
    }
  }

  if (questions) {
    for (const resource of questions) {
      const path = researchQuestionPath(resource);
      if (!path) {
        issues.push({
          fieldId: "research_questions",
          message: `Research-question resource is unresolvable: ${resource || "(empty)"}`,
        });
        continue;
      }
      const artifact = await fetchArtifact(path);
      if (!artifact) {
        issues.push({
          fieldId: "research_questions",
          message: `Research-question resource is unresolvable on research main: ${resource}`,
        });
        continue;
      }
      if (frontmatterType(artifact.source) !== "Research Question") {
        issues.push({
          fieldId: "research_questions",
          message: `Resource ${resource} is not a published Research Question artifact.`,
        });
      }
    }
  }

  if (issues.length) throw new FindingValidationError(issues);
  return { ok: true };
}
