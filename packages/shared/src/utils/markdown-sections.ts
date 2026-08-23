/**
 * Markdown heading section index for hint-based locate (not byte-exact copy).
 * Offsets are into the same string the caller passes — normalize upstream if needed.
 * Never touches BlockNote trees; validation fails closed (no wrong-section writes).
 */

export type MarkdownSection = {
  headingText: string;
  level: number;
  /** Inclusive start offset of the heading line in fullMarkdown. */
  start: number;
  /** Exclusive end offset (start of next same-or-higher heading, or EOF). */
  end: number;
};

export type ResolveSectionHintOk = {
  ok: true;
  section: MarkdownSection;
};

export type ResolveSectionHintFail = {
  ok: false;
  reason: "no_match" | "ambiguous";
  candidates?: MarkdownSection[];
};

export type ResolveSectionHintResult =
  | ResolveSectionHintOk
  | ResolveSectionHintFail;

export type SpliceResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

/** Simple Levenshtein distance (case-sensitive on already-normalized strings). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function normalizeHint(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Flat list of ATX heading sections. `end` is the start of the next heading
 * at the same or higher level (fewer `#`), or EOF.
 */
export function buildSectionIndex(fullMarkdown: string): MarkdownSection[] {
  const headings: Array<{
    headingText: string;
    level: number;
    start: number;
  }> = [];

  HEADING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING_RE.exec(fullMarkdown)) !== null) {
    headings.push({
      headingText: match[2].trim(),
      level: match[1].length,
      start: match.index,
    });
  }

  return headings.map((h, i) => {
    let end = fullMarkdown.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        end = headings[j].start;
        break;
      }
    }
    return {
      headingText: h.headingText,
      level: h.level,
      start: h.start,
      end,
    };
  });
}

function firstWordsSnippet(
  section: MarkdownSection,
  fullMarkdown: string
): string {
  const body = fullMarkdown.slice(section.start, section.end);
  const afterHeading = body.replace(/^#{1,6}\s+[^\n]*\n?/, "");
  const words = afterHeading.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  return words.join(" ");
}

function scoreHint(
  section: MarkdownSection,
  hintNorm: string,
  fullMarkdown: string
): number {
  const headingNorm = normalizeHint(section.headingText);
  if (headingNorm === hintNorm) return 0;

  const headingDist = levenshtein(headingNorm, hintNorm);

  const snippet = firstWordsSnippet(section, fullMarkdown);
  const combined = normalizeHint(`${section.headingText} ${snippet}`);
  const combinedDist = levenshtein(combined, hintNorm);

  // Prefer heading-only distance when the hint looks like a heading;
  // otherwise allow heading+snippet.
  return Math.min(headingDist, combinedDist);
}

/**
 * Resolve a short hint to one section. Exact heading match first; else fuzzy.
 * Duplicate exact headings or near-tied fuzzy scores → ambiguous (fail closed).
 */
export function resolveSectionHint(
  index: MarkdownSection[],
  hint: string,
  fullMarkdown = ""
): ResolveSectionHintResult {
  const hintNorm = normalizeHint(hint);
  if (!hintNorm || index.length === 0) {
    return { ok: false, reason: "no_match" };
  }

  const exact = index.filter((s) => normalizeHint(s.headingText) === hintNorm);
  if (exact.length === 1) {
    return { ok: true, section: exact[0] };
  }
  if (exact.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: exact };
  }

  // Also treat "heading + first words" exact containment as exact-ish:
  // if hint starts with a unique heading text, prefer that heading.
  const headingPrefixHits = index.filter((s) => {
    const h = normalizeHint(s.headingText);
    return hintNorm === h || hintNorm.startsWith(`${h} `);
  });
  if (headingPrefixHits.length === 1) {
    return { ok: true, section: headingPrefixHits[0] };
  }
  if (headingPrefixHits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: headingPrefixHits,
    };
  }

  const scored = index
    .map((section) => ({
      section,
      dist: scoreHint(section, hintNorm, fullMarkdown),
    }))
    .sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  const maxAcceptable = Math.max(3, Math.floor(hintNorm.length * 0.35));
  if (!best || best.dist > maxAcceptable) {
    return {
      ok: false,
      reason: "no_match",
      candidates: scored.slice(0, 3).map((s) => s.section),
    };
  }

  const second = scored[1];
  if (second && second.dist === best.dist) {
    const tied = scored
      .filter((s) => s.dist === best.dist)
      .map((s) => s.section);
    return { ok: false, reason: "ambiguous", candidates: tied };
  }

  // Near-tie: within 1 edit and both under threshold → ambiguous
  if (second && second.dist <= best.dist + 1 && second.dist <= maxAcceptable) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: [best.section, second.section],
    };
  }

  return { ok: true, section: best.section };
}

