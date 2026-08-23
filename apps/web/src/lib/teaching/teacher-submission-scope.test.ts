import { describe, expect, it } from "vitest";
import type { Thread } from "@langchain/langgraph-sdk";
import {
  filterThreadsByStudentIds,
  registryTouchesTeacherStudents,
  studentIdsFromClasses,
} from "./teacher-submission-scope";
import type { StudentClassData } from "./types";

function thread(userId: string, id = userId): Thread {
  return {
    thread_id: id,
    created_at: "",
    updated_at: "",
    state_updated_at: "",
    metadata: {
      supabase_user_id: userId,
      assignment_id: "great-expectations-essay",
    },
    status: "idle",
    values: {},
    interrupts: {},
  };
}

describe("studentIdsFromClasses", () => {
  it("collects enrolled student ids across classes", () => {
    const classes: StudentClassData[] = [
      {
        id: "c1",
        name: "A",
        teacherId: "t1",
        createdAt: "",
        updatedAt: "",
        students: [
          {
            supabaseUserId: "s1",
            email: "a@x.com",
            name: "A",
            invitedAt: "",
            acceptedAt: null,
          },
          {
            supabaseUserId: "",
            email: "pending@x.com",
            name: "",
            invitedAt: "",
            acceptedAt: null,
          },
        ],
      },
      {
        id: "c2",
        name: "B",
        teacherId: "t1",
        createdAt: "",
        updatedAt: "",
        students: [
          {
            supabaseUserId: "s2",
            email: "b@x.com",
            name: "B",
            invitedAt: "",
            acceptedAt: "x",
          },
        ],
      },
    ];
    expect(Array.from(studentIdsFromClasses(classes)).sort()).toEqual([
      "s1",
      "s2",
    ]);
  });
});

describe("filterThreadsByStudentIds", () => {
  const threads = [thread("s1"), thread("s2"), thread("other-teacher-student")];

  it("returns only threads for the teacher's students", () => {
    const filtered = filterThreadsByStudentIds(threads, new Set(["s1", "s2"]));
    expect(filtered.map((t) => t.thread_id).sort()).toEqual(["s1", "s2"]);
  });

  it("returns empty when the teacher has no students (new teacher)", () => {
    expect(filterThreadsByStudentIds(threads, new Set())).toEqual([]);
  });

  it("does not leak another teacher's student threads on a shared seed id", () => {
    const filtered = filterThreadsByStudentIds(threads, new Set(["s1"]));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].thread_id).toBe("s1");
  });
});

describe("registryTouchesTeacherStudents", () => {
  it("is true only when registry students intersect the teacher's roster", () => {
    const entry = {
      assignmentId: "great-expectations-essay",
      assignedStudentIds: ["s1", "foreign"],
      assignedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(registryTouchesTeacherStudents(entry, new Set(["s1"]))).toBe(true);
    expect(registryTouchesTeacherStudents(entry, new Set(["nobody"]))).toBe(
      false
    );
    expect(registryTouchesTeacherStudents(undefined, new Set(["s1"]))).toBe(
      false
    );
  });
});
