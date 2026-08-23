import { diffLines } from "diff";

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

export interface DiffMarkdownResult {
  segments: DiffSegment[];
  truncated?: boolean;
}

const MAX_CHANGED_LINES = 200;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const parts = value.split("\n");
  if (value.endsWith("\n")) {
    return parts.length - 1;
  }

  return parts.length;
}

function truncateToLines(value: string, maxLines: number): string {
  if (maxLines <= 0) {
    return "";
  }

  const parts = value.split("\n");
  const hasTrailingNewline = value.endsWith("\n");
  const lineCount = hasTrailingNewline ? parts.length - 1 : parts.length;
  const kept = parts.slice(0, maxLines).join("\n");

  if (hasTrailingNewline && maxLines >= lineCount) {
    return `${kept}\n`;
  }

  return kept;
}

export function diffMarkdown(prev: string, next: string): DiffMarkdownResult {
  const normalizedPrev = normalizeLineEndings(prev);
  const normalizedNext = normalizeLineEndings(next);

  if (normalizedPrev === normalizedNext) {
    return { segments: [] };
  }

  const rawParts = diffLines(normalizedPrev, normalizedNext);
  const segments: DiffSegment[] = [];
  let changedLineCount = 0;
  let truncated = false;

  for (const part of rawParts) {
    const added = Boolean(part.added);
    const removed = Boolean(part.removed);
    const isChange = added || removed;

    if (isChange) {
      const lineCount = countLines(part.value);

      if (changedLineCount + lineCount > MAX_CHANGED_LINES) {
        const allowedLines = MAX_CHANGED_LINES - changedLineCount;
        if (allowedLines > 0) {
          segments.push({
            added,
            removed,
            value: truncateToLines(part.value, allowedLines),
          });
        }
        truncated = true;
        break;
      }

      changedLineCount += lineCount;
    }

    segments.push({
      added,
      removed,
      value: part.value,
    });
  }

  return truncated ? { segments, truncated: true } : { segments };
}
