import { describe, expect, it } from "vitest";
import {
  resolveAssignmentStudentIds,
  rosterStudentsFromClasses,
  studentIdsFromClass,
} from "./resolve-assignment-students";
import type { StudentClassData } from "./types";

const english10a: StudentClassData = {
  id: "cls_english_10a",
  name: "English 10a",
  teacherId: "teacher-1",
  students: [
    {
      supabaseUserId: "79a5f1e7-7b6b-424b-9d0e-d380d28ef4af",
      email: "cronjevh@gmail.com",
      name: "Cronje van Heerden",
      invitedAt: "2026-07-25T08:30:00.000Z",
      acceptedAt: "2026-07-25T09:42:52.000Z",
    },
    {
      supabaseUserId: "",
      email: "pending@example.com",
      name: "",
      invitedAt: "2026-07-25T08:30:00.000Z",
      acceptedAt: null,
    },
  ],
  createdAt: "2026-07-25T08:29:41.000Z",
  updatedAt: "2026-07-25T09:42:52.000Z",
};

describe("studentIdsFromClass", () => {
  it("returns only accepted students with supabase user ids", () => {
    expect(studentIdsFromClass(english10a)).toEqual([
      "79a5f1e7-7b6b-424b-9d0e-d380d28ef4af",
    ]);
  });

  it("returns [] for missing class", () => {
    expect(studentIdsFromClass(undefined)).toEqual([]);
  });
});

describe("rosterStudentsFromClasses", () => {
  it("dedupes students across classes and skips pending invites", () => {
    const second: StudentClassData = {
      ...english10a,
      id: "cls_other",
      name: "Other",
      students: [
        english10a.students[0],
        {
          supabaseUserId: "student-b",
          email: "b@example.com",
          name: "B",
          invitedAt: "2026-07-25T08:30:00.000Z",
          acceptedAt: "2026-07-25T09:42:52.000Z",
        },
      ],
    };
    expect(rosterStudentsFromClasses([english10a, second])).toEqual([
      {
        id: "79a5f1e7-7b6b-424b-9d0e-d380d28ef4af",
        email: "cronjevh@gmail.com",
        name: "Cronje van Heerden",
      },
      {
        id: "student-b",
        email: "b@example.com",
        name: "B",
      },
    ]);
  });

  it("returns [] when no classes", () => {
    expect(rosterStudentsFromClasses([])).toEqual([]);
  });
});

describe("resolveAssignmentStudentIds", () => {
  it("resolves class mode from the selected class roster", () => {
    expect(
      resolveAssignmentStudentIds({
        assignMode: "class",
        students: [],
        classes: [english10a],
        selectedClassId: "cls_english_10a",
        selectedStudentIds: [],
      })
    ).toEqual(["79a5f1e7-7b6b-424b-9d0e-d380d28ef4af"]);
  });

  it("returns [] when class mode has no matching class", () => {
    expect(
      resolveAssignmentStudentIds({
        assignMode: "class",
        students: [{ id: "x" }],
        classes: [english10a],
        selectedClassId: "missing",
        selectedStudentIds: ["x"],
      })
    ).toEqual([]);
  });
});
