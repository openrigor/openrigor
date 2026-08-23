import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { getModelFromConfig } from "../../utils.js";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import { Reflections } from "@opencanvas/shared/types";
import { ensureStoreInConfig, formatReflections } from "../../utils.js";
import { FOLLOWUP_ARTIFACT_PROMPT } from "../prompts.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

/**
 * Generate a followup message after generating or updating an artifact.
 */
export const generateFollowup = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  if (state.textEditSummary?.op === "replace_all") {
    const { find, replace, matchCount } = state.textEditSummary;
    const content =
      matchCount === 0
        ? `I couldn't find "${find}" in the document.`
        : `Replaced ${matchCount} occurrence(s) of "${find}" with "${replace}".`;
    const message = new AIMessage(content);
    return {
      messages: [message],
      _messages: [message],
    };
  }

  if (
    state.textEditSummary?.op === "replace_in_selection" &&
    "error" in state.textEditSummary
  ) {
    const message = new AIMessage(state.textEditSummary.error);
    return {
      messages: [message],
      _messages: [message],
    };
  }

  if (state.textEditSummary?.op === "replace_in_selection") {
    const { find, replace, matchCount } = state.textEditSummary;
    const message = new AIMessage(
      `Replaced ${matchCount} occurrence(s) of "${find}" with "${replace}" in the selection.`
    );
    return {
      messages: [message],
      _messages: [message],
    };
  }

  const smallModel = await getModelFromConfig(config, {
    maxTokens: 250,
    // We say tool calling is true here because that'll cause it to use a small model
    isToolCalling: true,
  });

  const store = ensureStoreInConfig(config);
  const assistantId = config.configurable?.assistant_id;
  if (!assistantId) {
    throw new Error("`assistant_id` not found in configurable");
  }
  const memoryNamespace = [
    "memories",
    config.configurable?.supabase_user_id ?? "anonymous",
    assistantId,
  ];
  const memoryKey = "reflection";
  const memories = await store.get(memoryNamespace, memoryKey);
  const memoriesAsString = memories?.value
    ? formatReflections(memories.value as Reflections, {
        onlyContent: true,
      })
    : "No reflections found.";

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;

  const artifactContent = currentArtifactContent
    ? isArtifactMarkdownContent(currentArtifactContent)
      ? currentArtifactContent.fullMarkdown
      : currentArtifactContent.code
    : undefined;

  // Add phase-specific instructions for teaching mode
  let phaseInstructions = "";
  if (state.phase_state === "drafting") {
    phaseInstructions = `

## Teaching Mode: Drafting Phase
You just generated content on the canvas for a student. Your followup should:
- Reference what you drafted (e.g., "I've drafted your introduction" or "Look at the canvas—I've taken your thoughts and written the first section")
- Mention that they should review it and let you know if it captures their argument
- Ask if they want to continue with the next section or make adjustments
- Keep it conversational and encouraging (2-3 sentences max)
- Match the tone from the Leo transcript: supportive but direct`;
  }

  const formattedPrompt = (FOLLOWUP_ARTIFACT_PROMPT + phaseInstructions)
    .replace(
      "{artifactContent}",
      artifactContent || "No artifacts generated yet."
    )
    .replace("{reflections}", memoriesAsString)
    .replace(
      "{conversation}",
      state._messages
        .map((msg) => `<${msg.getType()}>\n${msg.content}\n</${msg.getType()}>`)
        .join("\n\n")
    );

  // TODO: Include the chat history as well.
  const response = await smallModel.invoke([
    { role: "user", content: formattedPrompt },
  ]);

  return {
    messages: [response],
    _messages: [response],
  };
};
