import { z } from "zod";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import {
  createContextDocumentMessages,
  formatArtifactContentWithTemplate,
  getModelFromConfig,
} from "../../../utils.js";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { CURRENT_ARTIFACT_PROMPT, NO_ARTIFACT_PROMPT } from "../../prompts.js";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { getStringFromContent } from "../../../utils.js";
import {
  isCanvasWriteRequest,
  isTargetedEditRequest,
  isWholeDocumentRewriteRequest,
} from "./canvas-direction.js";

export const TEACHING_ROUTE_NAMES = [
  "replyToGeneralInput",
  "integrateCanvasDirection",
  "rewriteArtifact",
  "generateArtifact",
] as const;

export type TeachingRoute = (typeof TEACHING_ROUTE_NAMES)[number];

const TEACHING_INTENT_SCHEMA = z.object({
  route: z
    .enum(TEACHING_ROUTE_NAMES)
    .describe("Graph node to run for this turn."),
  reasoning: z
    .string()
    .describe(
      "One sentence: why this route fits the student's intent this turn."
    ),
});

export type TeachingIntentResult = z.infer<typeof TEACHING_INTENT_SCHEMA>;

const PHASE_ROUTING_RULES: Record<string, string> = {
  socratic: `Phase: Socratic (thesis development).
- DEFAULT: replyToGeneralInput — coaching dialogue only; do not modify the canvas.
- rewriteArtifact ONLY if the student clearly and explicitly asks to rewrite/edit the full document this turn.
- integrateCanvasDirection and generateArtifact: do not use in this phase.`,

  drafting: `Phase: Drafting.
- DEFAULT: replyToGeneralInput — discuss, review, strategize, answer questions. No canvas change unless clearly requested this turn.
- integrateCanvasDirection: student supplies specific content to weave into one existing section (new thesis point, revised wording for part of the doc).
- rewriteArtifact: student explicitly asks to rewrite/rephrase/restructure the whole document.
- generateArtifact: canvas is blank or student asks to draft new content from scratch.`,

  submitted: `Phase: Submitted.
- Always replyToGeneralInput.`,
};

const TEACHING_INTENT_PROMPT = `You route student messages in Evaluchat, an AI writing coach with a chat panel and a canvas document.

Read the full recent conversation — not only the last message. Prior turns establish whether the student wants coaching chat vs canvas edits.

{phaseRules}

## Route definitions
- **replyToGeneralInput**: Coaching only. Questions, feedback, strategy, thinking aloud, reviewing the draft together, disagreeing with prior edits, or declining rewrites ("don't rewrite", "just discuss"). No canvas change.
- **integrateCanvasDirection**: Student directs specific new content into one section of the existing document.
- **rewriteArtifact**: Student explicitly requests a full-document rewrite this turn.
- **generateArtifact**: Blank/near-blank canvas; student wants new drafting on the canvas.

## Critical rules
1. Discussing document topics or strategy is NOT a canvas edit. "I'm wondering if I should target scholarship orgs" → replyToGeneralInput.
2. Negated edit requests ("don't rewrite", "don't change the canvas") → replyToGeneralInput even if the message mentions rewrite/edit.
3. When uncertain, choose replyToGeneralInput.
4. Output via the classify_intent tool only.

## Recent conversation
{recentMessages}

{currentArtifactPrompt}`;

function artifactHasContent(
  state: typeof OpenCanvasGraphAnnotation.State
): boolean {
  const content = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!content) return false;
  const text = content.type === "text" ? content.fullMarkdown : content.code;
  return Boolean(text?.trim());
}

function formatRecentMessages(messages: BaseMessage[], limit = 8): string {
  return messages
    .slice(-limit)
    .map((message) => {
      const role = message.getType();
      const body = getStringFromContent(message.content);
      return `<${role}>\n${body}\n</${role}>`;
    })
    .join("\n\n");
}

interface DetermineTeachingIntentParams {
  state: typeof OpenCanvasGraphAnnotation.State;
  newMessages: BaseMessage[];
  config: LangGraphRunnableConfig;
}

