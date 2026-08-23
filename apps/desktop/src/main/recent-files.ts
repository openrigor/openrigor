import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export const MAX_RECENT_FILES = 10;

/**
 * Validates a parsed recent-files JSON value.
 * Accepts a bare string array or `{ paths: string[] }`.
 * Returns null when the shape is invalid.
 */
export function validateRecentPaths(raw: unknown): string[] | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }

  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    "paths" in raw &&
    Array.isArray((raw as { paths: unknown }).paths)
  ) {
    list = (raw as { paths: unknown[] }).paths;
  } else {
    return null;
  }

  const paths: string[] = [];
  for (const item of list as unknown[]) {
    if (typeof item !== "string") {
      return null;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return null;
    }
    paths.push(trimmed);
  }

  return paths;
}

/** Deduplicate (first occurrence wins) and cap list length. */
export function trimRecentPaths(
  paths: string[],
  max: number = MAX_RECENT_FILES
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of paths) {
    if (typeof path !== "string") {
      continue;
    }
    const trimmed = path.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) {
      break;
    }
  }

  return result;
}

/** Prepend a path (most recent first), dedupe, and trim to max. */
export function addRecentPath(
  paths: string[],
  newPath: string,
  max: number = MAX_RECENT_FILES
): string[] {
  const trimmed = newPath.trim();
  if (trimmed.length === 0) {
    return trimRecentPaths(paths, max);
  }
  return trimRecentPaths([trimmed, ...paths.filter((p) => p !== trimmed)], max);
}

export function loadRecentPaths(filePath: string): string[] {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const validated = validateRecentPaths(parsed);
    if (validated === null) {
      return [];
    }
    return trimRecentPaths(validated);
  } catch {
    return [];
  }
}

export function saveRecentPaths(filePath: string, paths: string[]): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const trimmed = trimRecentPaths(paths);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(
      tmpPath,
      `${JSON.stringify({ paths: trimmed }, null, 2)}\n`,
      "utf8"
    );
    renameSync(tmpPath, filePath);
  } catch {
    // Silently swallow fs errors
  }
}
