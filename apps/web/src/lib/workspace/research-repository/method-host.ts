import { parseMarkdownFrontmatter } from "../ledger-reference";
import type {
  MethodHostInitialization,
  PrivateMethodDefinition,
} from "./method-host-types";

export type MethodHostTreeEntry = {
  path: string;
  type: string;
  sha: string;
};

export function inspectMethodHostInitialization(
  tree: readonly MethodHostTreeEntry[]
): MethodHostInitialization {
  const hasMethodsDirectory = tree.some(
    (entry) =>
      (entry.path === "methods" && entry.type === "tree") ||
      entry.path.startsWith("methods/")
  );
  if (!hasMethodsDirectory) {
    return {
      initialized: false,
      initializationFailureReason: "methods_directory_missing",
    };
  }
  if (
    !tree.some(
      (entry) => entry.path === "methods/index.md" && entry.type === "blob"
    )
  ) {
    return {
      initialized: false,
      initializationFailureReason: "methods_index_missing",
    };
  }
  return { initialized: true };
}

function methodDirectory(path: string): string | undefined {
  const segments = path.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== "methods" ||
    segments[2] !== `${segments[1]}.en.md`
  ) {
    return undefined;
  }
  return segments[1] || undefined;
}

export async function discoverPrivateMethodsFromTree(
  tree: readonly MethodHostTreeEntry[],
  readBlob: (sha: string) => Promise<string>
): Promise<{
  initialization: MethodHostInitialization;
  methods: PrivateMethodDefinition[];
}> {
  const initialization = inspectMethodHostInitialization(tree);
  if (!initialization.initialized) return { initialization, methods: [] };

  const candidates = tree.flatMap((entry) => {
    if (entry.type !== "blob") return [];
    const directory = methodDirectory(entry.path);
    if (!directory) return [];
    const evidenceEntry = tree.find(
      (candidate) =>
        candidate.path === `methods/${directory}/evidence-template.en.md` &&
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
