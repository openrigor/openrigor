import { describe, expect, it } from "vitest";
import {
  FormValidationError,
  resolveFormMarkdown,
  validateFormValues,
} from "./form-validation";
import type { FormFieldDefinition } from "./types";

const fields: Record<string, FormFieldDefinition> = {
  title: {
    id: "title",
    label: "Title",
    type: "text",
    required: true,
    maxLength: 100,
  },
  target: {
    id: "target",
    label: "Target",
    type: "number",
    required: true,
    min: 1,
    max: 100,
  },
  due: { id: "due", label: "Due", type: "date", required: true },
  mode: {
    id: "mode",
    label: "Mode",
    type: "select",
    required: true,
    options: ["Essay", "Report"],
  },
  people: {
    id: "people",
    label: "People",
    type: "roster",
    required: true,
    maxLength: 100,
  },
};

describe("form validation", () => {
  it("validates required fields, limits, numbers, dates, and options", () => {
    expect(() =>
      validateFormValues(fields, {
        title: "",
        target: 0,
        due: "2026-02-31",
        mode: "Presentation",
        people: "one@example.com",
      })
    ).toThrow(FormValidationError);

    try {
      validateFormValues(fields, {
        title: "",
        target: 0,
        due: "2026-02-31",
        mode: "Presentation",
        people: "one@example.com",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(FormValidationError);
      expect(
        (error as FormValidationError).issues.map((issue) => issue.fieldId)
      ).toEqual(expect.arrayContaining(["title", "target", "due", "mode"]));
    }
  });

  it("normalises, deduplicates, and validates roster addresses", () => {
    const values = validateFormValues(fields, {
      title: "Brief",
      target: "50",
      due: "2026-09-01",
      mode: "Essay",
      people: " A@Example.com, b@example.com; a@example.com\nb@example.com ",
    });
    expect(values).toEqual({
      title: "Brief",
      target: 50,
      due: "2026-09-01",
      mode: "Essay",
      people: ["a@example.com", "b@example.com"],
    });
  });

  it("rejects malformed roster addresses", () => {
    expect(() =>
      validateFormValues(fields, {
        title: "Brief",
        target: 50,
        due: "2026-09-01",
        mode: "Essay",
        people: "not-an-email",
      })
    ).toThrow(FormValidationError);
  });

  it("escapes user values before composing resolved Markdown", () => {
    const values = validateFormValues(fields, {
      title: "A *dangerous* <value>",
      target: 50,
      due: "2026-09-01",
      mode: "Essay",
      people: "one@example.com",
    });
    const resolved = resolveFormMarkdown(
      "# {{title}}\n\n{{people}}",
      fields,
      values
    );
    expect(resolved).toContain("\\*dangerous\\*");
    expect(resolved).toContain("&lt;value&gt;");
    expect(resolved).not.toContain("<value>");
  });
});
