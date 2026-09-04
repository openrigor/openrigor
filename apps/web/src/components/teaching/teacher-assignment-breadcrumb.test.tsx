import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherAssignmentBreadcrumb } from "./teacher-assignment-breadcrumb";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ assignments: "Assignments" })[key] ?? key,
}));

describe("TeacherAssignmentBreadcrumb", () => {
  it("returns to the assignments section from nested teacher routes", () => {
    const markup = renderToStaticMarkup(
      createElement(TeacherAssignmentBreadcrumb, {
        assignmentTitle: "Research essay",
        currentLabel: "Assignment details",
      })
    );

    expect(markup).toContain('href="/teacher?section=assignments"');
    expect(markup).toContain("Research essay");
    expect(markup).toContain("Assignment details");
  });
});
