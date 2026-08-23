import { TextHighlight } from "../types.js";

export interface ReplaceAllParams {
  find: string;
  replace: string;
  matchCase?: boolean;
}

export interface ReplaceAllResult {
  markdown: string;
  matchCount: number;
}

export interface ParsedReplaceAllIntent {
  kind: "replace_all";
  find: string;
  replace: string;
  matchCase?: boolean;
}

export interface ParsedReplaceIntent {
  find: string;
  replace: string;
  replaceAllInBlock?: boolean;
}

export type ReplaceInSelectionResult =
  | { markdown: string; matchCount: number }
  | { error: "block_not_found" | "selection_not_found" | "no_matches" };

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function buildReplaceAllIntent(
  find: string,
  replace: string,
  message: string
): ParsedReplaceAllIntent | null {
  const normalizedFind = find.trim();
  const normalizedReplace = replace.trim();
  if (!normalizedFind || normalizedFind === normalizedReplace) {
    return null;
  }
  return {
    kind: "replace_all",
    find: normalizedFind,
    replace: normalizedReplace,
    matchCase: !/\bcase\s+insensitive\b/i.test(message),
  };
}

function buildReplaceIntent(
  find: string,
  replace: string,
  replaceAllInBlock: boolean
): ParsedReplaceIntent | null {
  const normalizedFind = find.trim();
  const normalizedReplace = replace.trim();
  if (!normalizedFind || normalizedFind === normalizedReplace) {
    return null;
  }
  return {
    find: normalizedFind,
    replace: normalizedReplace,
    replaceAllInBlock,
  };
}

/**
 * Parse a full-document replace-all intent from a user message.
 */
export function parseReplaceAllIntent(
  message: string
): ParsedReplaceAllIntent | null {
  const msg = message.trim();

  let match = msg.match(
    /replace\s+all(?:\s+instances?\s+of)?\s+"([^"]+)"\s+with\s+"([^"]+)"/i
  );
  if (match) {
    return buildReplaceAllIntent(match[1], match[2], msg);
  }

  match = msg.match(/replace\s+"([^"]+)"\s+with\s+"([^"]+)"/i);
  if (match) {
    return buildReplaceAllIntent(match[1], match[2], msg);
  }

  match = msg.match(/chang(?:e|ing)\s+"([^"]+)"\s+(?:to|with)\s+"([^"]+)"/i);
  if (match) {
    return buildReplaceAllIntent(match[1], match[2], msg);
  }

  match = msg.match(/change\s+(.+?)\s+to\s+(.+?)\s+throughout/i);
  if (match) {
    return buildReplaceAllIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      msg
    );
  }

  match = msg.match(
    /replace\s+all(?:\s+instances?\s+of)?\s+(.+?)\s+with\s+(.+?)$/i
  );
  if (match) {
    return buildReplaceAllIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      msg
    );
  }

  match = msg.match(/^replace\s+(.+?)\s+with\s+(.+?)$/i);
  if (match) {
    return buildReplaceAllIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      msg
    );
  }

  return null;
}

/**
 * Parse a selection-scoped literal replace intent from a user message.
 */
export function parseReplaceIntent(
  message: string
): ParsedReplaceIntent | null {
  const msg = message.trim();
  const replaceAllInBlock = /\breplace\s+all\b/i.test(msg);

  let match = msg.match(
    /(?:chang(?:e|ing)|replace)\s+"([^"]+)"\s+(?:to|with)\s+"([^"]+)"/i
  );
  if (match) {
    return buildReplaceIntent(match[1], match[2], replaceAllInBlock);
  }

  match = msg.match(/change\s+(.+?)\s+to\s+(.+?)$/i);
  if (match && !/\bthroughout\b/i.test(msg)) {
    return buildReplaceIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      replaceAllInBlock
    );
  }

  match = msg.match(/replace\s+all\s+(.+?)\s+with\s+(.+?)$/i);
  if (match) {
    return buildReplaceIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      true
    );
  }

  match = msg.match(/replace\s+(?!all\b)(.+?)\s+with\s+(.+?)$/i);
  if (match) {
    return buildReplaceIntent(
      stripQuotes(match[1]),
      stripQuotes(match[2]),
      replaceAllInBlock
    );
  }

  return null;
}

export function isLiteralReplace(
  intent: ParsedReplaceIntent,
  highlightedText: TextHighlight
): boolean {
  const { selectedText } = highlightedText;
  if (selectedText.includes(intent.find)) {
    return true;
  }
  return selectedText.toLowerCase().includes(intent.find.toLowerCase());
}

export function assertBlockInMarkdown(
  fullMarkdown: string,
  markdownBlock: string
): void {
  if (!fullMarkdown.includes(markdownBlock)) {
    throw new Error("Selected text not found in current content");
  }
}

/**
 * Replace all occurrences of `find` with `replace` in markdown.
 */
