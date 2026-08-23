import { BaseMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { TeachingPhase, ThesisAssessment } from "@opencanvas/shared/types";
import z from "zod";
import {
  getModelFromConfig,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { detectHollowInput } from "../hollow-input.js";

/**
 * After this many visible human messages, auto-pass the thesis.
 * This prevents the student from getting permanently stuck in Socratic mode.
 */
const DEFAULT_ESCAPE_HATCH_THRESHOLD = 4;

const THESIS_ASSESSMENT_PROMPT = `You evaluate whether a student has articulated a defensible thesis for their writing assignment.

The student is in Phase 1 (Socratic gatekeeper). They must develop their own arguable thesis through chat before drafting on the canvas.

## Assignment context (coach system prompt excerpt)
{assignmentContext}

## Recent student messages (oldest to newest)
{studentMessages}

## Criteria for passed = true
Be GENEROUS. The student must have demonstrated some genuine understanding:
- The student has stated a position or claim about the topic (even if informal or conversational).
- The student has expressed a specific interpretive angle (e.g. "the title is ironic", "expectations are a curse").
- The student has provided at least one piece of supporting evidence or a specific example from the text.

IMPORTANT: PASS if:
- The student has made a clear interpretive claim, even in casual language.
- The student has committed to a position after 2+ exchanges about the topic.
- The student has given a response that shows they've read and thought about the text.
- The claim is arguable (someone could disagree with it).

When in doubt, PASS. It is better to let the student start writing and refine later than to trap them in endless questioning.

## Criteria for passed = false
- Only greetings, vibe-check answers, or pure plot summary without any interpretive claim.
- No topic or position expressed at all (e.g. just "hi" or "I don't know").
- The student has said literally nothing substantive about the topic after multiple exchanges.

When in doubt, PASS. It is better to let the student start writing and refine later than to trap them in endless questioning.

Respond with structured assessment only.`;

export function isSocraticPhase(
  phaseState: TeachingPhase | undefined
): boolean {
  return phaseState === undefined || phaseState === "socratic";
}

function visibleHumanMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((m) => {
    // Handle both HumanMessage class instances and plain objects from checkpoint
    const msgType =
      typeof m.getType === "function" ? m.getType() : (m as any).type;
    if (msgType !== "human") return false;
    const kwargs = m.additional_kwargs as Record<string, unknown> | undefined;
    return kwargs?.[OC_HIDE_FROM_UI_KEY] !== true;
  });
}

/**
 * After a Socratic chat turn, evaluate whether the student's thesis is ready
 * for the drafting phase. No-op outside assignment mode or after socratic phase.
 */
export async function assessThesis(
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> {
  const assignmentContext = optionallyGetSystemPromptFromConfig(config);
  if (!assignmentContext) {
    return {};
  }

  const apparatus = state.apparatusConfiguration;
  if (
    !apparatus ||
    apparatus.ai_assistance === false ||
    apparatus.drafting_gate === "none" ||
    apparatus.drafting_gate === undefined
  ) {
    return {
      thesis: {
        passed: true,
        feedback: "Drafting gate disabled by the apparatus profile.",
      },
      phase_state: "drafting",
    };
  }

  // Only run thesis assessment in socratic phase
  if (!isSocraticPhase(state.phase_state)) {
    return {};
  }

  const studentMessages = visibleHumanMessages(state._messages);
  if (!studentMessages.length) {
    return {};
  }

  // Escape hatch: if the student has been chatting long enough, auto-pass.
  // This prevents getting permanently stuck in Socratic mode.
  const threshold =
    Number.isInteger(apparatus?.threshold) && (apparatus?.threshold ?? 0) > 0
      ? apparatus!.threshold
      : DEFAULT_ESCAPE_HATCH_THRESHOLD;
  if (studentMessages.length >= threshold) {
    const lastStudentMsg = studentMessages[studentMessages.length - 1];
    const lastContent =
      typeof lastStudentMsg.content === "string"
        ? lastStudentMsg.content
        : lastStudentMsg.content == null
          ? ""
          : (JSON.stringify(lastStudentMsg.content) ?? "");

    if (detectHollowInput(lastContent)) {
      return {
        thesis: {
          passed: false,
          feedback:
            "Placeholder detected — ask the student to elaborate before unlocking drafting.",
        },
      };
    }

    return {
      thesis: {
        passed: true,
        feedback: `Auto-approved after ${studentMessages.length} student messages to prevent Socratic loop.`,
        thesis: lastContent.slice(0, 200),
      },
      phase_state: "drafting",
    };
  }

  const recentStudentText = studentMessages
    .slice(-6)
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    )
    .join("\n\n---\n\n");

  const model = await getModelFromConfig(config, {
    temperature: 0,
    isToolCalling: true,
  });

  const schema = z.object({
    passed: z
      .boolean()
      .describe(
        "True when the student has articulated a defensible thesis in their own words."
      ),
    feedback: z
      .string()
      .describe(
        "One or two sentences for internal state: why pass or what is still missing."
      ),
    thesis: z
      .string()
      .optional()
      .describe(
        "The student's thesis as one sentence, if they stated one; omit if none yet."
      ),
  });

  const modelWithTool = model.bindTools(
    [
      {
        name: "assess_thesis",
        description: "Thesis gate assessment for the Socratic phase.",
        schema,
      },
    ],
    { tool_choice: "auto" }
  );

  const prompt = THESIS_ASSESSMENT_PROMPT.replace(
    "{assignmentContext}",
    assignmentContext.slice(0, 4000)
  ).replace("{studentMessages}", recentStudentText);

  const result = await modelWithTool.invoke([
    { role: "user", content: prompt },
  ]);

  const args = result.tool_calls?.[0]?.args as
    | z.infer<typeof schema>
    | undefined;
  if (!args) {
    return {};
  }

  const thesis: ThesisAssessment = {
    passed: args.passed,
    feedback: args.feedback,
    ...(args.thesis?.trim() ? { thesis: args.thesis.trim() } : {}),
  };

  if (thesis.passed) {
    return { thesis, phase_state: "drafting" };
  }

  return { thesis };
}
