import { describe, expect, it } from "vitest";
import { APPARATUS_CATALOG, validateApparatusCatalog } from "./catalog";
import { validateApparatusConfiguration } from "@opencanvas/shared";
import { getTemplateById } from "../workspace/template-catalog";

describe("generated apparatus catalog", () => {
  it("contains the canonical Essays profile and contrasting valid paths", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    );
    expect(essays).toBeDefined();
    expect(essays?.profiles.map((profile) => profile.id)).toEqual([
      "canonical-constrained-dialogue",
      "gate-off",
      "ai-off",
      "canvas-actions-off",
      "tracking-off",
    ]);
    expect(essays?.run_brief_template).toBe("evaluchat-assignment-brief@1.0.0");
    expect(essays?.evidence_template).toMatchObject({
      id: "evidence-template",
      version: "1.0.0",
    });
    const brief = getTemplateById("evaluchat-assignment-brief");
    expect(brief?.templateKind).toBe("form");
    expect(brief?.version).toBe("1.0.0");
    expect(essays?.platform).toEqual({
      participant_invitations: "required",
      review_surface: "essay-process-review",
    });

    for (const profile of essays?.profiles ?? []) {
      expect(
        validateApparatusConfiguration(essays!, profile.configuration)
      ).toEqual([]);
    }
  });

  it("rejects unknown capabilities, incompatible canvas versions, and non-viable workflows", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          required_capabilities: [...essays.required_capabilities, "unknown"],
        } as never,
      ])
    ).toThrow(/unknown capability/);

    expect(() =>
      validateApparatusCatalog([{ ...essays, min_canvas_version: "99.0.0" }])
    ).toThrow(/requires canvas/);

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          required_capabilities: essays.required_capabilities.filter(
            (capability) => capability !== "submission"
          ),
        },
      ])
    ).toThrow(/viable student workflow/);
  });

  it("rejects profiles whose knobs violate treatment dependencies", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;
    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          profiles: [
            {
              ...essays.profiles[0],
              configuration: {
                ...essays.profiles[0].configuration,
                drafting_gate: "none",
                threshold: 4,
              },
            },
          ],
        },
      ])
    ).toThrow(/threshold must be zero/);
  });

  it("rejects malformed embedded evidence templates", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    for (const evidence_template of [
      null,
      {
        ...essays.evidence_template,
        fields: [],
      },
      {
        ...essays.evidence_template,
        layoutMarkdown: false,
      },
      {
        ...essays.evidence_template,
        guidance: [],
      },
      {
        ...essays.evidence_template,
        sourcePath: {},
      },
    ]) {
      expect(() =>
        validateApparatusCatalog([{ ...essays, evidence_template } as never])
      ).toThrow(/evidence_template/);
    }
  });

  it("rejects evidence template fields with non-object definitions", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          evidence_template: {
            ...essays.evidence_template!,
            fields: {
              ...essays.evidence_template!.fields,
              claim: null,
            },
          },
        },
      ])
    ).toThrow(/fields\.claim must be an object/);
  });

  it("rejects evidence template fields with unsupported types", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          evidence_template: {
            ...essays.evidence_template!,
            fields: {
              ...essays.evidence_template!.fields,
              claim: { type: "checkbox" },
            },
          },
        },
      ])
    ).toThrow(
      /fields\.claim\.type must be one of text, textarea, select, number, date/
    );
  });

  it("rejects select evidence template fields without options", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          evidence_template: {
            ...essays.evidence_template!,
            fields: {
              ...essays.evidence_template!.fields,
              claim: { type: "select" },
            },
          },
        },
      ])
    ).toThrow(/fields\.claim\.options must be present for select/);
  });

  it("rejects select evidence template fields with non-string options", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          evidence_template: {
            ...essays.evidence_template!,
            fields: {
              ...essays.evidence_template!.fields,
              claim: { type: "select", options: ["known", 1] },
            },
          },
        },
      ])
    ).toThrow(/fields\.claim\.options must contain only strings/);
  });

  it("validates ledger dimensions at runtime", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;
    const template = essays.evidence_template!;
    const valid = {
      ...template,
      fields: {
        ...template.fields,
        collection_date: {
          type: "date" as const,
          missing_semantics: "unknown",
          ledger_dimension: {
            role: "collection" as const,
            control: "range" as const,
          },
        },
      },
    };

    expect(() =>
      validateApparatusCatalog([{ ...essays, evidence_template: valid }])
    ).not.toThrow();

    const invalid = [
      {
        type: "text",
        ledger_dimension: { role: "context", control: "multi-select" },
      },
      {
        type: "select",
        options: ["known"],
        ledger_dimension: { role: "unknown-role", control: "multi-select" },
      },
      {
        type: "number",
        ledger_dimension: { role: "method", control: "multi-select" },
      },
      {
        type: "date",
        options: ["2026-01-01"],
        ledger_dimension: { role: "collection", control: "range" },
      },
    ];

    for (const field of invalid) {
      expect(() =>
        validateApparatusCatalog([
          {
            ...essays,
            evidence_template: {
              ...template,
              fields: { ...template.fields, field },
            },
          } as never,
        ])
      ).toThrow(/ledger_dimension|range controls/);
    }
  });

  it("accepts every supported optional-capability combination with a viable workflow", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;
    const valid: unknown[] = [];

    for (const ai_assistance of [false, true]) {
      for (const ai_canvas_actions of [false, true]) {
        for (const drafting_gate of [
          "none",
          "discussion-first",
          "thesis-approved",
        ] as const) {
          for (const threshold of [0, 1, 4]) {
            for (const tracking of [false, true]) {
              const configuration = {
                ai_assistance,
                ai_canvas_actions,
                drafting_gate,
                threshold,
                tracking,
              };
              if (
                validateApparatusConfiguration(essays, configuration).length ===
                0
              ) {
                valid.push(configuration);
              }
            }
          }
        }
      }
    }

    expect(valid.length).toBeGreaterThan(0);
    expect(valid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ai_assistance: false,
          ai_canvas_actions: false,
          drafting_gate: "none",
        }),
        expect.objectContaining({
          ai_assistance: true,
          drafting_gate: "none",
          threshold: 0,
        }),
        expect.objectContaining({ tracking: false }),
      ])
    );
  });
});