export function applyReplaceAll(
  markdown: string,
  params: ReplaceAllParams
): ReplaceAllResult {
  const { find, replace, matchCase = true } = params;
  if (!find) {
    return { markdown, matchCount: 0 };
  }

  if (matchCase) {
    let matchCount = 0;
    let position = 0;
    let result = "";
    while (position < markdown.length) {
      const index = markdown.indexOf(find, position);
      if (index === -1) {
        break;
      }
      matchCount += 1;
      result += markdown.slice(position, index) + replace;
      position = index + find.length;
    }
    if (matchCount === 0) {
      return { markdown, matchCount: 0 };
    }
    result += markdown.slice(position);
    return { markdown: result, matchCount };
  }

  const lowerMarkdown = markdown.toLowerCase();
  const lowerFind = find.toLowerCase();
  let matchCount = 0;
  let position = 0;
  let result = "";
  while (position < markdown.length) {
    const index = lowerMarkdown.indexOf(lowerFind, position);
    if (index === -1) {
      break;
    }
    matchCount += 1;
    result += markdown.slice(position, index) + replace;
    position = index + find.length;
  }
  if (matchCount === 0) {
    return { markdown, matchCount: 0 };
  }
  result += markdown.slice(position);
  return { markdown: result, matchCount };
}

const PAREN_SUFFIX_RE = /^(.+?)\s*\(([^)]+)\)\s*$/;

/**
 * When renaming "Long Name (ABBR)" → "New Name (NEW)", also replace the
 * standalone long name and abbreviation throughout the document.
 */
export function expandRenamePairs(
  find: string,
  replace: string,
  matchCase = true
): ReplaceAllParams[] {
  const pairs: ReplaceAllParams[] = [{ find, replace, matchCase }];
  const findMatch = find.match(PAREN_SUFFIX_RE);
  const replaceMatch = replace.match(PAREN_SUFFIX_RE);
  if (findMatch && replaceMatch) {
    const findName = findMatch[1].trim();
    const findAbbr = findMatch[2].trim();
    const replaceName = replaceMatch[1].trim();
    const replaceAbbr = replaceMatch[2].trim();
    if (findName && findAbbr && replaceName && replaceAbbr) {
      pairs.push({ find: findName, replace: replaceName, matchCase });
      pairs.push({ find: findAbbr, replace: replaceAbbr, matchCase });
    }
  }

  const seen = new Set<string>();
  return pairs
    .filter((p) => {
      const key = `${p.find}\0${p.replace}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.find.length - a.find.length);
}

/**
 * Apply multiple replace-all operations in order (longest find strings first).
 */
export function applyReplaceAllSequence(
  markdown: string,
  pairs: ReplaceAllParams[]
): ReplaceAllResult {
  let result = markdown;
  let totalMatches = 0;
  for (const params of pairs) {
    const { markdown: next, matchCount } = applyReplaceAll(result, params);
    result = next;
    totalMatches += matchCount;
  }
  return { markdown: result, matchCount: totalMatches };
}

function replaceWithinBlock(
  markdownBlock: string,
  find: string,
  replace: string,
  replaceAllInBlock: boolean
): { updatedBlock: string; matchCount: number } | null {
  if (!markdownBlock.includes(find)) {
    const lowerBlock = markdownBlock.toLowerCase();
    const lowerFind = find.toLowerCase();
    if (!lowerBlock.includes(lowerFind)) {
      return null;
    }

    if (replaceAllInBlock) {
      let matchCount = 0;
      let position = 0;
      let updatedBlock = "";
      while (position < markdownBlock.length) {
        const index = lowerBlock.indexOf(lowerFind, position);
        if (index === -1) {
          break;
        }
        matchCount += 1;
        updatedBlock += markdownBlock.slice(position, index) + replace;
        position = index + find.length;
      }
      if (matchCount === 0) {
        return null;
      }
      updatedBlock += markdownBlock.slice(position);
      return { updatedBlock, matchCount };
    }

    const index = lowerBlock.indexOf(lowerFind);
    const updatedBlock =
      markdownBlock.slice(0, index) +
      replace +
      markdownBlock.slice(index + find.length);
    return { updatedBlock, matchCount: 1 };
  }

  if (replaceAllInBlock) {
    const { markdown, matchCount } = applyReplaceAll(markdownBlock, {
      find,
      replace,
      matchCase: true,
    });
    if (matchCount === 0) {
      return null;
    }
    return { updatedBlock: markdown, matchCount };
  }

  const index = markdownBlock.indexOf(find);
  const updatedBlock =
    markdownBlock.slice(0, index) +
    replace +
    markdownBlock.slice(index + find.length);
  return { updatedBlock, matchCount: 1 };
}

/**
 * Replace text inside a highlighted markdown block without touching the rest
 * of the document.
 */
export function applyReplaceInSelection(
  fullMarkdown: string,
  markdownBlock: string,
  selectedText: string,
  find: string,
  replace: string,
  replaceAllInBlock = false
): ReplaceInSelectionResult {
  if (!fullMarkdown.includes(markdownBlock)) {
    return { error: "block_not_found" };
  }

  if (
    !markdownBlock.includes(find) &&
    !markdownBlock.toLowerCase().includes(find.toLowerCase()) &&
    !selectedText.toLowerCase().includes(find.toLowerCase())
  ) {
    return { error: "selection_not_found" };
  }

  const replacement = replaceWithinBlock(
    markdownBlock,
    find,
    replace,
    replaceAllInBlock
  );
  if (!replacement) {
    return { error: "no_matches" };
  }

  let updatedBlock = replacement.updatedBlock;
  if (markdownBlock.endsWith("\n") && !updatedBlock.endsWith("\n")) {
    updatedBlock += "\n";
  }

  const markdown = fullMarkdown.replace(markdownBlock, updatedBlock);
  return { markdown, matchCount: replacement.matchCount };
}
