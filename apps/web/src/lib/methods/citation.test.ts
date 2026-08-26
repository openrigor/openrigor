import { describe, expect, it } from "vitest";
import {
  generateApa,
  generateBibtex,
  type MethodCitationMethod,
} from "./citation";

const completeMethod: MethodCitationMethod = {
  name: "Constrained dialogic drafting",
  version: "1.2.0",
  profiles: [{ author: "Jane Doe" }],
  publication_date: "2025-06-14",
  institution: "OpenRigor Research",
};

describe("Method citations", () => {
  it("generates BibTeX from canonical metadata", () => {
    expect(generateBibtex(completeMethod)).toBe(`@techreport{doe2025_1_2_0,
  author = {Jane Doe},
  title = {Constrained dialogic drafting},
  year = {2025},
  institution = {OpenRigor Research},
  number = {1.2.0}
}`);
  });

  it("generates APA from canonical metadata", () => {
    expect(generateApa(completeMethod)).toBe(
      "Jane Doe (2025). Constrained dialogic drafting (1.2.0). OpenRigor Research."
    );
  });

  it("returns null when any canonical field is missing", () => {
    const incompleteMethods: MethodCitationMethod[] = [
      { ...completeMethod, name: undefined },
      { ...completeMethod, version: undefined },
      { ...completeMethod, profiles: [] },
      { ...completeMethod, publication_date: undefined },
    ];

    for (const method of incompleteMethods) {
      expect(generateBibtex(method)).toBeNull();
      expect(generateApa(method)).toBeNull();
    }
  });

  it("does not turn a malformed publication date into a citation", () => {
    const method = { ...completeMethod, publication_date: "unknown" };

    expect(generateBibtex(method)).toBeNull();
    expect(generateApa(method)).toBeNull();
  });
});
