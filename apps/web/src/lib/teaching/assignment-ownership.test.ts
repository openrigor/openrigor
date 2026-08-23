import { describe, expect, it } from "vitest";
import {
  customAssignmentsForTeacher,
  mergeTeacherAssignments,
  teacherOwnsAssignment,
} from "./assignment-ownership";
import type { StudentAssignment } from "./types";

function assignment(
  partial: Pick<StudentAssignment, "id" | "title"> & Partial<StudentAssignment>
): StudentAssignment {
  return {
    courseLabel: "English",
    teacherName: "Teacher",
    dueLabel: "1 Jun",
    prompt: "Write",
    agentInstructions: "Coach",
    completionPercent: 0,
    status: "not_started",
    ...partial,
  };
}

const teacherA = "teacher-a";
const teacherB = "teacher-b";

const catalog: StudentAssignment[] = [
  assignment({ id: "a1", title: "A1", teacherId: teacherA }),
  assignment({ id: "a2", title: "A2", teacherId: teacherA }),
  assignment({ id: "b1", title: "B1", teacherId: teacherB }),
  assignment({ id: "legacy", title: "Legacy" }), // no teacherId
];

describe("customAssignmentsForTeacher", () => {
  it("returns only assignments owned by that teacher", () => {
    expect(
      customAssignmentsForTeacher(catalog, teacherA).map((a) => a.id)
    ).toEqual(["a1", "a2"]);
    expect(
      customAssignmentsForTeacher(catalog, teacherB).map((a) => a.id)
    ).toEqual(["b1"]);
  });

  it("does not return another teacher's assignments or unowned legacy rows", () => {
    const ids = customAssignmentsForTeacher(catalog, teacherB).map((a) => a.id);
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("legacy");
  });

  it("returns empty for a brand-new teacher", () => {
    expect(customAssignmentsForTeacher(catalog, "brand-new-teacher")).toEqual(
      []
    );
  });
});

describe("mergeTeacherAssignments", () => {
  it("updates one teacher's rows without wiping another teacher's", () => {
    const updatedA = [
      assignment({ id: "a1", title: "A1 revised", teacherId: teacherA }),
      assignment({ id: "a3", title: "A3 new", teacherId: teacherA }),
    ];
    const merged = mergeTeacherAssignments(catalog, teacherA, updatedA);
    expect(merged.map((a) => a.id).sort()).toEqual(
      ["a1", "a3", "b1", "legacy"].sort()
    );
    expect(merged.find((a) => a.id === "b1")?.teacherId).toBe(teacherB);
    expect(merged.find((a) => a.id === "a1")?.title).toBe("A1 revised");
    expect(merged.find((a) => a.id === "a2")).toBeUndefined();
  });

  it("stamps teacherId on merged rows even if the client omitted it", () => {
    const merged = mergeTeacherAssignments(catalog, teacherB, [
      assignment({ id: "b2", title: "B2" }),
    ]);
    expect(merged.find((a) => a.id === "b2")?.teacherId).toBe(teacherB);
    expect(merged.find((a) => a.id === "a1")?.teacherId).toBe(teacherA);
  });
});

describe("teacherOwnsAssignment", () => {
  it("is true only for matching teacherId", () => {
    expect(teacherOwnsAssignment(catalog[0], teacherA)).toBe(true);
    expect(teacherOwnsAssignment(catalog[0], teacherB)).toBe(false);
    expect(teacherOwnsAssignment(catalog[3], teacherA)).toBe(false);
    expect(teacherOwnsAssignment(undefined, teacherA)).toBe(false);
  });
});
