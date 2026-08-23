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
  loadWindowState,
  saveWindowState,
  validateWindowState,
  type WindowState,
} from "./window-state";

const defaults: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false,
};

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "window-state-"));
  return tempDir;
}

describe("validateWindowState", () => {
  it("accepts a valid full object", () => {
    expect(
      validateWindowState({
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        isMaximized: true,
      })
    ).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      isMaximized: true,
    });
  });

  it("defaults isMaximized to false when absent", () => {
    expect(
      validateWindowState({
        width: 800,
        height: 600,
      })
    ).toEqual({
      width: 800,
      height: 600,
      isMaximized: false,
    });
  });

  it("returns null for garbage input", () => {
    expect(validateWindowState(null)).toBeNull();
    expect(validateWindowState(42)).toBeNull();
    expect(validateWindowState("str")).toBeNull();
  });
});

describe("loadWindowState", () => {
  it("returns defaults when the file is missing", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "missing.json");
    expect(loadWindowState(filePath, defaults)).toEqual(defaults);
  });

  it("returns defaults for corrupt JSON", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "corrupt.json");
    writeFileSync(filePath, "not json{", "utf8");
    expect(loadWindowState(filePath, defaults)).toEqual(defaults);
  });

  it("returns defaults for invalid shapes", () => {
    const dir = makeTempDir();
    const cases: unknown[] = [
      { width: 0, height: 800 },
      { width: "abc", height: 800 },
      { width: 800 },
      { width: 800, height: 600, x: "nan" },
    ];

    for (const [index, raw] of cases.entries()) {
      const filePath = join(dir, `invalid-${index}.json`);
      writeFileSync(filePath, JSON.stringify(raw), "utf8");
      expect(loadWindowState(filePath, defaults)).toEqual(defaults);
    }
  });

  it("round-trips save then load including x/y/isMaximized", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "window-state.json");
    const state: WindowState = {
      x: 42,
      y: 84,
      width: 1024,
      height: 768,
      isMaximized: true,
    };

    saveWindowState(filePath, state);
    expect(loadWindowState(filePath, defaults)).toEqual(state);
  });

  it("leaves no .tmp file after atomic save", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "window-state.json");

    saveWindowState(filePath, {
      width: 900,
      height: 700,
      isMaximized: false,
    });

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
    expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});
