import { parseMarkdownFrontmatter } from "../ledger-reference";
import { repositoryLayoutPrefix } from "./layout";
import type {
  MethodHostInitialization,
  PrivateMethodDefinition,
} from "./method-host-types";

export type MethodHostTreeEntry = {
  path: string;
  type: string;
  mode: string;
  sha: string;
};

export const METHOD_HOST_INDEX_CONTENT = "# Methods\n";

export function methodHostRoot(layoutVersion = "1.0"): string {
  return `${repositoryLayoutPrefix(layoutVersion)}methods`;
}

export function methodHostIndexPath(layoutVersion = "1.0"): string {
  return `${methodHostRoot(layoutVersion)}/index.md`;
}

export function inspectMethodHostInitialization(
  tree: readonly MethodHostTreeEntry[],
  layoutVersion = "1.0"
): MethodHostInitialization {
  const methodsRoot = methodHostRoot(layoutVersion);
  const hasMethodsDirectory = tree.some(
    (entry) =>
      (entry.path === methodsRoot && entry.type === "tree") ||
      entry.path.startsWith(`${methodsRoot}/`)
  );
  if (!hasMethodsDirectory) {
    return {
      initialized: false,
      initializationFailureReason: "methods_directory_missing",
    };
  }
  if (
    !tree.some(
      (entry) =>
        entry.path === methodHostIndexPath(layoutVersion) &&
        entry.type === "blob" &&
        (entry.mode === "100644" || entry.mode === "100755")
    )
  ) {
    return {
      initialized: false,
      initializationFailureReason: "methods_index_missing",
    };
  }
  return { initialized: true };
}

function methodDirectory(
  path: string,
  methodsRoot: string
): string | undefined {
  const prefix = `${methodsRoot}/`;
  if (!path.startsWith(prefix)) return undefined;
  const segments = path.slice(prefix.length).split("/");
  if (segments.length !== 2 || segments[1] !== `${segments[0]}.en.md`) {
    return undefined;
  }
  return segments[0] || undefined;
}

export async function discoverPrivateMethodsFromTree(
  tree: readonly MethodHostTreeEntry[],
  readBlob: (sha: string) => Promise<string>,
  layoutVersion = "1.0"
): Promise<{
  initialization: MethodHostInitialization;
  methods: PrivateMethodDefinition[];
}> {
  const initialization = inspectMethodHostInitialization(tree, layoutVersion);
  if (!initialization.initialized) return { initialization, methods: [] };
  const methodsRoot = methodHostRoot(layoutVersion);

  const candidates = tree.flatMap((entry) => {
    if (entry.type !== "blob") return [];
    const directory = methodDirectory(entry.path, methodsRoot);
    if (!directory) return [];
    const evidenceEntry = tree.find(
      (candidate) =>
        candidate.path ===
          `${methodsRoot}/${directory}/evidence-template.en.md` &&
        candidate.type === "blob"
    );
    return evidenceEntry ? [{ directory, entry, evidenceEntry }] : [];
  });

  const methods = await Promise.all(
    candidates.map(async ({ directory, entry, evidenceEntry }) => {
      const [source, evidenceTemplateMarkdown] = await Promise.all([
        readBlob(entry.sha),
        readBlob(evidenceEntry.sha),
      ]);
      let frontmatter: Record<string, unknown>;
      try {
        frontmatter = parseMarkdownFrontmatter(source).frontmatter;
      } catch {
        return undefined;
      }
      if (frontmatter.type !== "Method" || frontmatter.id !== directory) {
        return undefined;
      }
      const profiles = Array.isArray(frontmatter.profiles)
        ? frontmatter.profiles.flatMap((profile) => {
            if (
              !profile ||
              typeof profile !== "object" ||
              Array.isArray(profile)
            ) {
              return [];
            }
            const record = profile as Record<string, unknown>;
            return typeof record.id === "string" &&
              typeof record.label === "string"
              ? [{ id: record.id, label: record.label }]
              : [];
          })
        : [];
      return {
        id: directory,
        ...(typeof frontmatter.title === "string"
          ? { title: frontmatter.title }
          : {}),
        ...(typeof frontmatter.description === "string"
          ? { description: frontmatter.description }
          : {}),
        ...(typeof frontmatter.version === "string"
          ? { version: frontmatter.version }
          : {}),
        ...(typeof frontmatter.run_brief_template === "string"
          ? { runBriefTemplate: frontmatter.run_brief_template }
          : {}),
        profiles,
        evidenceTemplateMarkdown,
      } satisfies PrivateMethodDefinition;
    })
  );

  return {
    initialization,
    methods: methods
      .filter((method): method is PrivateMethodDefinition => Boolean(method))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