/**
 * Validate that `span` still describes a heading section in `fullMarkdown`
 * (offsets in range; text at start is an ATX heading matching headingText).
 */
export function validateSectionSpan(
  fullMarkdown: string,
  span: MarkdownSection
): { ok: true } | { ok: false; error: string } {
  if (
    span.start < 0 ||
    span.end < span.start ||
    span.end > fullMarkdown.length
  ) {
    return { ok: false, error: "Section offsets are out of range." };
  }

  const slice = fullMarkdown.slice(span.start, span.end);
  const headingMatch = slice.match(/^(#{1,6})\s+(.+?)(?:\n|$)/);
  if (!headingMatch) {
    return {
      ok: false,
      error: "Section start no longer points at a markdown heading.",
    };
  }
  if (headingMatch[1].length !== span.level) {
    return { ok: false, error: "Section heading level changed." };
  }
  if (normalizeHint(headingMatch[2]) !== normalizeHint(span.headingText)) {
    return {
      ok: false,
      error: "Section heading text no longer matches the resolved section.",
    };
  }
  return { ok: true };
}

/**
 * Force the replacement's leading heading to `level`. Models sometimes return a
 * section with a different depth, which silently reparents the outline.
 */
export function alignHeadingLevel(replacement: string, level: number): string {
  return replacement.replace(
    /^(\s*)#{1,6}(\s+)/,
    (_m, lead: string, gap: string) => `${lead}${"#".repeat(level)}${gap}`
  );
}

/**
 * Replace `[start, end)` with `replacement` after validating the span.
 */
export function spliceSection(
  fullMarkdown: string,
  span: MarkdownSection,
  replacement: string
): SpliceResult {
  const valid = validateSectionSpan(fullMarkdown, span);
  if (!valid.ok) {
    return valid;
  }

  // Keep the newline run that closed the original span, so the following
  // heading keeps the document's block spacing instead of collapsing onto
  // the replacement's last line.
  const original = fullMarkdown.slice(span.start, span.end);
  const trailing = original.match(/\n*$/)?.[0] ?? "";
  const next =
    alignHeadingLevel(replacement, span.level).replace(/\n+$/, "") +
    (trailing || "\n");

  return {
    ok: true,
    markdown:
      fullMarkdown.slice(0, span.start) + next + fullMarkdown.slice(span.end),
  };
}

/**
 * Insert `newContent` immediately after the resolved section's `end`.
 * Used for "add section 4.6 after 4.5".
 */
export function insertAfterSection(
  fullMarkdown: string,
  afterSpan: MarkdownSection,
  newContent: string
): SpliceResult {
  const valid = validateSectionSpan(fullMarkdown, afterSpan);
  if (!valid.ok) {
    return valid;
  }

  const insert = newContent.trim();
  if (!insert) {
    return { ok: false, error: "Nothing to insert." };
  }

  const before = fullMarkdown.slice(0, afterSpan.end);
  const after = fullMarkdown.slice(afterSpan.end);

  // Reuse the newline run already separating blocks at the insertion point.
  // BlockNote round-trips markdown with blank-line runs wider than "\n\n", and
  // an inserted section that collapses them detaches the following heading.
  const trailing = before.match(/\n*$/)?.[0] ?? "";
  const separator = trailing.length >= 2 ? trailing : "\n\n";
  const head = before.slice(0, before.length - trailing.length);

  return {
    ok: true,
    markdown: head + separator + insert + (after ? separator + after : "\n"),
  };
}
