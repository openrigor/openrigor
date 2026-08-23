import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  applyReplaceAllSequence,
  applyReplaceInSelection,
  assertBlockInMarkdown,
  expandRenamePairs,
  parseReplaceAllIntent,
} from "@opencanvas/shared/utils/text-edits";
import { ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getStringFromContent } from "../../utils.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

/**
 * Deterministic text edits on the canvas artifact — no LLM calls.
 */
export const applyTextEdits = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  _config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const startedAt = Date.now();

  const recentUserMessage = state._messages[state._messages.length - 1];
  if (recentUserMessage.getType() !== "human") {
    throw new Error("Expected a human message");
  }

  let intent = state.textEditIntent;
  if (!intent) {
    const messageContent = getStringFromContent(recentUserMessage.content);
    const parsed = parseReplaceAllIntent(messageContent);
    if (parsed) {
      intent = parsed;
    }
  }

  if (!intent) {
    throw new Error("No text edit intent found");
  }

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }
  if (!isArtifactMarkdownContent(currentArtifactContent)) {
    throw new Error("Artifact is not markdown content");
  }

  const prevContent = state.artifact.contents.find(
    (c) => c.index === state.artifact.currentIndex && c.type === "text"
  ) as ArtifactMarkdownV3 | undefined;
  if (!prevContent) {
    throw new Error("Previous content not found");
  }

  if (intent.kind === "replace_all") {
    const sourceMarkdown = currentArtifactContent.fullMarkdown;
    const pairs = expandRenamePairs(
      intent.find,
      intent.replace,
      intent.matchCase
    );
    const { markdown, matchCount } = applyReplaceAllSequence(
      sourceMarkdown,
      pairs
    );

    console.log(
      `[applyTextEdits] ${JSON.stringify({
        op: "replace_all",
        matchCount,
        markdownLength: sourceMarkdown.length,
        durationMs: Date.now() - startedAt,
      })}`
    );

    const summary = {
      op: "replace_all" as const,
      find: intent.find,
      replace: intent.replace,
      matchCount,
    };

    if (matchCount === 0) {
      return { textEditSummary: summary };
    }

    const newCurrIndex = state.artifact.contents.length + 1;
    const updatedArtifactContent: ArtifactMarkdownV3 = {
      ...prevContent,
      index: newCurrIndex,
      fullMarkdown: markdown,
    };

    return {
      artifact: {
        ...state.artifact,
        currentIndex: newCurrIndex,
        contents: [...state.artifact.contents, updatedArtifactContent],
      },
      textEditSummary: summary,
    };
  }

  if (!state.highlightedText) {
    throw new Error("replace_in_selection requires highlighted text");
  }

  const { fullMarkdown, markdownBlock, selectedText } = state.highlightedText;
  try {
    assertBlockInMarkdown(fullMarkdown, markdownBlock);
  } catch {
    console.log(
      `[applyTextEdits] ${JSON.stringify({
        op: "replace_in_selection",
        error: "block_not_found",
        durationMs: Date.now() - startedAt,
      })}`
    );
    return {
      textEditSummary: {
        op: "replace_in_selection",
        error: "I couldn't locate the selected block in the document.",
      },
    };
  }

  const result = applyReplaceInSelection(
    fullMarkdown,
    markdownBlock,
    selectedText,
    intent.find,
    intent.replace,
    intent.replaceAllInBlock
  );

  if ("error" in result) {
    const errorMessage =
      result.error === "no_matches"
        ? `I couldn't find "${intent.find}" in the selection.`
        : "I couldn't apply that edit to the selected text.";
    console.log(
      `[applyTextEdits] ${JSON.stringify({
        op: "replace_in_selection",
        error: result.error,
        durationMs: Date.now() - startedAt,
      })}`
    );
    return {
      textEditSummary: {
        op: "replace_in_selection",
        error: errorMessage,
      },
    };
  }

  console.log(
    `[applyTextEdits] ${JSON.stringify({
      op: "replace_in_selection",
      matchCount: result.matchCount,
      markdownLength: fullMarkdown.length,
      durationMs: Date.now() - startedAt,
    })}`
  );

  const newCurrIndex = state.artifact.contents.length + 1;
  const updatedArtifactContent: ArtifactMarkdownV3 = {
    ...prevContent,
    index: newCurrIndex,
    fullMarkdown: result.markdown,
  };

  return {
    artifact: {
      ...state.artifact,
      currentIndex: newCurrIndex,
      contents: [...state.artifact.contents, updatedArtifactContent],
    },
    textEditSummary: {
      op: "replace_in_selection",
      find: intent.find,
      replace: intent.replace,
      matchCount: result.matchCount,
    },
  };
};
