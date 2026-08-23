import { AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { findLatestLedgerUpdate, parseLedgerUpdates } from "./ledger-markdown";

const dimensions = [
  {
    id: "education_level",
    role: "context" as const,
    control: "multi-select" as const,
    type: "select" as const,
    options: ["k12", "higher_ed"],
  },
  {
    id: "collection_date",
    role: "collection" as const,
    control: "range" as const,
    type: "date" as const,
  },
];

describe("ledger markdown updates", () => {
  it("extracts valid declared filters and removes the protocol block", () => {
    const parsed = parseLedgerUpdates(
      'I narrowed the ledger.\n<ledger-updates>{"education_level":{"control":"multi-select","values":["k12"]},"collection_date":{"control":"range","min":"2024-01-01"}}</ledger-updates>',
      dimensions
    );

    expect(parsed).toEqual({
      updates: [
        {
          fieldId: "education_level",
          control: "multi-select",
          values: ["k12"],
        },
        {
          fieldId: "collection_date",
          control: "range",
          min: "2024-01-01",
        },
      ],
      cleanContent: "I narrowed the ledger.\n",
    });
  });

  it("consumes HTML-escaped ledger update blocks", () => {
    const parsed = parseLedgerUpdates(
      "Done. &lt;ledger-updates&gt;{&quot;education_level&quot;:{&quot;control&quot;:&quot;multi-select&quot;,&quot;values&quot;:[&quot;k12&quot;]}}&lt;/ledger-updates&gt;",
      dimensions
    );

    expect(parsed).toEqual({
      updates: [
        {
          fieldId: "education_level",
          control: "multi-select",
          values: ["k12"],
        },
      ],
      cleanContent: "Done. ",
    });
  });

  it("drops filters with values outside a dimension's declared options", () => {
    const parsed = parseLedgerUpdates(
      'Done. <ledger-updates>{"education_level":{"control":"multi-select","values":["unknown"]}}</ledger-updates>',
      dimensions
    );

    expect(parsed?.updates).toEqual([]);
  });

  it("ignores malformed and partial streaming blocks", () => {
    expect(
      parseLedgerUpdates(
        'Working on it. <ledger-updates>{"education_level":',
        dimensions
      )
    ).toBeUndefined();
    expect(
      parseLedgerUpdates(
        "Working on it. <ledger-updates>{not json}</ledger-updates>",
        dimensions
      )
    ).toBeUndefined();
  });

  it("drops unknown dimensions and finds the latest parseable assistant update", () => {
    const update = new AIMessage({
      content:
        'Done. <ledger-updates>{"education_level":{"control":"multi-select","values":["k12"]},"not_declared":{"control":"multi-select","values":["x"]}}</ledger-updates>',
    });
    const laterMessage = new AIMessage({ content: "Anything else?" });

    const result = findLatestLedgerUpdate([update, laterMessage], dimensions);

    expect(result?.message).toBe(update);
    expect(result?.parsed.updates).toEqual([
      {
        fieldId: "education_level",
        control: "multi-select",
        values: ["k12"],
      },
    ]);
  });
});
