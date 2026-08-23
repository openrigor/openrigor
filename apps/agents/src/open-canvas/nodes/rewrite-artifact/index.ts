import { v4 as uuidv4 } from "uuid";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { optionallyUpdateArtifactMeta } from "./update-meta.js";
import {
  buildPrompt,
  createNewArtifactContent,
  validateState,
} from "./utils.js";
import {
  createContextDocumentMessages,
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import { isArtifactMarkdownContent } from "@opencanvas/shared/utils/artifacts";
import { isPlausibleFullArtifactRewrite } from "@opencanvas/shared/utils/markdown-canvas";
import { AIMessage } from "@langchain/core/messages";
import {
  extractThinkingAndResponseTokens,
  isThinkingModel,
} from "@opencanvas/shared/utils/thinking";

export const rewriteArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelName } = getModelConfig(config);
  const smallModelWithConfig = (await getModelFromConfig(config)).withConfig({
    runName: "rewrite_artifact_model_call",
  });
  const memoriesAsString = await getFormattedReflections(config);
  const { currentArtifactContent, recentHumanMessage } = validateState(state);

  const artifactMetaToolCall = await optionallyUpdateArtifactMeta(
    state,
    config
  );
  const artifactType = artifactMetaToolCall.type;
  const isNewType = artifactType !== currentArtifactContent.type;

  const artifactContent = isArtifactMarkdownContent(currentArtifactContent)
    ? currentArtifactContent.fullMarkdown
    : currentArtifactContent.code;

  const formattedPrompt = buildPrompt({
    artifactContent,
    memoriesAsString,
    isNewType,
    artifactMetaToolCall,
    cursorPosition: state.cursorPosition,
  });

  const userSystemPrompt = optionallyGetSystemPromptFromConfig(config);
  const fullSystemPrompt = userSystemPrompt
    ? `${userSystemPrompt}\n${formattedPrompt}`
    : formattedPrompt;

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const isO1MiniModel = isUsingO1MiniModel(config);
  const newArtifactResponse = await smallModelWithConfig.invoke([
    { role: isO1MiniModel ? "user" : "system", content: fullSystemPrompt },
    ...contextDocumentMessages,
    recentHumanMessage,
  ]);

  let thinkingMessage: AIMessage | undefined;
  let artifactContentText = newArtifactResponse.content as string;

  if (isThinkingModel(modelName)) {
    const { thinking, response } =
      extractThinkingAndResponseTokens(artifactContentText);
    thinkingMessage = new AIMessage({
      id: `thinking-${uuidv4()}`,
      content: thinking,
    });
    artifactContentText = response;
  }

  if (
    isArtifactMarkdownContent(currentArtifactContent) &&
    !isPlausibleFullArtifactRewrite(artifactContent, artifactContentText)
  ) {
    return {
      textEditSummary: {
        op: "replace_in_selection",
        error:
          "I couldn't safely rewrite the full document — your canvas is unchanged. Try highlighting the section you want updated.",
      },
      messages: [...(thinkingMessage ? [thinkingMessage] : [])],
      _messages: [...(thinkingMessage ? [thinkingMessage] : [])],
    };
  }

  const newArtifactContent = createNewArtifactContent({
    artifactType,
    state,
    currentArtifactContent,
    artifactMetaToolCall,
    newContent: artifactContentText as string,
  });

  return {
    artifact: {
      ...state.artifact,
      currentIndex: state.artifact.contents.length + 1,
      contents: [...state.artifact.contents, newArtifactContent],
    },
    messages: [...(thinkingMessage ? [thinkingMessage] : [])],
    _messages: [...(thinkingMessage ? [thinkingMessage] : [])],
  };
};
