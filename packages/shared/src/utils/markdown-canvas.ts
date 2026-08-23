import { TextHighlight } from "../types.js";

/**
 * Normalize markdown strings from BlockNote serialization so comparisons
 * against artifact.fullMarkdown are stable.
 */
export function normalizeCanvasMarkdown(text: string): string {
  return text.replaceAll("\\\\\\n", "\\n").replace(/\r\n/g, "\n");
}

function blockVariants(markdownBlock: string): string[] {
  const normalized = normalizeCanvasMarkdown(markdownBlock);
  const variants = new Set<string>([normalized]);
  variants.add(normalized.trimEnd());
  variants.add(normalized.trim());
  if (!normalized.endsWith("\n")) {
    variants.add(`${normalized}\n`);
  }
  return [...variants];
}

/**
 * Find a markdown block substring inside full document markdown.
 * Returns the exact substring from fullMarkdown when found.
 */
export function findBlockInMarkdown(
  fullMarkdown: string,
  markdownBlock: string
): string | null {
  const full = normalizeCanvasMarkdown(fullMarkdown);
  for (const variant of blockVariants(markdownBlock)) {
    const index = full.indexOf(variant);
    if (index !== -1) {
      return full.slice(index, index + variant.length);
    }
  }
  return null;
}

export type BuildTextHighlightResult =
  | { ok: true; highlight: TextHighlight }
  | { ok: false; error: "block_not_found" };

/**
 * Build a TextHighlight, ensuring markdownBlock is a verbatim substring of fullMarkdown.
 */
export function buildTextHighlight(
  fullMarkdown: string,
  markdownBlock: string,
  selectedText: string
): BuildTextHighlightResult {
  const full = normalizeCanvasMarkdown(fullMarkdown);
  const block = findBlockInMarkdown(full, markdownBlock);
  if (!block) {
    return { ok: false, error: "block_not_found" };
  }
  return {
    ok: true,
    highlight: {
      fullMarkdown: full,
      markdownBlock: block,
      selectedText: normalizeCanvasMarkdown(selectedText),
    },
  };
}

/**
 * Reconcile a highlight captured earlier with the latest artifact markdown.
 */
export function reconcileTextHighlight(
  highlight: TextHighlight,
  currentFullMarkdown: string
): BuildTextHighlightResult {
  return buildTextHighlight(
    currentFullMarkdown,
    highlight.markdownBlock,
    highlight.selectedText
  );
}

/**
 * Reject LLM outputs that look like chat replies rather than full document rewrites.
 * Prevents catastrophic canvas replacement when a model ignores the rewrite prompt.
 */
export function isPlausibleFullArtifactRewrite(
  original: string,
  proposed: string
): boolean {
  const orig = normalizeCanvasMarkdown(original).trim();
  const prop = normalizeCanvasMarkdown(proposed).trim();
  if (!prop) {
    return false;
  }

  const origLen = orig.length;
  const propLen = prop.length;

  if (origLen < 800) {
    return propLen >= Math.max(Math.floor(origLen * 0.4), 40);
  }

  if (propLen < origLen * 0.45) {
    return false;
  }

  const origHeaders = (orig.match(/^#{1,6}\s/gm) || []).length;
  const propHeaders = (prop.match(/^#{1,6}\s/gm) || []).length;
  if (origHeaders >= 3 && propHeaders === 0) {
    return false;
  }
  // A full-document rewrite should preserve the section skeleton. Losing more than
  // half the headings means the model truncated the doc mid-way (prod incident:
  // "remove 4.5" rewrite kept only sections up to 4.4 but passed the old length gate).
  if (
    origHeaders >= 5 &&
    propHeaders < Math.max(2, Math.floor(origHeaders / 2))
  ) {
    return false;
  }

  return true;
}
