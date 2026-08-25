import { describe, expect, it } from "vitest";
import { shouldShowGithubResearchOnboarding } from "./workspace-home";

describe("workspace home GitHub research onboarding", () => {
  it("shows only when the feature endpoint is available and no repository is bound", () => {
    expect(
      shouldShowGithubResearchOnboarding({ ok: true, status: 200 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(true);
    expect(
      shouldShowGithubResearchOnboarding({ ok: true, status: 200 }, [
        { kind: "research_repository" },
      ])
    ).toBe(false);
  });

  it("stays hidden when the server-gated endpoint is disabled or unavailable", () => {
    expect(
      shouldShowGithubResearchOnboarding({ ok: false, status: 404 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(false);
    expect(
      shouldShowGithubResearchOnboarding({ ok: false, status: 503 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(false);
  });
});
