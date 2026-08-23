export const ESSAYS_KNOWLEDGE_CONTEXT = `The essays workflow is a research apparatus ("Apparatus #1", CAMDLE design). It is a constrained AI chat paired with a drafting canvas: drafting support is released conditionally, only after the student has contributed enough ideas, evidence, questions, and language through dialogue.

Phases: socratic (the AI interviews the student to establish a thesis; direct "write my essay" requests are rejected; an assess-thesis gate transitions to drafting when contribution is sufficient), drafting (milestone-gated co-creation on a split-screen canvas; the AI acts as a developmental editor, not a ghostwriter; a revision timeline distinguishes student-written from AI-suggested content), submission (the student submits; the thread becomes read-only).

Proportional scaffolding: the amount of contribution required to unlock drafting assistance (the threshold) is an empirical variable, not a settled value. What counts as sufficient contribution, and how it varies by task type, proficiency level, language background, and learner strategy, is an open research question (threshold-calibration). A miscalibrated threshold fails in two directions: too low makes the constraint inert (the assistant behaves like an ordinary chatbot); too high becomes friction learners route around (gaming, pasting, abandoning).

Process evidence: a client-side tracking aggregator records keystrokes/typing bursts, paste/copy/cut events, canvas edits, and focus/blur — shown to teachers as Engagement Metrics. Boundary: process evidence is not authorship detection; there is no integrity score and no cheating flag; signals are context for human judgment. Epistemic spine: apparatus (what is investigated) vs intervention (what the apparatus does) vs measurement (what it records, mechanism not evidence) vs evidence (what can be submitted to Research).`;

export interface KnowledgeSource {
  id: string;
  title: string;
  resource: string;
}

export const ESSAYS_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    id: "research-apparatus",
    title:
      "Research apparatus — reproducible research in the Workspace (knowledge catalog)",
    resource:
      "https://github.com/evaluchat/knowledge/blob/main/concepts/research-apparatus.en.md",
  },
  {
    id: "essays-workflow",
    title: "Essays workflow — proportional drafting unlock (knowledge catalog)",
    resource:
      "https://github.com/evaluchat/knowledge/blob/main/concepts/essays-workflow.en.md",
  },
  {
    id: "threshold-calibration",
    title:
      "Threshold calibration — what counts as sufficient dialogic contribution? (research catalog)",
    resource:
      "https://github.com/evaluchat/research/blob/main/theory/threshold-calibration.en.md",
  },
];

export const ESSAYS_KNOWLEDGE_SOURCES_TEXT = `Sources:
- research-apparatus — https://github.com/evaluchat/knowledge/blob/main/concepts/research-apparatus.en.md
- essays-workflow — https://github.com/evaluchat/knowledge/blob/main/concepts/essays-workflow.en.md
- threshold-calibration — https://github.com/evaluchat/research/blob/main/theory/threshold-calibration.en.md`;
