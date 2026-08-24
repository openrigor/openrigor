import { describe, expect, it } from "vitest";
import {
  discoverPrivateMethodsFromTree,
  type MethodHostTreeEntry,
} from "./method-host";

const indexEntry = {
  path: "methods/index.md",
  type: "blob",
  sha: "index",
};

function methodEntries(
  id: string,
  options: { evidenceTemplate?: boolean } = {}
): MethodHostTreeEntry[] {
  return [
    {
      path: `methods/${id}/${id}.en.md`,
      type: "blob",
      sha: `method-${id}`,
    },
    ...(options.evidenceTemplate === false
      ? []
      : [
          {
            path: `methods/${id}/evidence-template.en.md`,
            type: "blob",
            sha: `evidence-${id}`,
          },
        ]),
  ];
}

function markdown(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n# Method\n`;
}

async function discover(
  tree: MethodHostTreeEntry[],
  blobs: Record<string, string>
) {
  return discoverPrivateMethodsFromTree(tree, async (sha) => blobs[sha] ?? "");
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
      discover([{ path: "README.md", type: "blob", sha: "readme" }], {})
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
});
