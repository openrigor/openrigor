import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";

type MessageLike = {
  additional_kwargs?: Record<string, unknown>;
  content?: unknown;
  getType?: () => string;
  type?: string;
};

const BARE_ACKNOWLEDGMENTS = new Set([
  "ok",
  "yes",
  "yeah",
  "sure",
  "k",
  "hi",
  "hey",
  "hello",
  "hmm",
  "no",
  "nope",
  "idk",
  "whatever",
]);

const KEYBOARD_WALKS = [
  "qwertyuiop",
  "poiuytrewq",
  "asdfghjkl",
  "lkjhgfdsa",
  "zxcvbnm",
  "mnbvcxz",
];

function isKeyboardGibberish(word: string): boolean {
  return KEYBOARD_WALKS.some((walk) => walk.includes(word));
}

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  return content == null ? "" : (JSON.stringify(content) ?? "");
}

/**
 * Returns whether an input is plainly a placeholder or contains no usable
 * substance. This intentionally avoids trying to judge ordinary short prose,
 * so ambiguous input is left for the coach to handle.
 */
export function detectHollowInput(latestMessage: string): boolean {
  const content = latestMessage.trim();
  if (!content) return true;

  if (/^(?:participant\s+)?reply\s*\d+\s*[.!?]*$/i.test(content)) {
    return true;
  }

  const normalized = content.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (BARE_ACKNOWLEDGMENTS.has(normalized)) return true;

  const words = content.toLowerCase().match(/\p{L}+(?:['’]\p{L}+)?/gu) ?? [];
  const hasSubstantiveWord = words.some(
    (word) => word.length >= 3 && !isKeyboardGibberish(word)
  );

  // This catches content-free short input and recognizable keyboard mashing
  // such as "asdf qwerty 12345", without rejecting unfamiliar names or terms.
  return !hasSubstantiveWord;
}

/**
 * Reads the most recent human message from either LangChain message instances
 * or checkpoint-restored plain objects.
 */
export function getLatestHumanMessageContent(
  messages: readonly MessageLike[]
): string | undefined {
  const latestHumanMessage = [...messages].reverse().find((message) => {
    const messageType =
      typeof message.getType === "function" ? message.getType() : message.type;
    return (
      messageType === "human" &&
      message.additional_kwargs?.[OC_HIDE_FROM_UI_KEY] !== true
    );
  });

  return latestHumanMessage
    ? messageContentToText(latestHumanMessage.content)
    : undefined;
}
