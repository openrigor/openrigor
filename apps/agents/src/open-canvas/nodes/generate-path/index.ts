import { extractUrls } from "@opencanvas/shared/utils/urls";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { dynamicDeterminePath } from "./dynamic-determine-path.js";
import { determineTeachingIntent } from "./determine-teaching-intent.js";
import {
  convertContextDocumentToHumanMessage,
  fixMisFormattedContextDocMessage,
} from "./documents.js";
import { getStringFromContent } from ".././../../utils.js";
import { includeURLContents } from "./include-url-contents.js";
import {
  isLiteralReplace,
  parseReplaceAllIntent,
  parseReplaceIntent,
} from "@opencanvas/shared/utils/text-edits";
import { isSelectionEditRequest } from "./canvas-direction.js";

function artifactHasMarkdownContent(
  state: typeof OpenCanvasGraphAnnotation.State
): boolean {
  return !(
    !state.artifact?.contents?.length ||
    state.artifact.contents.every((c) => {
      if (c.type === "text") return !c.fullMarkdown?.trim();
      if (c.type === "code") return !c.code?.trim();
      return true;
    })
  );
}

function extractURLsFromLastMessage(messages: BaseMessage[]): string[] {
  if (!messages.length) return [];
  const recentMessage = messages[messages.length - 1];
  if (!recentMessage?.content) return [];
  const recentMessageContent = getStringFromContent(recentMessage.content);
  const messageUrls = extractUrls(recentMessageContent);
  return messageUrls;
}

function buildMessagesReturn(
  newMessages: BaseMessage[],
  newInternalMessageList: BaseMessage[]
) {
  return newMessages.length
    ? {
        messages: newMessages,
        _messages: [...newInternalMessageList, ...newMessages],
      }
    : {
        _messages: newInternalMessageList,
      };
}

/**
 * Routes to the proper node in the graph based on the user's query.
 */
export async function generatePath(
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> {
  const { _messages } = state;
  // No-AI profiles still expose assignment context, local authoring, and
  // submission, but must never reach an LLM-backed node.
  if (state.apparatusConfiguration?.ai_assistance === false) {
    return { next: "noAiAssignment" };
  }
  if (state.next) {
    return { next: state.next };
  }

  // Form Templates use the assistant as a conversational form-filling
  // partner. Their structured values are exchanged through formContext;
  // never route these turns through Markdown artifact-rewrite nodes.
  if (state.formContext) {
    return { next: "replyToGeneralInput" };
  }
  const newMessages: BaseMessage[] = [];
  const docMessage = await convertContextDocumentToHumanMessage(
    _messages,
    config
  );
  const existingDocMessage = newMessages.find(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some(
        (c) => c.type === "document" || c.type === "application/pdf"
      )
  );

  if (docMessage) {
    newMessages.push(docMessage);
  } else if (existingDocMessage) {
    const fixedMessages = await fixMisFormattedContextDocMessage(
      existingDocMessage as HumanMessage,
      config
    );
    if (fixedMessages) {
      newMessages.push(...fixedMessages);
    }
  }

  if (state.highlightedCode) {
    if (state.apparatusConfiguration?.ai_canvas_actions === false) {
      return { next: "noAiAssignment" };
    }
    return {
      next: "updateArtifact",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }
  if (state.highlightedText) {
    if (state.apparatusConfiguration?.ai_canvas_actions === false) {
      return { next: "noAiAssignment" };
    }
    const lastMsg = _messages[_messages.length - 1];
    const lastMsgContent = getStringFromContent(lastMsg?.content);
    const replaceIntent = parseReplaceIntent(lastMsgContent);
    if (
      replaceIntent &&
      isLiteralReplace(replaceIntent, state.highlightedText)
    ) {
      return {
        next: "applyTextEdits",
        textEditIntent: {
          kind: "replace_in_selection",
          find: replaceIntent.find,
          replace: replaceIntent.replace,
          replaceAllInBlock: replaceIntent.replaceAllInBlock,
        },
        ...(newMessages.length
          ? { messages: newMessages, _messages: newMessages }
          : {}),
      };
    }

    if (isSelectionEditRequest(lastMsgContent)) {
      return {
        next: "updateHighlightedText",
        ...(newMessages.length
          ? { messages: newMessages, _messages: newMessages }
          : {}),
      };
    }

    return {
      next: "replyToGeneralInput",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  if (
    state.language ||
    state.artifactLength ||
    state.regenerateWithEmojis ||
    state.readingLevel
  ) {
    if (state.apparatusConfiguration?.ai_canvas_actions === false) {
      return { next: "noAiAssignment" };
    }
    return {
      next: "rewriteArtifactTheme",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  if (
    state.addComments ||
    state.addLogs ||
    state.portLanguage ||
    state.fixBugs
  ) {
    if (state.apparatusConfiguration?.ai_canvas_actions === false) {
      return { next: "noAiAssignment" };
    }
    return {
      next: "rewriteCodeArtifactTheme",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  if (state.customQuickActionId) {
    if (state.apparatusConfiguration?.ai_canvas_actions === false) {
      return { next: "noAiAssignment" };
    }
    return {
      next: "customAction",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  if (state.webSearchEnabled) {
    return {
      next: "webSearch",
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  const messageUrls = extractURLsFromLastMessage(state._messages);
  let updatedMessageWithContents: HumanMessage | undefined = undefined;
  if (messageUrls.length) {
    updatedMessageWithContents = await includeURLContents(
      state._messages[state._messages.length - 1],
      messageUrls
    );
  }

  const newInternalMessageList = updatedMessageWithContents
    ? state._messages.map((m) => {
        if (m.id === updatedMessageWithContents.id) {
          return updatedMessageWithContents;
        } else {
          return m;
        }
      })
    : state._messages;

  const lastMsg = newInternalMessageList[newInternalMessageList.length - 1];
  const lastMsgContentRaw = getStringFromContent(lastMsg?.content);

  // Mechanical replace_all — deterministic, no LLM.
  const replaceAllIntent = parseReplaceAllIntent(lastMsgContentRaw);
  if (
    replaceAllIntent &&
    artifactHasMarkdownContent(state) &&
    !state.highlightedText
  ) {
    return {
      next: "applyTextEdits",
      textEditIntent: replaceAllIntent,
      ...(newMessages.length
        ? { messages: newMessages, _messages: newMessages }
        : {}),
    };
  }

  // Teaching mode: LLM intent classification with full conversation context.
  // Defaults to coaching chat; canvas edits only when the model judges clear intent.
  const phase =
    state.phase_state ||
    (state.apparatusConfiguration &&
    state.apparatusConfiguration.drafting_gate !== undefined &&
    state.apparatusConfiguration.drafting_gate !== "none"
      ? "socratic"
      : "drafting");
  if (phase === "socratic" || phase === "drafting" || phase === "submitted") {
    const intent = await determineTeachingIntent({
      state: {
        ...state,
        _messages: newInternalMessageList,
      },
      newMessages,
      config,
    });

    return {
      next: intent.route,
      ...buildMessagesReturn(newMessages, newInternalMessageList),
    };
  }

  // Non-teaching fallback: LLM router for ambiguous cases on blank canvas.
  const routingResult = await dynamicDeterminePath({
    state: {
      ...state,
      _messages: newInternalMessageList,
    },
    newMessages,
    config,
  });
  const route = routingResult?.route;
  if (!route) {
    throw new Error("Route not found");
  }

  return {
    next: route,
    ...buildMessagesReturn(newMessages, newInternalMessageList),
  };
}
