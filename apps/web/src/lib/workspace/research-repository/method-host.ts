import { parseMarkdownFrontmatter } from "../ledger-reference";
import type {
  MethodHostInitialization,
  PrivateMethodSummary,
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
  methods: PrivateMethodSummary[];
}> {
  const initialization = inspectMethodHostInitialization(tree);
  if (!initialization.initialized) return { initialization, methods: [] };

  const blobPaths = new Set(
    tree.filter((entry) => entry.type === "blob").map((entry) => entry.path)
  );
  const candidates = tree.flatMap((entry) => {
    if (entry.type !== "blob") return [];
    const directory = methodDirectory(entry.path);
    if (!directory) return [];
    return blobPaths.has(`methods/${directory}/evidence-template.en.md`)
      ? [{ directory, entry }]
      : [];
  });

  const methods = await Promise.all(
    candidates.map(async ({ directory, entry }) => {
      const source = await readBlob(entry.sha);
      let frontmatter: Record<string, unknown>;
      try {
        frontmatter = parseMarkdownFrontmatter(source).frontmatter;
      } catch {
        return undefined;
      }
      if (frontmatter.type !== "Method" || frontmatter.id !== directory) {
        return undefined;
      }
      return {
        id: directory,
        ...(typeof frontmatter.title === "string"
          ? { title: frontmatter.title }
          : {}),
        ...(typeof frontmatter.description === "string"
          ? { description: frontmatter.description }
          : {}),
      } satisfies PrivateMethodSummary;
    })
  );

  return {
    initialization,
    methods: methods
      .filter((method): method is PrivateMethodSummary => Boolean(method))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
