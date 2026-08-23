import {
  createContextDocumentMessages,
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import { AIMessage } from "@langchain/core/messages";
import { ArtifactMarkdownV3, ArtifactV3 } from "@opencanvas/shared/types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { ARTIFACT_TOOL_SCHEMA } from "./schemas.js";
import { createArtifactContent, formatNewArtifactPrompt } from "./utils.js";
import { z } from "zod";

/**
 * Generate a new artifact based on the user's query.
 * In drafting phase, the LLM can choose to just chat (no artifact).
 */
export const generateArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelName } = getModelConfig(config, {
    isToolCalling: true,
  });
  const smallModel = await getModelFromConfig(config, {
    temperature: 0.5,
    isToolCalling: true,
  });

  // In drafting phase, don't force tool_choice — let LLM decide
  // whether to generate an artifact or just chat
  const isDraftingPhase = state.phase_state === "drafting";

  const modelWithArtifactTool = smallModel.bindTools(
    [
      {
        name: "generate_artifact",
        description:
          ARTIFACT_TOOL_SCHEMA.description +
          "\n\nCall this tool when the student asks you to write, draft, create, or generate content for the canvas. If the student is asking a question or having a conversation (not requesting canvas content), do NOT call this tool — just respond with text.",
        schema: ARTIFACT_TOOL_SCHEMA,
      },
    ],
    isDraftingPhase
      ? { tool_choice: "auto" } // Let LLM decide: chat or canvas
      : { tool_choice: "auto" }
  );

  const memoriesAsString = await getFormattedReflections(config);
  const formattedNewArtifactPrompt = formatNewArtifactPrompt(
    memoriesAsString,
    modelName,
    state.phase_state
  );

  // In drafting phase, include existing canvas content so the LLM can build on it
  let existingCanvasContext = "";
  if (isDraftingPhase && state.artifact?.contents?.length) {
    const existingMarkdown = state.artifact.contents
      .filter((c) => c.type === "text" && (c as any).fullMarkdown?.trim())
      .map((c) => (c as any).fullMarkdown)
      .join("\n\n");
    if (existingMarkdown) {
      // Add line numbers for AI reference
      const numberedContent = existingMarkdown
        .split("\n")
        .map((line: string, idx: number) => `${idx + 1}\t${line}`)
        .join("\n");
      existingCanvasContext = `\n\n## Current essay on the canvas with line numbers (IMPORTANT: read this carefully)
${numberedContent}

## Instructions for generating the NEXT section
The essay above is already written on the canvas. You must:
1. Generate ONLY the new section that should follow — do NOT repeat any existing content.
2. Keep the same title as the existing artifact.
3. The new section should flow naturally from where the essay currently ends.
4. Do NOT include a title, heading, or introduction in your new content — just the body text of the next section.
5. Write in the same voice and style as the existing content.`;
    }
  }

  // Add cursor context if available
  let cursorContext = "";
  if (state.cursorPosition) {
    cursorContext = `\n\nThe user's cursor is at line ${state.cursorPosition.line}, column ${state.cursorPosition.column}. The document has ${state.cursorPosition.totalLines} lines total.`;
    if (state.cursorPosition.selectedText) {
      cursorContext += `\nThe user has selected the following text:\n<selected-text>\n${state.cursorPosition.selectedText}\n</selected-text>`;
    }
  }

  const userSystemPrompt = optionallyGetSystemPromptFromConfig(config);
  const fullSystemPrompt = userSystemPrompt
    ? `${userSystemPrompt}\n${formattedNewArtifactPrompt}${existingCanvasContext}${cursorContext}`
    : `${formattedNewArtifactPrompt}${existingCanvasContext}${cursorContext}`;

  const finalSystemPrompt = fullSystemPrompt;

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const isO1MiniModel = isUsingO1MiniModel(config);
  const response = await modelWithArtifactTool.invoke(
    [
      { role: isO1MiniModel ? "user" : "system", content: finalSystemPrompt },
      ...contextDocumentMessages,
      ...state._messages,
    ],
    { runName: "generate_artifact" }
  );

  const args = response.tool_calls?.[0]?.args as
    | z.infer<typeof ARTIFACT_TOOL_SCHEMA>
    | undefined;

  console.log(
    `[generateArtifact] isDrafting=${isDraftingPhase}, tool_calls=${response.tool_calls?.length || 0}, hasArgs=${!!args}, content_length=${typeof response.content === "string" ? response.content.length : "complex"}`
  );

  // In drafting phase, if LLM didn't generate an artifact, return as chat message
  if (isDraftingPhase && !args) {
    return {
      messages: [response],
      _messages: [response],
    };
  }

  if (!args) {
    throw new Error("No args found in response");
  }

  const newArtifactContent = createArtifactContent(args);

  // In drafting phase, concatenate new section with existing content
  // so the canvas shows the full accumulated essay (not just the latest section).
  // Each version in history = essay at that stage (back/forward = earlier/later draft).
  let newArtifact: ArtifactV3;
  if (
    isDraftingPhase &&
    state.artifact?.contents?.length &&
    state.artifact.contents.some(
      (c) => c.type === "text" && (c as any).fullMarkdown?.trim()
    )
  ) {
    // Get the current (latest) content's full markdown
    const currentContent = state.artifact.contents.find(
      (c) => c.index === state.artifact.currentIndex
    );
    const existingMarkdown =
      currentContent?.type === "text"
        ? (currentContent as any).fullMarkdown || ""
        : "";

    // New section markdown from the tool call
    const newSectionMarkdown =
      newArtifactContent.type === "text"
        ? (newArtifactContent as any).fullMarkdown || ""
        : (newArtifactContent as any).code || "";

    // Concatenate: existing full essay + new section
    const combinedMarkdown = existingMarkdown.trim()
      ? `${existingMarkdown.trim()}\n\n${newSectionMarkdown.trim()}`
      : newSectionMarkdown.trim();

    const nextIndex = state.artifact.contents.length + 1;
    const combinedContent: ArtifactMarkdownV3 = {
      index: nextIndex,
      type: "text",
      title:
        (newArtifactContent as any).title ||
        (currentContent as any)?.title ||
        "Essay",
      fullMarkdown: combinedMarkdown,
    };
    console.log(
      `[generateArtifact] CONCAT: existing=${existingMarkdown.length} + new=${newSectionMarkdown.length} = combined=${combinedMarkdown.length} chars`
    );
    newArtifact = {
      currentIndex: nextIndex,
      contents: [...state.artifact.contents, combinedContent],
    };
  } else {
    // Fresh artifact
    newArtifact = {
      currentIndex: 1,
      contents: [newArtifactContent],
    };
  }

  // Strip tool_calls from the history message to prevent malformed
  // message sequences on subsequent API calls. The OpenAI API requires
  // a ToolMessage immediately after an AIMessage with tool_calls, but
  // our graph adds generateFollowup (another assistant message) after
  // generateArtifact, breaking that contract.
  const cleanHistoryMessage = new AIMessage({
    content:
      typeof response.content === "string" && response.content.trim()
        ? response.content
        : `Generated ${args.type === "code" ? "code" : "artifact"}: "${args.title}".`,
    // Intentionally omit tool_calls
  });

  return {
    artifact: newArtifact,
    messages: [response], // Original with tool_calls → UI
    _messages: [cleanHistoryMessage], // Clean → future model calls
  };
};
