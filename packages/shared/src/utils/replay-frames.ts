export type ReplayHistorySource = "input" | "loop" | "update";

export type ReplayAuthor = "student" | "ai" | "ambiguous" | "none";

export interface ReplayHistoryMessage {
  id?: string;
  type?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface ReplayHistoryArtifact {
  currentIndex?: number;
  contents?: Array<{
    index?: number;
    type?: string;
    fullMarkdown?: string;
    [key: string]: unknown;
  }>;
}

export interface ReplayHistoryValues {
  messages?: ReplayHistoryMessage[];
  artifact?: ReplayHistoryArtifact;
  [key: string]: unknown;
}

export interface ReplayHistoryCheckpoint {
  checkpoint: {
    checkpoint_id: string;
    [key: string]: unknown;
  };
  created_at?: string | number;
  metadata?: {
    source?: string;
    [key: string]: unknown;
  };
  values?: ReplayHistoryValues | null;
  [key: string]: unknown;
}

export interface ReplayFrame {
  checkpointId: string;
  createdAt: number;
  source: ReplayHistorySource;
  messages: ReplayHistoryMessage[];
  artifactMarkdown: string;
  artifactType: "text" | "code" | null;
  artifactCode: string;
  author: ReplayAuthor;
  charsAdded: number;
  charsRemoved: number;
  messagesSummarized: boolean;
}

const SUMMARY_RATIO_THRESHOLD = 0.6;

function parseCreatedAtMs(createdAt: string | number | undefined): number {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt;
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function messageContentLength(message: ReplayHistoryMessage): number {
  const { content } = message;
  if (typeof content === "string") {
    return content.length;
  }
  if (content == null) {
    return 0;
  }
  try {
    return JSON.stringify(content).length;
  } catch {
    return 0;
  }
}

function totalMessageChars(messages: ReplayHistoryMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + messageContentLength(message),
    0
  );
}

function dedupeMessagesById(
  messages: ReplayHistoryMessage[]
): ReplayHistoryMessage[] {
  const seen = new Set<string>();
  const deduped: ReplayHistoryMessage[] = [];

  for (const message of messages) {
    const id = message.id;
    if (typeof id === "string" && id.length > 0) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
    }
    deduped.push(message);
  }

  return deduped;
}

function messagesSignature(messages: ReplayHistoryMessage[]): string {
  return JSON.stringify(
    messages.map((message) => ({
      id: message.id ?? null,
      type: message.type ?? null,
      content: message.content ?? null,
    }))
  );
}

function isSummaryChannel(
  rawMessages: ReplayHistoryMessage[],
  accumulatedMessages: ReplayHistoryMessage[]
): boolean {
  if (accumulatedMessages.length === 0) {
    return false;
  }

  const rawCount = rawMessages.length;
  const accumulatedCount = accumulatedMessages.length;
  const rawChars = totalMessageChars(rawMessages);
  const accumulatedChars = totalMessageChars(accumulatedMessages);

  if (rawCount < accumulatedCount * SUMMARY_RATIO_THRESHOLD) {
    return true;
  }

  if (rawChars < accumulatedChars * SUMMARY_RATIO_THRESHOLD) {
    return true;
  }

  return false;
}

