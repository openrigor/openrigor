import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { BaseMessageLike } from "@langchain/core/messages";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import { normalizeCanvasMarkdown } from "@opencanvas/shared/utils/markdown-canvas";
import {
  buildSectionIndex,
  insertAfterSection,
  resolveSectionHint,
  spliceSection,
  type MarkdownSection,
} from "@opencanvas/shared/utils/markdown-sections";
import { ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { z } from "zod";
import {
  createContextDocumentMessages,
  getModelFromConfig,
  getStringFromContent,
  isUsingO1MiniModel,
} from "../../../utils.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";

const INTEGRATE_SECTION_SCHEMA = z.object({
  targetSectionHint: z
    .string()
    .describe(
      "Short locate hint: the section heading text, optionally plus the first few words of its body. Do NOT copy the full section verbatim."
    ),
  updatedSection: z
    .string()
    .describe(
      "For replace: full updated section markdown (heading + body). For insert: the NEW section markdown only (including its heading). Document prose — never a chat message to the student."
    ),
  insertAfterHint: z
    .string()
    .optional()
    .describe(
      "When adding a section that does not exist yet: short hint for the section to insert AFTER (e.g. heading of 4.5)."
    ),
  newHeading: z
    .string()
    .optional()
    .describe(
      "When inserting: the new section's heading text (e.g. '4.6 New point'). Prefer including the heading inside updatedSection as well."
    ),
});

const INTEGRATE_CANVAS_DIRECTION_PROMPT = `You integrate a student's content direction into ONE section of their draft on the canvas.

Here is the full document:
<document>
{artifactContent}
</document>

Your task:
1. Identify the single section that best matches the student's latest message (usually where they want their idea reflected).
2. Set targetSectionHint to a SHORT locate string: the heading text, optionally plus the first few words of that section's body. Do NOT copy the whole section.
3. Write updatedSection: the full updated section markdown (heading + body) with their direction woven in. Keep surrounding structure and tone.

When the student asks to ADD a section that does not exist (e.g. "add point 4.6"):
- Set insertAfterHint to the heading of the section it should follow (e.g. "4.5 Formative assessment").
- Set newHeading to the new heading text (e.g. "4.6 …").
- Set updatedSection to the NEW section markdown only (including its heading).
- targetSectionHint may repeat insertAfterHint or the new heading — insertAfterHint is what locates the insert point.

Rules:
- Prefer the integrate_section tool. If you cannot identify which section to change, reply with a short clarifying question as plain text instead of guessing.
- updatedSection must be document markdown, NOT a reply to the student.
- Change only the targeted section (or insert one new section); do not summarize the whole document.
- Never paste a long verbatim copy of an existing section into targetSectionHint.
`;

/** Short affirmatives that need the prior AI proposal for context. */
const ACK_RE =
  /^(yes|yep|yeah|yup|ok|okay|sure|please|please do|do it|go ahead|sounds good|that works|yes please|ok please)[.!?]*$/i;

function isShortAck(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 40) return false;
  return ACK_RE.test(trimmed);
}

