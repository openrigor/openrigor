import { describe, expect, it } from "vitest";
import type { GraphInput } from "./types.js";

describe("GraphInput", () => {
  it("accepts a scoped Evidence Ledger context", () => {
    const input: GraphInput = {
      ledgerContext: {
        kind: "ledger",
        methodId: "evidence-method",
        methodVersion: "1.0.0",
        templateId: "evidence-template",
        templateVersion: "1.0.0",
        dimensions: [
          {
            id: "education_level",
            role: "context",
            control: "multi-select",
            options: ["k12"],
            type: "text",
          },
        ],
        filters: {
          education_level: { control: "multi-select", values: ["k12"] },
        },
      },
    };

    expect(input.ledgerContext?.filters.education_level).toEqual({
      control: "multi-select",
      values: ["k12"],
    });
  });
});
