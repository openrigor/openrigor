import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_RECENT_FILES,
  addRecentPath,
  loadRecentPaths,
  saveRecentPaths,
  trimRecentPaths,
  validateRecentPaths,
} from "./recent-files";

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "recent-files-"));
  return tempDir;
}

describe("validateRecentPaths", () => {
  it("accepts a bare string array", () => {
    expect(validateRecentPaths(["/a.md", "/b.md"])).toEqual(["/a.md", "/b.md"]);
  });

  it("accepts { paths: string[] }", () => {
    expect(validateRecentPaths({ paths: ["/x.md"] })).toEqual(["/x.md"]);
  });

  it("returns null for garbage shapes", () => {
    expect(validateRecentPaths(null)).toBeNull();
    expect(validateRecentPaths(42)).toBeNull();
    expect(validateRecentPaths("str")).toBeNull();
    expect(validateRecentPaths({ paths: [1, 2] })).toBeNull();
    expect(validateRecentPaths({ paths: [""] })).toBeNull();
    expect(validateRecentPaths(["ok", 3])).toBeNull();
  });
});

describe("trimRecentPaths", () => {
  it("dedupes preserving first occurrence and caps length", () => {
    const paths = [
      "/a.md",
      "/b.md",
      "/a.md",
      "/c.md",
      "  ",
      "/d.md",
      "/e.md",
      "/f.md",
      "/g.md",
      "/h.md",
      "/i.md",
      "/j.md",
      "/k.md",
    ];
    const trimmed = trimRecentPaths(paths, 10);
    expect(trimmed).toEqual([
      "/a.md",
      "/b.md",
      "/c.md",
      "/d.md",
      "/e.md",
      "/f.md",
      "/g.md",
      "/h.md",
      "/i.md",
      "/j.md",
    ]);
    expect(trimmed).toHaveLength(MAX_RECENT_FILES);
  });
});

describe("addRecentPath", () => {
  it("prepends and moves existing path to front", () => {
    expect(addRecentPath(["/a.md", "/b.md"], "/b.md")).toEqual([
      "/b.md",
      "/a.md",
    ]);
  });

  it("trims to max after prepend", () => {
    const existing = Array.from(
      { length: MAX_RECENT_FILES },
      (_, i) => `/f${i}.md`
    );
    const next = addRecentPath(existing, "/new.md");
    expect(next[0]).toBe("/new.md");
    expect(next).toHaveLength(MAX_RECENT_FILES);
    expect(next).not.toContain(`/f${MAX_RECENT_FILES - 1}.md`);
  });
});

describe("loadRecentPaths / saveRecentPaths", () => {
  it("returns [] when file is missing", () => {
    const dir = makeTempDir();
    expect(loadRecentPaths(join(dir, "missing.json"))).toEqual([]);
  });

  it("returns [] for corrupt JSON", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "corrupt.json");
    writeFileSync(filePath, "not json{", "utf8");
    expect(loadRecentPaths(filePath)).toEqual([]);
  });

  it("round-trips and leaves no .tmp", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "recent-files.json");
    saveRecentPaths(filePath, ["/one.md", "/two.md", "/one.md"]);
    expect(loadRecentPaths(filePath)).toEqual(["/one.md", "/two.md"]);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
    expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});
