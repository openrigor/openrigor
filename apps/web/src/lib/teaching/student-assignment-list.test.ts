import { describe, expect, it } from "vitest";
import {
  assignmentIdsForStudent,
  isAssignmentInRegistry,
} from "./student-assignment-list";
import type { AssignmentEntry } from "./assignment-registry";

const registry: AssignmentEntry[] = [
  {
    assignmentId: "great-expectations-essay",
    assignedStudentIds: ["student-a"],
    assignedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    assignmentId: "custom-essay",
    assignedStudentIds: ["student-a", "student-b"],
    assignedAt: "2026-01-02T00:00:00.000Z",
  },
];

describe("assignmentIdsForStudent", () => {
  it("returns only assignments registered to that student", () => {
    expect(assignmentIdsForStudent(registry, "student-a")).toEqual([
      "great-expectations-essay",
      "custom-essay",
    ]);
    expect(assignmentIdsForStudent(registry, "student-b")).toEqual([
      "custom-essay",
    ]);
  });

  it("returns an empty list for students with nothing assigned", () => {
    expect(assignmentIdsForStudent(registry, "brand-new-student")).toEqual([]);
  });

  it("does not invent seed assignments outside the registry", () => {
    expect(assignmentIdsForStudent([], "anyone")).toEqual([]);
  });
});

describe("isAssignmentInRegistry", () => {
  it("is true only when the assignment appears in the registry", () => {
    expect(isAssignmentInRegistry(registry, "great-expectations-essay")).toBe(
      true
    );
    expect(isAssignmentInRegistry(registry, "doctoral-research-proposal")).toBe(
      false
    );
  });
});
