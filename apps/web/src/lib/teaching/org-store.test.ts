import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  addTeacher,
  createOrg,
  getOrgApparatuses,
  getOrgByAdmin,
  getOrgById,
  getOrgByTeacher,
  listOrgs,
  setOrgApparatuses,
} from "./org-store";

const ADMIN_A = "admin_a";
const ADMIN_B = "admin_b";
const TEACHER_1 = "teacher_1";
const TEACHER_2 = "teacher_2";

describe("org-store", () => {
  let previousPath: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    previousPath = process.env.ORG_STORE_PATH;
    tempDir = await mkdtemp(join(tmpdir(), "org-store-"));
    process.env.ORG_STORE_PATH = join(tempDir, "orgs.json");
  });

  afterEach(async () => {
    if (previousPath === undefined) {
      delete process.env.ORG_STORE_PATH;
    } else {
      process.env.ORG_STORE_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("createOrg creates an org with empty teacherIds", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    expect(org.id).toMatch(/^org_/);
    expect(org.adminUserId).toBe(ADMIN_A);
    expect(org.teacherIds).toEqual([]);
    expect(org.createdAt).toBeTruthy();
    expect(await listOrgs()).toHaveLength(1);
  });

  it("createOrg rejects when admin already has an org", async () => {
    await createOrg({ adminUserId: ADMIN_A });
    await expect(createOrg({ adminUserId: ADMIN_A })).rejects.toThrow(
      "Admin already has an organization"
    );
  });

  it("getOrgByAdmin and getOrgById look up created orgs", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    expect(await getOrgByAdmin(ADMIN_A)).toEqual(org);
    expect(await getOrgById(org.id)).toEqual(org);
    expect(await getOrgByAdmin(ADMIN_B)).toBeUndefined();
  });

  it("addTeacher by adminUserId appends teacher and supports lookup", async () => {
    await createOrg({ adminUserId: ADMIN_A });
    const updated = await addTeacher({
      adminUserId: ADMIN_A,
      teacherUserId: TEACHER_1,
    });
    expect(updated.teacherIds).toEqual([TEACHER_1]);
    expect(await getOrgByTeacher(TEACHER_1)).toEqual(updated);
  });

  it("addTeacher by orgId appends teacher", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    const updated = await addTeacher({
      orgId: org.id,
      teacherUserId: TEACHER_2,
    });
    expect(updated.teacherIds).toEqual([TEACHER_2]);
  });

  it("addTeacher is idempotent when teacher already in the same org", async () => {
    await createOrg({ adminUserId: ADMIN_A });
    await addTeacher({ adminUserId: ADMIN_A, teacherUserId: TEACHER_1 });
    const again = await addTeacher({
      adminUserId: ADMIN_A,
      teacherUserId: TEACHER_1,
    });
    expect(again.teacherIds).toEqual([TEACHER_1]);
  });

  it("enforces one teacher ↔ one admin across orgs", async () => {
    await createOrg({ adminUserId: ADMIN_A });
    await createOrg({ adminUserId: ADMIN_B });
    await addTeacher({ adminUserId: ADMIN_A, teacherUserId: TEACHER_1 });

    await expect(
      addTeacher({ adminUserId: ADMIN_B, teacherUserId: TEACHER_1 })
    ).rejects.toThrow("Teacher is already linked to an organization");

    const orgA = await getOrgByAdmin(ADMIN_A);
    const orgB = await getOrgByAdmin(ADMIN_B);
    expect(orgA?.teacherIds).toEqual([TEACHER_1]);
    expect(orgB?.teacherIds).toEqual([]);
    expect((await getOrgByTeacher(TEACHER_1))?.adminUserId).toBe(ADMIN_A);
  });

  it("addTeacher rejects missing org", async () => {
    await expect(
      addTeacher({ adminUserId: ADMIN_A, teacherUserId: TEACHER_1 })
    ).rejects.toThrow("Organization not found");
  });

  it("getOrgApparatuses defaults when org lacks apparatuses field", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    expect(org.apparatuses).toBeUndefined();
    expect(await getOrgApparatuses(org.id)).toEqual(["ai-assisted-essay"]);
  });

  it("getOrgApparatuses returns explicit set when present", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    await setOrgApparatuses(org.id, ["ai-assisted-essay", "stress-test"]);
    expect(await getOrgApparatuses(org.id)).toEqual([
      "ai-assisted-essay",
      "stress-test",
    ]);
  });

  it("getOrgApparatuses defaults for unknown org id", async () => {
    expect(await getOrgApparatuses("org_missing")).toEqual([
      "ai-assisted-essay",
    ]);
  });

  it("setOrgApparatuses persists and throws on unknown org", async () => {
    const org = await createOrg({ adminUserId: ADMIN_A });
    const updated = await setOrgApparatuses(org.id, []);
    expect(updated.apparatuses).toEqual([]);
    expect((await getOrgById(org.id))?.apparatuses).toEqual([]);

    await expect(
      setOrgApparatuses("org_missing", ["ai-assisted-essay"])
    ).rejects.toThrow("Organization not found");
  });
});
