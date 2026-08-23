import {
  getArtifactContent,
  isArtifactCodeContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ProgrammingLanguageOptions,
  EditorCursorPosition,
} from "@opencanvas/shared/types";
import {
  OPTIONALLY_UPDATE_META_PROMPT,
  UPDATE_ENTIRE_ARTIFACT_PROMPT,
} from "../../prompts.js";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { z } from "zod";
import { OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA } from "./schemas.js";

export const validateState = (
  state: typeof OpenCanvasGraphAnnotation.State
) => {
  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    throw new Error("No recent human message found");
  }

  return { currentArtifactContent, recentHumanMessage };
};

/**
 * Add line numbers to artifact content so the AI can reference specific lines.
 * Format: "N\t<line content>" where N is the 1-based line number.
 * Line numbers are separated from content by a tab character.
 */
export const addLineNumbers = (content: string): string => {
  return content
    .split("\n")
    .map((line, idx) => `${idx + 1}\t${line}`)
    .join("\n");
};

const buildMetaPrompt = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>
) => {
  const titleSection =
    artifactMetaToolCall?.title && artifactMetaToolCall?.type !== "code"
      ? `And its title is (do NOT include this in your response):\n${artifactMetaToolCall.title}`
      : "";

  return OPTIONALLY_UPDATE_META_PROMPT.replace(
    "{artifactType}",
    artifactMetaToolCall?.type
  ).replace("{artifactTitle}", titleSection);
};

interface BuildPromptArgs {
  artifactContent: string;
  memoriesAsString: string;
  isNewType: boolean;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
  cursorPosition?: EditorCursorPosition;
}

export const buildPrompt = ({
  artifactContent,
  memoriesAsString,
  isNewType,
  artifactMetaToolCall,
  cursorPosition,
}: BuildPromptArgs) => {
  const metaPrompt = isNewType ? buildMetaPrompt(artifactMetaToolCall) : "";

  // Add line numbers to artifact content
  const numberedContent = addLineNumbers(artifactContent);

  // Build cursor context string
  let cursorContext = "";
  if (cursorPosition) {
    cursorContext = `\nThe user's cursor is at line ${cursorPosition.line}, column ${cursorPosition.column}.\n`;
    cursorContext += `The document has ${cursorPosition.totalLines} lines total.\n`;
    if (cursorPosition.selectedText) {
      cursorContext += `The user has selected the following text:\n<selected-text>\n${cursorPosition.selectedText}\n</selected-text>\n`;
    }
  }

  return UPDATE_ENTIRE_ARTIFACT_PROMPT.replace(
    "{artifactContent}",
    numberedContent
  )
    .replace("{reflections}", memoriesAsString)
    .replace("{updateMetaPrompt}", metaPrompt)
    .replace("{cursorContext}", cursorContext);
};

interface CreateNewArtifactContentArgs {
  artifactType: string;
  state: typeof OpenCanvasGraphAnnotation.State;
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
  newContent: string;
}

const getLanguage = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>,
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3 // Replace 'any' with proper type
) =>
  artifactMetaToolCall?.language ||
  (isArtifactCodeContent(currentArtifactContent)
    ? currentArtifactContent.language
    : "other");

export const createNewArtifactContent = ({
  artifactType,
  state,
  currentArtifactContent,
  artifactMetaToolCall,
  newContent,
}: CreateNewArtifactContentArgs): ArtifactCodeV3 | ArtifactMarkdownV3 => {
  const baseContent = {
    index: state.artifact.contents.length + 1,
    title: artifactMetaToolCall?.title || currentArtifactContent.title,
  };

  if (artifactType === "code") {
    return {
      ...baseContent,
      type: "code",
      language: getLanguage(
        artifactMetaToolCall,
        currentArtifactContent
      ) as ProgrammingLanguageOptions,
      code: newContent,
    };
  }

  return {
    ...baseContent,
    type: "text",
    fullMarkdown: newContent,
  };
};
