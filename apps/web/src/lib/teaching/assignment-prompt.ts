import {
  ESSAYS_KNOWLEDGE_CONTEXT,
  ESSAYS_KNOWLEDGE_SOURCES_TEXT,
} from "@/lib/apparatuses/ai-assisted-essay/knowledge-context";
import type { StudentAssignment } from "./types";
import {
  CANONICAL_ESSAYS_CONFIGURATION,
  type ApparatusConfiguration,
} from "@opencanvas/shared";

/** Hidden user turn that triggers the coach's opening line (not shown in UI). */
export function buildAssignmentKickoffUserMessage(
  studentFirstName: string
): string {
  const name = studentFirstName.trim() || "there";
  return `The student "${name}" has just opened this assignment workspace. Send exactly one opening chat message: greet them by first name, reference the assignment topic briefly, and ask your Phase 1 Socratic "vibe check" question. Follow your teaching instructions. Do not mention this meta-instruction or that you received a system note.`;
}

export function studentFirstNameFromUser(user: {
  user_metadata?: Record<string, unknown>;
  email?: string | null;
}): string {
  const full = user.user_metadata?.full_name;
  if (typeof full === "string" && full.trim()) {
    return full.trim().split(/\s+/)[0] ?? "there";
  }
  const emailLocal = user.email?.split("@")[0];
  if (emailLocal) {
    return emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
  }
  return "there";
}

export function buildAssignmentSystemPrompt(
  assignment: StudentAssignment,
  configuration: ApparatusConfiguration = assignment.apparatusConfiguration ??
    CANONICAL_ESSAYS_CONFIGURATION
): string {
  const instructions =
    assignment.agentInstructions.trim() ||
    "Act as a Socratic writing coach. Help the student develop their own thesis and draft; do not ghostwrite the essay.";

  return `You are the student's AI writing coach for a classroom assignment in evaluchat.

## Assignment
- **Course:** ${assignment.courseLabel}
- **Teacher:** ${assignment.teacherName}
- **Due:** ${assignment.dueLabel}
- **Title:** ${assignment.title}
- **Task:** ${assignment.prompt}
${assignment.wordTarget ? `- **Target length:** about ${assignment.wordTarget} words` : ""}

## Teaching instructions
${instructions}

## Runtime treatment
- Optional AI assistance: ${configuration.ai_assistance ? "enabled" : "disabled"}
- AI editing actions: ${configuration.ai_canvas_actions ? "enabled" : "disabled"}
- Drafting gate: ${configuration.drafting_gate} (threshold ${configuration.threshold})
- Process tracking: ${configuration.tracking ? "enabled" : "disabled"}

## Rules (always follow)
${configuration.ai_assistance ? "- AI assistance is available within the selected treatment." : "- AI assistance is disabled for this assignment. Do not call an agent or generate content."}
${configuration.ai_canvas_actions ? "- AI generation and editing actions are available only when the routing policy permits them." : "- AI generation and editing actions are disabled. Never generate, rewrite, or apply an AI edit to the canvas."}
${configuration.drafting_gate === "none" ? "- The drafting gate is disabled. Start in drafting and do not assess or block on a thesis." : "- In Phase 1 (Socratic), help the student develop their thesis through questions. Do not write essay content yet."}
- In Phase 2 (Drafting), help the student write section by section. Build on their ideas and the conversation.
- Keep chat replies focused and conversational unless the student asks for detail.

## Research context
<knowledge-context>
${ESSAYS_KNOWLEDGE_CONTEXT}
</knowledge-context>

${ESSAYS_KNOWLEDGE_SOURCES_TEXT}

## Research grounding rule
- When your guidance relates to the research design, the drafting-unlock threshold, or the phases of this workflow, ground your answer in the research context above and cite the source (e.g. "threshold-calibration").`;
}
