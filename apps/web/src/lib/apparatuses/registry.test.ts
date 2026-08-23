import { describe, expect, it } from "vitest";
import { getApparatusById, listApparatuses } from "./registry";

describe("listApparatuses", () => {
  it("returns the stub catalog including ai-assisted-essay", () => {
    const list = listApparatuses();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((a) => a.id === "ai-assisted-essay")).toBe(true);
  });
});

describe("getApparatusById", () => {
  it("returns the entry for a known id", () => {
    const entry = getApparatusById("ai-assisted-essay");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("ai-assisted-essay");
  });

  it("returns undefined for an unknown id", () => {
    expect(getApparatusById("nope")).toBeUndefined();
  });
});

describe("catalog integrity", () => {
  it("every entry has required fields and typed knobs/profiles", () => {
    for (const entry of listApparatuses()) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.min_platform.length).toBeGreaterThan(0);
      expect(entry.research_questions.length).toBeGreaterThan(0);
      expect(entry.roles.length).toBeGreaterThan(0);
      expect(entry.telemetry.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.knobs.some((knob) => knob.id === "ai_assistance")).toBe(
        true
      );
      expect(entry.profiles.length).toBeGreaterThan(0);
    }
  });

  it("ai-assisted-essay mirrors OKF min_platform and catalog_urls when present", () => {
    const entry = getApparatusById("ai-assisted-essay");
    expect(entry).toBeDefined();
    expect(entry?.min_platform).toBe("0.5.9");
    if (entry?.catalog_urls) {
      expect(entry.catalog_urls.spec).toContain(
        "methods/ai-assisted-essay/ai-assisted-essay.en.md"
      );
      expect(entry.catalog_urls.evidence).toContain(
        "methods/ai-assisted-essay/evidence"
      );
      expect(entry.catalog_urls.questions.length).toBeGreaterThan(0);
    }
  });
});
