import { diff_match_patch as DiffMatchPatch } from "diff-match-patch";

export interface DiffRange {
  start: number;
  end: number;
}

/**
 * Compute character ranges that changed between oldText and newText.
 * Returns ranges relative to newText positions (where highlights should go).
 */
export function computeDiffRanges(
  oldText: string,
  newText: string
): DiffRange[] {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  const ranges: DiffRange[] = [];
  let pos = 0;

  for (const [op, text] of diffs) {
    if (op === 1) {
      // INSERT - highlight this range in the new text
      ranges.push({ start: pos, end: pos + text.length });
      pos += text.length;
    } else if (op === 0) {
      // EQUAL - skip
      pos += text.length;
    }
    // op === -1 (DELETE) - don't advance position in new text
  }

  return ranges;
}

/**
 * Compute the total character delta (positive = net addition, negative = net deletion).
 */
export function computeDiffSize(oldText: string, newText: string): number {
  return newText.length - oldText.length;
}
