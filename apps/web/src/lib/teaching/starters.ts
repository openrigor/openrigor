/**
 * Lightweight shared "starter recipe" library surfaced on the generic canvas
 * welcome screen. Each recipe is a prompt that kicks off an AI-assisted
 * coaching session for a specific writing/preparation task.
 *
 * Deliberately minimal for this iteration: no persistent shareable-recipe
 * system. These are static, opinionated starting prompts aligned with the
 * Essays pillars (modes C–F).
 */

export interface StarterRecipe {
  id: string;
  title: string;
  description: string;
  /** The user-facing prompt appended to start a coaching session. */
  prompt: string;
}

export const STARTER_RECIPES: StarterRecipe[] = [
  {
    id: "blank-idea-doc",
    title: "Blank idea doc",
    description:
      "A clean canvas to capture and develop an idea with the AI coach.",
    prompt:
      "I'd like to start a blank idea document. Help me turn a rough idea into a clear, structured piece of writing — ask me what I'm trying to figure out first, then we'll work on it together.",
  },
  {
    id: "essay-preparation",
    title: "Essay preparation",
    description:
      "Understand the brief, challenge the claims, and build a thesis before drafting.",
    prompt:
      "Help me prepare an essay. Work through the brief with me, help me understand the question, evaluate possible sources, and challenge my claims so I arrive at a strong thesis I can defend — before I start drafting.",
  },
  {
    id: "oral-defence-prep",
    title: "Oral defence prep",
    description:
      "Prepare to explain and defend my work in a viva or oral assessment.",
    prompt:
      "Help me prepare for an oral defence of my work. Ask me the questions I'm likely to face, challenge my arguments adversarially, point out weak spots, and coach me to explain and defend my decisions clearly.",
  },
  {
    id: "essay-mode-c",
    title: "Essay · critique",
    description: "Mode C — evaluate sources and claims against my draft.",
    prompt:
      "Act as my critique coach. Read my writing, identify the claims, check their evidence and reasoning, and help me evaluate sources critically.",
  },
  {
    id: "essay-mode-d",
    title: "Essay · Socratic",
    description: "Mode D — guided thinking through questions, not answers.",
    prompt:
      "Act as my Socratic coach. Don't give me answers — guide my thinking with questions so I arrive at my own conclusions.",
  },
  {
    id: "essay-mode-e",
    title: "Essay · adversarial",
    description: "Mode E — stress-test my position against the other side.",
    prompt:
      "Act as my adversarial coach. Argue the strongest case against my position so I can anticipate objections and defend my argument.",
  },
  {
    id: "essay-mode-f",
    title: "Essay · reflective",
    description: "Mode F — reflect on what I now know and can demonstrate.",
    prompt:
      "Act as my reflective coach. Help me step back and reflect on what I've learned, what I can now do, and what evidence of my thinking my work actually shows.",
  },
];

/** The starter-recipe prompts, ready to feed the quick-start welcome UI. */
export const STARTER_RECIPE_PROMPTS: string[] = STARTER_RECIPES.map(
  (r) => r.prompt
);
