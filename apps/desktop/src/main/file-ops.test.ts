import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownPath, writeMarkdownPath } from "./file-ops";

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

const SAMPLE_MD = [
  "# MVP round-trip",
  "",
  "Inline math $E = mc^2$ and display:",
  "",
  "$$",
  "\\tau = w_t T + w_c C",
  "$$",
  "",
  "```mermaid",
  "graph TD",
  "  A-->B",
  "```",
  "",
  "Done.",
].join("\n");

describe("file-ops markdown round-trip", () => {
  it("write then read returns identical Mermaid + LaTeX content", () => {
    tempDir = mkdtempSync(join(tmpdir(), "file-ops-"));
    const filePath = join(tempDir, "sample.md");

    const saved = writeMarkdownPath(filePath, SAMPLE_MD);
    expect(saved).toEqual({ path: filePath });

    const opened = readMarkdownPath(filePath);
    expect(opened).not.toBeNull();
    expect(opened!.content).toBe(SAMPLE_MD);
    expect(opened!.path).toBe(filePath);
  });
});