async function determineTeachingIntentFunc({
  state,
  newMessages,
  config,
}: DetermineTeachingIntentParams): Promise<TeachingIntentResult> {
  const phase =
    state.phase_state ||
    (state.apparatusConfiguration &&
    state.apparatusConfiguration.drafting_gate !== undefined &&
    state.apparatusConfiguration.drafting_gate !== "none"
      ? "socratic"
      : "drafting");
  const phaseRules = PHASE_ROUTING_RULES[phase] || PHASE_ROUTING_RULES.socratic;
  const lastMessageContent = getStringFromContent(
    state._messages[state._messages.length - 1]?.content
  );

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;

  const hasContent = artifactHasContent(state);

  const formattedPrompt = TEACHING_INTENT_PROMPT.replace(
    "{phaseRules}",
    phaseRules
  )
    .replace("{recentMessages}", formatRecentMessages(state._messages))
    .replace(
      "{currentArtifactPrompt}",
      currentArtifactContent && hasContent
        ? formatArtifactContentWithTemplate(
            CURRENT_ARTIFACT_PROMPT,
            currentArtifactContent
          )
        : NO_ARTIFACT_PROMPT
    );

  const model = await getModelFromConfig(config, {
    temperature: 0,
    isToolCalling: true,
  });

  const modelWithTool = model.bindTools(
    [
      {
        name: "classify_intent",
        description:
          "Classify the student's intent and select the graph route for this turn.",
        schema: TEACHING_INTENT_SCHEMA,
      },
    ],
    { tool_choice: "auto" }
  );

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const response = await modelWithTool.invoke([
    ...contextDocumentMessages,
    ...(newMessages.length ? newMessages : []),
    { role: "user", content: formattedPrompt },
  ]);

  const parsed = TEACHING_INTENT_SCHEMA.safeParse(
    response.tool_calls?.[0]?.args
  );

  if (!parsed.success) {
    console.warn(
      "[determineTeachingIntent] No valid tool call; defaulting to replyToGeneralInput"
    );
    return {
      route: "replyToGeneralInput",
      reasoning: "Intent unclear — defaulting to coaching chat.",
    };
  }

  let { route, reasoning } = parsed.data;

  if (
    state.apparatusConfiguration?.ai_canvas_actions === false &&
    route !== "replyToGeneralInput"
  ) {
    route = "replyToGeneralInput";
    reasoning = `AI editing actions are disabled — ${reasoning} → coaching chat.`;
  }

  // Phase hard guards (safety net if the model ignores prompt rules).
  if (phase === "socratic" && route !== "replyToGeneralInput") {
    if (route !== "rewriteArtifact") {
      route = "replyToGeneralInput";
      reasoning = `Socratic phase — ${reasoning} → overridden to coaching chat.`;
    }
  }
  if (phase === "submitted") {
    route = "replyToGeneralInput";
    reasoning = "Submitted phase — coaching chat only.";
  }
  if (
    phase === "drafting" &&
    state.apparatusConfiguration?.ai_canvas_actions !== false &&
    isCanvasWriteRequest(lastMessageContent)
  ) {
    route = "generateArtifact";
    reasoning =
      "Explicit canvas-write request in drafting phase — generateArtifact.";
  }
  if (phase === "socratic" && hasContent && route === "generateArtifact") {
    route = "replyToGeneralInput";
    reasoning = `The canvas has content — ${reasoning} → coaching chat.`;
  }
  if (!hasContent && route === "integrateCanvasDirection") {
    route = "generateArtifact";
    reasoning = `Blank canvas — ${reasoning} → generateArtifact.`;
  }

  // SAFETY NET — rewriteArtifact fully replaces the canvas. It is only safe for an
  // explicit whole-document rewrite. Targeted/structural edits ("remove 4.5 and the
  // corresponding reference", "rewrite the conclusion", "fix section 3") routed to
  // rewriteArtifact wiped everything after the target section in production. Re-route.
  if (
    route === "rewriteArtifact" &&
    !isWholeDocumentRewriteRequest(lastMessageContent)
  ) {
    if (isTargetedEditRequest(lastMessageContent) && hasContent) {
      const prevRoute = route;
      route =
        phase === "drafting"
          ? "integrateCanvasDirection"
          : "replyToGeneralInput";
      reasoning = `Targeted section edit, not a full rewrite — ${reasoning} → ${route} (was ${prevRoute}) to avoid a destructive full-document rewrite.`;
    } else {
      route = "replyToGeneralInput";
      reasoning = `Not an explicit whole-document rewrite — ${reasoning} → coaching chat to protect the canvas from a destructive full rewrite.`;
    }
  }

  console.log(
    `[determineTeachingIntent] route=${route} reasoning="${reasoning}"`
  );

  return { route, reasoning };
}

export const determineTeachingIntent = traceable(determineTeachingIntentFunc, {
  name: "determine_teaching_intent",
});
