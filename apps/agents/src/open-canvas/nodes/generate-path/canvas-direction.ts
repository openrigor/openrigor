const SHORT_ACK_PATTERN =
  /^(ok|okay|yes|yeah|yep|sure|thanks|thank you|no|nope|got it|sounds good)[\s!.?]*$/i;

/** Student is reporting a failed edit, not giving new document direction. */
const EDIT_FAILURE_PATTERN =
  /\b(try again|didn't work|did not work|not right|wasn't right|was deleted|complete delete|deleted the|nothing changed|no changes|unchanged|undo|revert|keep\/undo|edit failed|edit result|wrong section|wiped|blank canvas|bad edit|poor edit|wrong edit|terrible edit|that edit)\b/i;

/** Verbs that request a change to highlighted text (not commentary/questions). */
const SELECTION_EDIT_VERB_PATTERN =
  /\b(change|replace|rewrite|rephrase|reword|fix|edit|revise|improve|update|make (this|it|the)|shorten|expand|delete|remove|add|insert|move|swap|turn (this|it)|simplify|tighten|strengthen|restructure|clarif(y|ying)?|format)\b/i;

/**
 * True when the student wants the highlighted selection edited on canvas.
 * Questions and commentary about the selection → false (route to chat).
 *
 * canvas-vs-chat routing for unhighlighted messages uses determineTeachingIntent (LLM).
 */
export function isSelectionEditRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || SHORT_ACK_PATTERN.test(trimmed)) {
    return false;
  }

  if (EDIT_FAILURE_PATTERN.test(trimmed)) {
    return false;
  }

  return SELECTION_EDIT_VERB_PATTERN.test(trimmed);
}

/**
 * True when the message asks to remove/delete content. Removal of a subsection
 * is never a whole-document intent — routing it to rewriteArtifact wipes the rest
 * of the doc, so it must go to a section-level node instead.
 */
const REMOVAL_VERB_PATTERN =
  /\b(remove|delete|drop|cut|take out|eliminate|strip out|excise|get rid of)\b/i;

/** Explicit whole-document rewrite intent (the ONLY case rewriteArtifact is safe). */
const TARGET_DOC_REWRITE_PATTERN =
  /\b(?:rewrite|rephrase|reword|restructure)\s+(?:the\s+|our\s+|this\s+)*(?:document|draft|essay|paper|canvas|article)\b|\b(?:do|give|make|write)\s+(?:a\s+|the\s+)*(?:full|complete|total|fresh|brand.?new)\s+rewrite\b|\brewrite\s+(?:the\s+)?(?:whole|entire|full|entirety)\s+(?:document|draft|essay|paper|canvas|thing)\b|\bmake\s+(?:the\s+)?(?:document|draft|essay|paper|canvas)\s+(?:a\s+lot\s+|much\s+|way\s+)?(?:shorter|longer|tighter)\b|\bshorten\s+(?:the\s+)?(?:whole|entire|full)?\s*(?:document|draft|essay|paper|canvas)\b/i;

/** Explicit commands to author content in the canvas or document. */
const CANVAS_WRITE_REQUEST_PATTERN =
  /^(?:(?:please|kindly)[,!]?\s+|(?:can|could|would|will)\s+you\s+|i\s+(?:want|need)\s+you\s+to\s+)?(?:write|put|add|give|create)\b[\s\S]{0,120}?\b(?:in|into|to|on)\s+(?:the\s+|my\s+|our\s+|this\s+)?(?:canvas|document|doc)\b/i;

/**
 * True when the student is explicitly asking to rewrite the FULL document.
 * Used as a hard safety gate: rewrite `rewriteArtifact` ONLY on this.
 */
export function isWholeDocumentRewriteRequest(message: string): boolean {
  const trimmed = message.trim();
  if (
    !trimmed ||
    !/rewrite|rephrase|reword|restructure|shorten|expand|make\b/i.test(trimmed)
  ) {
    return false;
  }
  return TARGET_DOC_REWRITE_PATTERN.test(trimmed);
}

/**
 * True when the student explicitly directs the assistant to author content on
 * the canvas or document, rather than asking for coaching or commentary.
 */
export function isCanvasWriteRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || SHORT_ACK_PATTERN.test(trimmed)) return false;
  return CANVAS_WRITE_REQUEST_PATTERN.test(trimmed);
}

/**
 * True when a message is a targeted / structural edit to a specific part of the
 * document (a section, subsection, paragraph, a numbered item, or a removal),
 * rather than a rewrite of the entire document.
 */
export function isTargetedEditRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (isWholeDocumentRewriteRequest(trimmed)) return false;
  // Removals are never whole-document intents.
  if (REMOVAL_VERB_PATTERN.test(trimmed)) return true;
  // Edit verb targeted at a numbered / labelled part of the document.
  return (
    /(?:remove|delete|drop|edit|change|rewrite|rephrase|revise|fix|update|shorten|expand|move|tighten|strengthen|clarify)\s+(?:the\s+)?(?:section|subsection|paragraph|part|point|claim|argument|reference|remark|table|figure|heading|subheading|conclusion|introduction|thesis|summary)\b|\b\d+(?:\.\d+){0,2}\b/i.test(
      trimmed
    ) && SELECTION_EDIT_VERB_PATTERN.test(trimmed)
  );
}
