import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Org, StudentAssignment } from "./types";
import {
  canReadTeacherWork,
  customAssignmentsForTeacherIds,
  resolveTeacherReadScope,
} from "./org-read-scope";

const ADMIN = "admin-1";
const TEACHER_1 = "teacher-1";
const TEACHER_2 = "teacher-2";
const OTHER = "other-teacher";

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

describe("org-read-scope", () => {
  let dir: string;
  let previousPath: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "org-read-scope-"));
    previousPath = process.env.ORG_STORE_PATH;
    process.env.ORG_STORE_PATH = join(dir, "orgs.json");

    const org: Org = {
      id: "org_test",
      adminUserId: ADMIN,
      teacherIds: [TEACHER_1, TEACHER_2],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(process.env.ORG_STORE_PATH, JSON.stringify([org], null, 2));
  });

  afterEach(async () => {
    if (previousPath === undefined) {
      delete process.env.ORG_STORE_PATH;
    } else {
      process.env.ORG_STORE_PATH = previousPath;
    }
    await rm(dir, { recursive: true, force: true });
  });

  describe("resolveTeacherReadScope", () => {
    it("returns self ∪ org.teacherIds for the org admin", async () => {
      expect(await resolveTeacherReadScope(ADMIN)).toEqual([
        ADMIN,
        TEACHER_1,
        TEACHER_2,
      ]);
    });

    it("returns only self for a delegated teacher", async () => {
      expect(await resolveTeacherReadScope(TEACHER_1)).toEqual([TEACHER_1]);
    });

    it("returns only self when the viewer has no org", async () => {
      expect(await resolveTeacherReadScope(OTHER)).toEqual([OTHER]);
    });
  });

  describe("canReadTeacherWork", () => {
    it("allows self", async () => {
      expect(await canReadTeacherWork(TEACHER_1, TEACHER_1)).toBe(true);
    });

    it("allows org admin to read linked teachers", async () => {
      expect(await canReadTeacherWork(ADMIN, TEACHER_1)).toBe(true);
      expect(await canReadTeacherWork(ADMIN, TEACHER_2)).toBe(true);
    });

    it("denies org admin reading unlinked teachers", async () => {
      expect(await canReadTeacherWork(ADMIN, OTHER)).toBe(false);
    });

    it("denies delegated teachers reading peers", async () => {
      expect(await canReadTeacherWork(TEACHER_1, TEACHER_2)).toBe(false);
      expect(await canReadTeacherWork(TEACHER_1, ADMIN)).toBe(false);
    });
  });

  describe("customAssignmentsForTeacherIds", () => {
    const catalog = [
      assignment({ id: "a1", title: "A1", teacherId: TEACHER_1 }),
      assignment({ id: "a2", title: "A2", teacherId: TEACHER_2 }),
      assignment({ id: "own", title: "Own", teacherId: ADMIN }),
      assignment({ id: "legacy", title: "Legacy" }),
    ];

    it("filters to the given teacher ids", () => {
      expect(
        customAssignmentsForTeacherIds(catalog, [TEACHER_1, ADMIN]).map(
          (a) => a.id
        )
      ).toEqual(["a1", "own"]);
    });

    it("excludes unowned legacy rows", () => {
      expect(
        customAssignmentsForTeacherIds(catalog, [TEACHER_1]).map((a) => a.id)
      ).not.toContain("legacy");
    });
  });
});
