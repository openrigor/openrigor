import { githubRequest, RESEARCH_REPOSITORY } from "./evidence-github";
import {
  citationFromFrontmatter,
  parseMarkdownFrontmatter,
  type MergedLedger,
} from "./ledger-reference";

export {
  insertLedgerReference,
  parseMarkdownFrontmatter,
  type MergedLedger,
} from "./ledger-reference";

const CONTENTS_PREFIX = `/repos/${RESEARCH_REPOSITORY}/contents`;

type GithubContent = {
  type: "file" | "dir";
  path: string;
  name: string;
  sha?: string;
  size?: number;
  content?: string;
  encoding?: string;
};

export class LedgerPickerUnavailableError extends Error {
  constructor(message = "Ledger picker unavailable") {
    super(message);
    this.name = "LedgerPickerUnavailableError";
  }
}

function isGithubNotFound(error: unknown): boolean {
  return error instanceof Error && /GitHub API 404/.test(error.message);
}

async function githubContent(
  path: string
): Promise<GithubContent | GithubContent[]> {
  return (await githubRequest(
    `${CONTENTS_PREFIX}/${path.split("/").map(encodeURIComponent).join("/")}?ref=main`,
    { method: "GET" }
  )) as GithubContent | GithubContent[];
}

function decodeFile(entry: GithubContent): string | undefined {
  if (entry.encoding === "base64" && typeof entry.content === "string") {
    return Buffer.from(entry.content.replace(/\n/g, ""), "base64").toString(
      "utf8"
    );
  }
  return undefined;
}

export async function fetchResearchArtifact(
  path: string
): Promise<string | null> {
  const normalised = path.replace(/^\/+/, "");
  try {
    const entry = await githubContent(normalised);
    if (Array.isArray(entry) || entry.type !== "file") return null;
    const source = decodeFile(entry);
    if (source !== undefined) return source;
    const loaded = await githubContent(entry.path);
    if (!Array.isArray(loaded) && loaded.encoding === "base64") {
      return decodeFile(loaded) ?? null;
    }
    return null;
  } catch (error) {
    if (isGithubNotFound(error)) return null;
    throw error;
  }
}

async function listMethodLedgers(methodId: string): Promise<MergedLedger[]> {
  let listed: GithubContent | GithubContent[];
  try {
    listed = await githubContent(`methods/${methodId}/evidence/ledgers`);
  } catch (error) {
    if (isGithubNotFound(error)) return [];
    throw error;
  }
  const files = (Array.isArray(listed) ? listed : [listed]).filter(
    (entry) => entry.type === "file" && entry.name.endsWith(".en.md")
  );
  const ledgers: MergedLedger[] = [];
  for (const file of files) {
    const source = await fetchResearchArtifact(file.path);
    if (source === null) continue;
    const { frontmatter } = parseMarkdownFrontmatter(source);
    const citation = citationFromFrontmatter(file.path, frontmatter);
    if (citation) ledgers.push(citation);
  }
  return ledgers;
}

/** Lists merged Evidence Ledger artifacts on evaluchat/research main. */
export async function listMergedLedgers(): Promise<MergedLedger[]> {
  try {
    const entries = await githubContent("methods");
    if (!Array.isArray(entries)) return [];
    const nested = await Promise.all(
      entries
        .filter((entry) => entry.type === "dir")
        .map((entry) => listMethodLedgers(entry.name))
    );
    return nested.flat().sort((left, right) => left.id.localeCompare(right.id));
  } catch (error) {
    if (error instanceof LedgerPickerUnavailableError) throw error;
    throw new LedgerPickerUnavailableError();
  }
}
