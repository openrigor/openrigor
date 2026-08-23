import { describe, expect, it } from "vitest";
import { ESSAYS_KNOWLEDGE_SOURCES } from "@/lib/apparatuses/ai-assisted-essay/knowledge-context";
import { buildAssignmentSystemPrompt } from "./assignment-prompt";
import type { StudentAssignment } from "./types";

const fixture: StudentAssignment = {
  id: "asg-fixture-1",
  courseLabel: "English Lit",
  teacherName: "Ms. Rivera",
  dueLabel: "8 Jun",
  title: "CAMDLE Essay Draft",
  prompt: "Argue whether proportional scaffolding helps essay learning.",
  agentInstructions: "Stay Socratic until the thesis is clear.",
  wordTarget: 800,
  completionPercent: 0,
  status: "not_started",
};

describe("buildAssignmentSystemPrompt", () => {
  it("includes research context section and sources", () => {
    const prompt = buildAssignmentSystemPrompt(fixture);

    expect(prompt).toContain("Research context");
    for (const source of ESSAYS_KNOWLEDGE_SOURCES) {
      expect(prompt).toContain(source.resource);
    }
    expect(prompt.toLowerCase()).toContain("threshold-calibration");
    expect(prompt.toLowerCase()).toContain("proportional scaffolding");
  });

  it("still includes assignment fields", () => {
    const prompt = buildAssignmentSystemPrompt(fixture);

    expect(prompt).toContain(fixture.title);
    expect(prompt).toContain(fixture.courseLabel);
    expect(prompt).toContain(fixture.prompt);
  });

  it("mentions Research context only once", () => {
    const prompt = buildAssignmentSystemPrompt(fixture);
    const matches = prompt.match(/Research context/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
