import {
  createContextDocumentMessages,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
} from "../../utils.js";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { RunnableBinding } from "@langchain/core/runnables";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ConfigurableChatModelCallOptions } from "langchain/chat_models/universal";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  findBlockInMarkdown,
  normalizeCanvasMarkdown,
} from "@opencanvas/shared/utils/markdown-canvas";
import { ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

const PROMPT = `You are an expert AI writing assistant, tasked with rewriting some text a user has selected. The selected text is nested inside a larger 'block'. You should always respond with ONLY the updated text block in accordance with the user's request.
You should always respond with the full markdown text block, as it will simply replace the existing block in the artifact.
The blocks will be joined later on, so you do not need to worry about the formatting of the blocks, only make sure you keep the formatting and structure of the block you are updating.

# Selected text
{highlightedText}

# Text block
{textBlocks}

IMPORTANT: The numbers and tabs at the start of each line in the text block above are LINE NUMBERS for reference only. They are NOT part of the actual content. NEVER include line numbers in your response.

Your task is to rewrite the surrounding content to fulfill the user's request. The selected text content you are provided above has had the markdown styling removed, so you can focus on the text itself.
However, ensure you ALWAYS respond with the full markdown text block, including any markdown syntax.
NEVER wrap your response in any additional markdown syntax, as this will be handled by the system. Do NOT include a triple backtick wrapping the text block, unless it was present in the original text block.
You should NOT change anything EXCEPT the selected text. The ONLY instance where you may update the surrounding text is if it is necessary to make the selected text make sense.
You should ALWAYS respond with the full, updated text block, including any formatting, e.g newlines, indents, markdown syntax, etc. NEVER add extra syntax or formatting unless the user has specifically requested it.
If you observe partial markdown, this is OKAY because you are only updating a partial piece of the text.

Ensure you reply with the FULL text block, including the updated selected text. NEVER include only the updated selected text, or additional prefixes or suffixes.`;

function skipWithMessage(message: string): OpenCanvasGraphReturnType {
  return {
    textEditSummary: {
      op: "replace_in_selection",
      error: message,
    },
  };
}

/**
 * Update an existing artifact based on the user's query.
 */
export const updateHighlightedText = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelProvider, modelName } = getModelConfig(config);
  let model: RunnableBinding<
    BaseLanguageModelInput,
    AIMessageChunk,
    ConfigurableChatModelCallOptions
  >;
  if (modelProvider.includes("openai") || modelName.includes("3-5-sonnet")) {
    // Custom model is intelligent enough for updating artifacts
    model = (
      await getModelFromConfig(config, {
        temperature: 0,
      })
    ).withConfig({ runName: "update_highlighted_markdown" });
  } else {
    // Custom model is not intelligent enough for updating artifacts
    model = (
      await getModelFromConfig(
        {
          ...config,
          configurable: {
            customModelName: "gpt-4o",
          },
        },
        {
          temperature: 0,
        }
      )
    ).withConfig({ runName: "update_highlighted_markdown" });
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

  if (!state.highlightedText) {
    throw new Error(
      "Can not partially regenerate an artifact without a highlight"
    );
  }

  const { markdownBlock, selectedText } = state.highlightedText;
  const fullMarkdown = normalizeCanvasMarkdown(
    currentArtifactContent.fullMarkdown
  );
  const blockInDoc = findBlockInMarkdown(fullMarkdown, markdownBlock);
  if (!blockInDoc) {
    return skipWithMessage(
      "I couldn't match your selection to the document — your canvas is unchanged. Try highlighting the section again."
    );
  }
  // Add line numbers to the text blocks so the AI can reference specific lines
  const numberedBlocks = blockInDoc
    .split("\n")
    .map((line, idx) => `${idx + 1}\t${line}`)
    .join("\n");
  const formattedPrompt = PROMPT.replace(
    "{highlightedText}",
    selectedText
  ).replace("{textBlocks}", numberedBlocks);

  const recentUserMessage = state._messages[state._messages.length - 1];
  if (recentUserMessage.getType() !== "human") {
    throw new Error("Expected a human message");
  }

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const isO1MiniModel = isUsingO1MiniModel(config);
  const response = await model.invoke([
    {
      role: isO1MiniModel ? "user" : "system",
      content: formattedPrompt,
    },
    ...contextDocumentMessages,
    recentUserMessage,
  ]);
  const responseContent = response.content as string;

  // Safety: strip any line-number prefixes the LLM may have echoed back.
  // Pattern: lines starting with "N\t" where N is a number.
  const cleanedResponse = responseContent
    .split("\n")
    .map((line) => {
      const match = line.match(/^\d+\t(.*)$/);
      return match ? match[1] : line;
    })
    .join("\n");

  const newCurrIndex = state.artifact.contents.length + 1;
  const prevContent = state.artifact.contents.find(
    (c) => c.index === state.artifact.currentIndex && c.type === "text"
  ) as ArtifactMarkdownV3 | undefined;
  if (!prevContent) {
    throw new Error("Previous content not found");
  }

  const updated = normalizeCanvasMarkdown(cleanedResponse).trim();
  if (!updated || updated.length < Math.min(blockInDoc.length * 0.25, 40)) {
    return skipWithMessage(
      "The rewrite didn't look like document text — your canvas is unchanged. Try highlighting the section and asking again."
    );
  }

  // Normalize trailing newlines: if blockInDoc ends with \n, ensure the
  // response also does, so the replacement preserves paragraph spacing.
  let responseToUse = updated;
  if (blockInDoc.endsWith("\n") && !responseToUse.endsWith("\n")) {
    responseToUse = `${responseToUse}\n`;
  }
  const newFullMarkdown = fullMarkdown.replace(blockInDoc, responseToUse);
  if (newFullMarkdown === fullMarkdown) {
    return skipWithMessage("No changes were applied to the canvas.");
  }

  const updatedArtifactContent: ArtifactMarkdownV3 = {
    ...prevContent,
    index: newCurrIndex,
    fullMarkdown: newFullMarkdown,
  };

  return {
    artifact: {
      ...state.artifact,
      currentIndex: newCurrIndex,
      contents: [...state.artifact.contents, updatedArtifactContent],
    },
  };
};
