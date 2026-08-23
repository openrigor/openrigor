/**
 * Pure rules for picking which LangGraph thread is "active" for a student
 * assignment. Prefer substantive content over newest-empty kickoffs.
 */

export type ThreadLike = {
  thread_id: string;
  metadata?: Record<string, unknown> | null;
  // LangGraph SDK `values` is a wide union; accept unknown here.
  values?: unknown;
};

function artifactMarkdownFromValues(values: unknown): string {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "";
  const record = values as Record<string, unknown>;
  const artifact = record.artifact as Record<string, unknown> | undefined;
  if (!artifact) return "";
  if (typeof artifact.fullMarkdown === "string") return artifact.fullMarkdown;
  const contents = artifact.contents;
  if (!Array.isArray(contents)) return "";
  for (const item of contents) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { fullMarkdown?: unknown }).fullMarkdown === "string"
    ) {
      return (item as { fullMarkdown: string }).fullMarkdown;
    }
  }
  return "";
}

export function threadMessageCount(values: unknown): number {
  if (!values || typeof values !== "object" || Array.isArray(values)) return 0;
  const messages = (values as Record<string, unknown>).messages;
  return Array.isArray(messages) ? messages.length : 0;
}

export function threadMarkdownLength(values: unknown): number {
  return artifactMarkdownFromValues(values).trim().length;
}

/** Higher = more student work. Used to break "newest empty kickoff wins". */
export function threadContentScore(thread: ThreadLike): number {
  const msgs = threadMessageCount(thread.values);
  const md = threadMarkdownLength(thread.values);
  return msgs * 1_000_000 + md;
}

/**
 * Kickoff-only: at most the hidden human + one coach reply, and no real canvas.
 * Starter markdown alone does not count as substantive work.
 */
export function isEmptyKickoffThread(thread: ThreadLike): boolean {
  const msgs = threadMessageCount(thread.values);
  const md = threadMarkdownLength(thread.values);
  return msgs <= 2 && md < 200;
}

export function isAbandonedThread(thread: ThreadLike): boolean {
  return Boolean(thread.metadata?.abandoned);
}

export function isSubmittedThread(thread: ThreadLike): boolean {
  if (Number(thread.metadata?.completionPercent) === 100) return true;
  if (thread.metadata?.phase_state === "submitted") return true;
  if (thread.metadata?.phaseState === "submitted") return true;
  const values = thread.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    if ((values as Record<string, unknown>).phase_state === "submitted") {
      return true;
    }
  }
  return false;
}

/**
 * Workspace-bound method assignments are a single attempt: resume the existing
 * thread (read-only after submit). Donor `/student` still mints a fresh attempt
 * when the only sibling is already submitted.
 */
export function shouldMintNewAssignmentThread(
  existing: ThreadLike | undefined,
  opts: { workspaceBound?: boolean } = {}
): boolean {
  if (!existing) return true;
  if (opts.workspaceBound) return false;
  return isSubmittedThread(existing);
}

/**
 * Pick the best non-abandoned thread for resume.
 * 1. Prefer incomplete threads with the highest content score
 * 2. Else submitted with highest score
 * 3. Never prefer an empty kickoff when a richer sibling exists
 */
export function selectActiveThread<T extends ThreadLike>(
  threads: T[]
): T | undefined {
  const candidates = threads.filter((t) => !isAbandonedThread(t));
  if (candidates.length === 0) return undefined;

  const byScoreDesc = (a: T, b: T) =>
    threadContentScore(b) - threadContentScore(a);

  const incomplete = candidates
    .filter((t) => !isSubmittedThread(t))
    .sort(byScoreDesc);
  if (incomplete.length > 0) {
    const best = incomplete[0];
    // If best is empty kickoff but a *non-submitted* sibling has more content,
    // prefer that. Never displace an empty kickoff with a submitted read-only thread.
    const richer = candidates
      .filter(
        (t) =>
          !isSubmittedThread(t) &&
          threadContentScore(t) > threadContentScore(best)
      )
      .sort(byScoreDesc)[0];
    if (isEmptyKickoffThread(best) && richer) return richer;
    return best;
  }

  return [...candidates].sort(byScoreDesc)[0];
}

/** Empty kickoffs that should be marked abandoned once a richer thread wins. */
export function emptyKickoffsToAbandon<T extends ThreadLike>(
  threads: T[],
  selected: T | undefined
): T[] {
  if (!selected || isEmptyKickoffThread(selected)) return [];
  return threads.filter(
    (t) =>
      t.thread_id !== selected.thread_id &&
      !isAbandonedThread(t) &&
      isEmptyKickoffThread(t)
  );
}

/** True when a cached/URL thread should be discarded in favour of search. */
export function shouldRejectCachedThread(
  cached: ThreadLike | null | undefined,
  siblings: ThreadLike[]
): boolean {
  if (!cached) return true;
  if (isAbandonedThread(cached)) return true;
  if (!isEmptyKickoffThread(cached)) return false;
  const best = selectActiveThread(siblings.length ? siblings : [cached]);
  return Boolean(best && best.thread_id !== cached.thread_id);
}