/** Heading the model intends to write, from newHeading or the section's own first line. */
function headingTextOf(
  newHeading: string | undefined,
  updatedSection: string
): string {
  const explicit = newHeading?.trim();
  if (explicit) {
    return explicit.replace(/^#+\s*/, "").trim();
  }
  const firstLine = updatedSection.trim().split("\n", 1)[0] ?? "";
  const match = firstLine.match(/^#{1,6}\s+(.+?)\s*$/);
  return match ? match[1].trim() : "";
}

function skipWithMessage(message: string): OpenCanvasGraphReturnType {
  return {
    textEditSummary: {
      op: "replace_in_selection",
      error: message,
    },
  };
}

function formatLocateFailure(
  hint: string,
  resolved: ReturnType<typeof resolveSectionHint>
): string {
  const candidates =
    !resolved.ok && resolved.candidates?.length
      ? resolved.candidates.map((c) => `"${c.headingText}"`).join(", ")
      : "";
  const bestGuess = candidates ? ` Closest heading(s): ${candidates}.` : "";
  return (
    `I couldn't confidently locate the section matching "${hint.trim()}".` +
    bestGuess +
    " Your document is unchanged. Highlight the paragraph, name the section heading, or ask me to add a new section after a specific heading (e.g. after 4.5)."
  );
}

function bumpArtifact(
  state: typeof OpenCanvasGraphAnnotation.State,
  newFullMarkdown: string
): OpenCanvasGraphReturnType {
  const newCurrIndex = state.artifact.contents.length + 1;
  const prevContent = state.artifact.contents.find(
    (c) => c.index === state.artifact.currentIndex && c.type === "text"
  ) as ArtifactMarkdownV3 | undefined;
  if (!prevContent) {
    return skipWithMessage(
      "I couldn't update the canvas — document state was inconsistent."
    );
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
}

function applyReplace(
  fullMarkdown: string,
  section: MarkdownSection,
  updatedSection: string
): OpenCanvasGraphReturnType | { markdown: string } {
  const updated = normalizeCanvasMarkdown(updatedSection).trim();
  const spanLen = section.end - section.start;
  if (!updated || updated.length < Math.min(spanLen * 0.4, 80)) {
    return skipWithMessage(
      "The update didn't look like document text — your canvas is unchanged."
    );
  }

  const spliced = spliceSection(fullMarkdown, section, updated);
  if (!spliced.ok) {
    return skipWithMessage(
      `${spliced.error} Your document is unchanged. Highlight the section or name its heading and ask again.`
    );
  }
  if (spliced.markdown === fullMarkdown) {
    return skipWithMessage("No changes were applied to the canvas.");
  }
  return { markdown: spliced.markdown };
}

/**
 * Update one document section from substantive student direction (drafting phase).
 * Avoids full-document rewriteArtifact, which can replace the canvas with chat text.
 */
export const integrateCanvasDirection = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (
    !currentArtifactContent ||
    !isArtifactMarkdownContent(currentArtifactContent)
  ) {
    return skipWithMessage(
      "I couldn't update the canvas — please highlight the section you want changed and ask again."
    );
  }

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    return skipWithMessage(
      "I couldn't update the canvas — no message to apply."
    );
  }

  const fullMarkdown = normalizeCanvasMarkdown(
    currentArtifactContent.fullMarkdown
  );
  const formattedPrompt = INTEGRATE_CANVAS_DIRECTION_PROMPT.replace(
    "{artifactContent}",
    fullMarkdown
  );

  const baseModel = await getModelFromConfig(config, {
    isToolCalling: true,
  });
  const toolCallingModel = baseModel
    .bindTools(
      [
        {
          name: "integrate_section",
          description:
            "Locate one document section by short hint and replace it, or insert a new section after another.",
          schema: INTEGRATE_SECTION_SCHEMA,
        },
      ],
      { tool_choice: "auto" }
    )
    .withConfig({ runName: "integrate_canvas_direction" });

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const isO1MiniModel = isUsingO1MiniModel(config);

  const humanText = getStringFromContent(recentHumanMessage.content);
  const invokeMessages: BaseMessageLike[] = [
    {
      role: isO1MiniModel ? "user" : "system",
      content: formattedPrompt,
    },
    ...contextDocumentMessages,
  ];

  // Phase 1: short acks need the preceding AI proposal so the model knows what to edit.
  if (isShortAck(humanText)) {
    const humanIndex = state._messages.findLastIndex(
      (m) => m.getType() === "human"
    );
    for (let i = humanIndex - 1; i >= 0; i--) {
      const prev = state._messages[i];
      if (prev.getType() === "ai") {
        invokeMessages.push(prev);
        break;
      }
    }
  }

  invokeMessages.push(recentHumanMessage);

  const response = await toolCallingModel.invoke(invokeMessages);

  const toolCall = response.tool_calls?.[0];
  const parsed = INTEGRATE_SECTION_SCHEMA.safeParse(toolCall?.args);
  if (!parsed.success) {
    // Phase 1: surface model clarification text instead of a dead-end.
    const modelText = getStringFromContent(response.content).trim();
    if (modelText) {
      return skipWithMessage(modelText);
    }
    return skipWithMessage(
      "I couldn't safely update the canvas — your document is unchanged. Try highlighting the section and asking again."
    );
  }

  const { targetSectionHint, updatedSection, insertAfterHint, newHeading } =
    parsed.data;

  const index = buildSectionIndex(fullMarkdown);

  // Insert path: add a new section after insertAfterHint.
  // Models also set insertAfterHint when rewriting an existing section, which
  // would append a second copy of it — so only insert when the target heading
  // is genuinely absent, otherwise fall through and replace it.
  const proposedHeading = headingTextOf(newHeading, updatedSection);
  const alreadyPresent = proposedHeading
    ? resolveSectionHint(index, proposedHeading, fullMarkdown)
    : undefined;

  if (insertAfterHint?.trim() && !alreadyPresent?.ok) {
    const afterResolved = resolveSectionHint(
      index,
      insertAfterHint,
      fullMarkdown
    );
    if (!afterResolved.ok) {
      return skipWithMessage(
        formatLocateFailure(insertAfterHint, afterResolved)
      );
    }

    let toInsert = normalizeCanvasMarkdown(updatedSection).trim();
    if (newHeading?.trim()) {
      const headingLine = newHeading.trim().startsWith("#")
        ? newHeading.trim()
        : `### ${newHeading.trim()}`;
      if (!toInsert.includes(newHeading.trim().replace(/^#+\s*/, ""))) {
        toInsert = `${headingLine}\n\n${toInsert}`;
      }
    }
    if (!toInsert) {
      return skipWithMessage(
        "The insert content was empty — your canvas is unchanged."
      );
    }

    const inserted = insertAfterSection(
      fullMarkdown,
      afterResolved.section,
      toInsert
    );
    if (!inserted.ok) {
      return skipWithMessage(
        `${inserted.error} Your document is unchanged. Name the section to insert after and try again.`
      );
    }
    return bumpArtifact(state, inserted.markdown);
  }

  // Replace path: hint → resolve → validate → splice
  const resolved = alreadyPresent?.ok
    ? alreadyPresent
    : resolveSectionHint(index, targetSectionHint, fullMarkdown);
  if (!resolved.ok) {
    return skipWithMessage(formatLocateFailure(targetSectionHint, resolved));
  }

  const applied = applyReplace(fullMarkdown, resolved.section, updatedSection);
  if ("markdown" in applied) {
    return bumpArtifact(state, applied.markdown);
  }
  return applied;
};
