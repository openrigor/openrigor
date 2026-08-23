import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const revision = "sha256:test";

function catalog(title: string) {
  return {
    schemaVersion: 1,
    catalogRevision: revision,
    templates: [
      {
        id: "test-template",
        version: "1.0.0",
        locale: "en",
        title,
        description: "A test template",
        sourcePath: "templates/test.md",
        assistantGuidance: "Help with this template",
        contentHash: "sha256:test",
        templateKind: "markdown",
        initialMarkdown: "# Test\n",
      },
    ],
  };
}

function writeCatalog(path: string, title: string) {
  const raw = JSON.stringify(catalog(title));
  writeFileSync(path, raw);
  return raw;
}

async function loadCatalogModule(path: string) {
  process.env.EVALUCHAT_TEMPLATE_CATALOG_PATH = path;
  vi.resetModules();
  return import("./template-catalog");
}

describe("external template catalog cache", () => {
  let directory: string | undefined;

  afterEach(() => {
    delete process.env.EVALUCHAT_TEMPLATE_CATALOG_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
    vi.restoreAllMocks();
  });

  it("does not reread an unchanged external file", async () => {
    directory = mkdtempSync(join(tmpdir(), "template-catalog-cache-"));
    const path = join(directory, "template-catalog.json");
    writeCatalog(path, "Initial");
    const readFileSpy = vi.mocked(fs.readFileSync);
    readFileSpy.mockClear();
    const catalogModule = await loadCatalogModule(path);

    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Initial"
    );
    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Initial"
    );
    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });

  it("rereads when mtime changes even if the revision is unchanged", async () => {
    directory = mkdtempSync(join(tmpdir(), "template-catalog-cache-"));
    const path = join(directory, "template-catalog.json");
    writeCatalog(path, "Initial");
    utimesSync(path, new Date(1_000), new Date(1_000));
    const readFileSpy = vi.mocked(fs.readFileSync);
    readFileSpy.mockClear();
    const catalogModule = await loadCatalogModule(path);

    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Initial"
    );
    writeCatalog(path, "Updated");
    utimesSync(path, new Date(2_000), new Date(2_000));

    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Updated"
    );
    expect(readFileSpy).toHaveBeenCalledTimes(2);
  });

  it("recovers after a malformed read with the same revision", async () => {
    directory = mkdtempSync(join(tmpdir(), "template-catalog-cache-"));
    const path = join(directory, "template-catalog.json");
    const initialRaw = writeCatalog(path, "Initial");
    utimesSync(path, new Date(1_000), new Date(1_000));
    const readFileSpy = vi.mocked(fs.readFileSync);
    readFileSpy.mockClear();
    const catalogModule = await loadCatalogModule(path);

    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Initial"
    );
    writeFileSync(path, "x".repeat(initialRaw.length));
    utimesSync(path, new Date(2_000), new Date(2_000));
    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Initial"
    );

    const recoveredRaw = writeCatalog(path, "Updated");
    expect(recoveredRaw.length).toBe(initialRaw.length);
    utimesSync(path, new Date(1_000), new Date(1_000));

    expect(catalogModule.getTemplateCatalog().templates[0].title).toBe(
      "Updated"
    );
    expect(readFileSpy).toHaveBeenCalledTimes(3);
  });
});