function mergeSummaryMessages(
  accumulatedMessages: ReplayHistoryMessage[],
  rawMessages: ReplayHistoryMessage[]
): ReplayHistoryMessage[] {
  const merged = [...accumulatedMessages];
  const knownIds = new Set(
    merged
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  for (const message of rawMessages) {
    const id = message.id;
    if (typeof id === "string" && id.length > 0) {
      if (knownIds.has(id)) {
        continue;
      }
      knownIds.add(id);
    }
    merged.push(message);
  }

  return merged;
}

function extractActiveArtifactContent(
  artifact: ReplayHistoryArtifact | undefined
): {
  markdown: string;
  type: "text" | "code" | null;
  code: string;
} {
  if (!artifact || !Array.isArray(artifact.contents)) {
    return { markdown: "", type: null, code: "" };
  }

  const currentIndex = artifact.currentIndex;
  const active =
    artifact.contents.find((content) => content.index === currentIndex) ??
    artifact.contents[artifact.contents.length - 1];

  if (!active) {
    return { markdown: "", type: null, code: "" };
  }

  if (active.type === "code") {
    const code = typeof active.code === "string" ? active.code : "";
    return { markdown: "", type: "code", code };
  }

  const markdown =
    typeof active.fullMarkdown === "string" ? active.fullMarkdown : "";
  return { markdown, type: "text", code: "" };
}

function longestCommonSubsequenceLength(a: string, b: string): number {
  if (a === b) {
    return a.length;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const prev = new Array<number>(b.length + 1).fill(0);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  return prev[b.length];
}

const MAX_LCS_PRODUCT = 4_000_000;

function charDeltas(
  previousMarkdown: string,
  currentMarkdown: string
): { charsAdded: number; charsRemoved: number } {
  if (previousMarkdown === currentMarkdown) {
    return { charsAdded: 0, charsRemoved: 0 };
  }

  const canUseLcs =
    previousMarkdown.length * currentMarkdown.length <= MAX_LCS_PRODUCT;

  if (!canUseLcs) {
    return {
      charsAdded: Math.max(0, currentMarkdown.length - previousMarkdown.length),
      charsRemoved: Math.max(
        0,
        previousMarkdown.length - currentMarkdown.length
      ),
    };
  }

  const lcsLength = longestCommonSubsequenceLength(
    previousMarkdown,
    currentMarkdown
  );

  return {
    charsRemoved: previousMarkdown.length - lcsLength,
    charsAdded: currentMarkdown.length - lcsLength,
  };
}

function normalizeSource(
  source: string | undefined
): ReplayHistorySource | null {
  if (source === "input" || source === "loop" || source === "update") {
    return source;
  }
  return null;
}

function resolveAuthor(
  source: ReplayHistorySource,
  messages: ReplayHistoryMessage[],
  awaitingAiResponse: boolean
): ReplayAuthor {
  if (source === "update") {
    return "student";
  }

  if (source === "loop") {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === "human") {
      return "ambiguous";
    }
    if (awaitingAiResponse) {
      return "ai";
    }
  }

  return "none";
}

function sortHistoryAscending(
  history: ReplayHistoryCheckpoint[]
): ReplayHistoryCheckpoint[] {
  return [...history].sort((left, right) =>
    left.checkpoint.checkpoint_id.localeCompare(right.checkpoint.checkpoint_id)
  );
}

/**
 * Convert LangGraph checkpoint history into deduped replay frames.
 * Input history is expected newest-first (SDK order) but frame order is
 * always ascending by time-encoded checkpoint_id.
 */
export function historyToFrames(
  history: ReplayHistoryCheckpoint[]
): ReplayFrame[] {
  const sortedHistory = sortHistoryAscending(history);
  const frames: ReplayFrame[] = [];

  let accumulatedMessages: ReplayHistoryMessage[] = [];
  let previousMessagesSignature = "";
  let previousArtifactMarkdown = "";
  let awaitingAiResponse = false;

  for (const entry of sortedHistory) {
    const values = entry.values;
    if (values == null || typeof values !== "object") {
      continue;
    }

    const rawMessages = values.messages;
    if (!Array.isArray(rawMessages)) {
      continue;
    }

    const rawDeduped = dedupeMessagesById(rawMessages);
    const messagesSummarized = isSummaryChannel(
      rawDeduped,
      accumulatedMessages
    );
    const messages = messagesSummarized
      ? mergeSummaryMessages(accumulatedMessages, rawDeduped)
      : rawDeduped;

    accumulatedMessages = messages;

    const {
      markdown: artifactMarkdown,
      type: artifactType,
      code: artifactCode,
    } = extractActiveArtifactContent(values.artifact);
    const currentMessagesSignature = messagesSignature(messages);

    if (
      frames.length > 0 &&
      currentMessagesSignature === previousMessagesSignature &&
      artifactMarkdown === previousArtifactMarkdown
    ) {
      continue;
    }

    const source = normalizeSource(entry.metadata?.source);
    if (!source) {
      continue;
    }

    if (source === "input") {
      awaitingAiResponse = true;
    }

    const author = resolveAuthor(source, messages, awaitingAiResponse);

    const lastMessage = messages[messages.length - 1];
    if (awaitingAiResponse && lastMessage?.type === "ai") {
      awaitingAiResponse = false;
    }

    const { charsAdded, charsRemoved } = charDeltas(
      previousArtifactMarkdown,
      artifactMarkdown
    );

    frames.push({
      checkpointId: entry.checkpoint.checkpoint_id,
      createdAt: parseCreatedAtMs(entry.created_at),
      source,
      messages,
      artifactMarkdown,
      artifactType,
      artifactCode,
      author,
      charsAdded,
      charsRemoved,
      messagesSummarized,
    });

    previousMessagesSignature = currentMessagesSignature;
    previousArtifactMarkdown = artifactMarkdown;
  }

  return frames;
}
