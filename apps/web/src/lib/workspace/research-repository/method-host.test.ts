import { describe, expect, it } from "vitest";
import {
  discoverPrivateMethodsFromTree,
  inspectMethodHostInitialization,
  type MethodHostTreeEntry,
} from "./method-host";

const indexEntry = {
  path: "methods/index.md",
  type: "blob",
  mode: "100644",
  sha: "index",
};
const v2IndexEntry = {
  path: "openrigor/methods/index.md",
  type: "blob",
  mode: "100644",
  sha: "v2-index",
};

function methodEntries(
  id: string,
  options: { evidenceTemplate?: boolean } = {}
): MethodHostTreeEntry[] {
  return [
    {
      path: `methods/${id}/${id}.en.md`,
      type: "blob",
      mode: "100644",
      sha: `method-${id}`,
    },
    ...(options.evidenceTemplate === false
      ? []
      : [
          {
            path: `methods/${id}/evidence-template.en.md`,
            type: "blob",
            mode: "100644",
            sha: `evidence-${id}`,
          },
        ]),
  ];
}

function v2MethodEntries(
  id: string,
  options: { evidenceTemplate?: boolean } = {}
): MethodHostTreeEntry[] {
  return methodEntries(id, options).map((entry) => ({
    ...entry,
    path: `openrigor/${entry.path}`,
  }));
}

function markdown(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n# Method\n`;
}

async function discover(
  tree: MethodHostTreeEntry[],
  blobs: Record<string, string>,
  layoutVersion = "1.0"
) {
  return discoverPrivateMethodsFromTree(
    tree,
    async (sha) => blobs[sha] ?? "",
    layoutVersion
  );
}

describe("private Method-host discovery conformance", () => {
  it("returns a conforming Method", async () => {
    const id = "essay-review";
    await expect(
      discover([indexEntry, ...methodEntries(id)], {
        [`method-${id}`]: markdown(
          `type: Method\nid: ${id}\ntitle: Essay review\ndescription: Review essays`
        ),
      })
    ).resolves.toEqual({
      initialization: { initialized: true },
      methods: [
        {
          id,
          title: "Essay review",
          description: "Review essays",
          profiles: [],
          evidenceTemplateMarkdown: "",
        },
      ],
    });
  });

  it("hides a Method whose type is missing", async () => {
    const id = "missing-type";
    const result = await discover([indexEntry, ...methodEntries(id)], {
      [`method-${id}`]: markdown(`id: ${id}`),
    });
    expect(result.methods).toEqual([]);
  });

  it("hides a Method whose id does not equal its directory", async () => {
    const id = "directory-id";
    const result = await discover([indexEntry, ...methodEntries(id)], {
      [`method-${id}`]: markdown("type: Method\nid: different-id"),
    });
    expect(result.methods).toEqual([]);
  });

  it("hides a Method without an evidence template", async () => {
    const id = "missing-template";
    const result = await discover(
      [indexEntry, ...methodEntries(id, { evidenceTemplate: false })],
      { [`method-${id}`]: markdown(`type: Method\nid: ${id}`) }
    );
    expect(result.methods).toEqual([]);
  });

  it("reports a repository without methods/ as uninitialized", async () => {
    await expect(
      discover(
        [{ path: "README.md", type: "blob", mode: "100644", sha: "readme" }],
        {}
      )
    ).resolves.toEqual({
      initialization: {
        initialized: false,
        initializationFailureReason: "methods_directory_missing",
      },
      methods: [],
    });
  });

  it("reports methods/ without index.md as uninitialized", async () => {
    const id = "no-index";
    await expect(
      discover(methodEntries(id), {
        [`method-${id}`]: markdown(`type: Method\nid: ${id}`),
      })
    ).resolves.toEqual({
      initialization: {
        initialized: false,
        initializationFailureReason: "methods_index_missing",
      },
      methods: [],
    });
  });

  it("discovers Methods below the v2 designated root", async () => {
    const id = "designated-method";
    await expect(
      discover(
        [v2IndexEntry, ...v2MethodEntries(id)],
        {
          [`method-${id}`]: markdown(
            `type: Method\nid: ${id}\ntitle: Designated method`
          ),
        },
        "2.0"
      )
    ).resolves.toEqual({
      initialization: { initialized: true },
      methods: [
        {
          id,
          title: "Designated method",
          profiles: [],
          evidenceTemplateMarkdown: "",
        },
      ],
    });
  });

  it("does not treat a symlink blob at the index path as initialized", () => {
    expect(
      inspectMethodHostInitialization([
        {
          path: "methods/index.md",
          type: "blob",
          mode: "120000",
          sha: "symlink-index",
        },
      ])
    ).toEqual({
      initialized: false,
      initializationFailureReason: "methods_index_missing",
    });
    expect(inspectMethodHostInitialization([indexEntry])).toEqual({
      initialized: true,
    });
  });

  it("does not discover a v1 Methods tree while probing v2", async () => {
    await expect(
      discover([indexEntry, ...methodEntries("outside")], {}, "2.0")
    ).resolves.toEqual({
      initialization: {
        initialized: false,
        initializationFailureReason: "methods_directory_missing",
      },
      methods: [],
    });
  });
});
