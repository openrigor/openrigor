import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Invitation } from "./types";
import {
  applyInvitationOrgEffects,
  assertInvitationCanBeLinked,
  buildInvitationAuthUpdates,
  finalizeAcceptedInvitation,
  finalizeSelfSignupAdmin,
  redirectPathForInvitationRole,
  syntheticSelfSignupAdminInvitation,
} from "./invitation-accept";
import {
  addTeacher,
  createOrg,
  getOrgByAdmin,
  getOrgByTeacher,
} from "./org-store";

const { updateUserByIdMock, createAdminClientMock } = vi.hoisted(() => {
  const updateUserByIdMock = vi.fn();
  return {
    updateUserByIdMock,
    createAdminClientMock: vi.fn(() => ({
      auth: {
        admin: {
          updateUserById: updateUserByIdMock,
        },
      },
    })),
  };
});

vi.mock("./admin-client", () => ({
  createAdminClient: createAdminClientMock,
  getSiteUrl: () => "http://localhost:3000",
}));

function invitation(
  overrides: Partial<Invitation> & Pick<Invitation, "role" | "created_by">
): Invitation {
  return {
    id: "inv_1",
    email: "invitee@example.test",
    classId: null,
    className: null,
    token: "tok_1",
    status: "pending",
    created_at: new Date(0).toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    accepted_at: null,
    ...overrides,
  };
}

describe("invitation-accept helpers", () => {
  let previousPath: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    previousPath = process.env.ORG_STORE_PATH;
    tempDir = await mkdtemp(join(tmpdir(), "invite-accept-"));
    process.env.ORG_STORE_PATH = join(tempDir, "orgs.json");
    updateUserByIdMock.mockReset();
    updateUserByIdMock.mockResolvedValue({ data: { user: {} }, error: null });
    createAdminClientMock.mockClear();
  });

  afterEach(async () => {
    if (previousPath === undefined) {
      delete process.env.ORG_STORE_PATH;
    } else {
      process.env.ORG_STORE_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("redirectPathForInvitationRole maps admin/teacher to /teacher", () => {
    expect(redirectPathForInvitationRole("admin")).toBe("/teacher");
    expect(redirectPathForInvitationRole("teacher")).toBe("/teacher");
    expect(redirectPathForInvitationRole("student")).toBe("/student");
  });

  it("buildInvitationAuthUpdates sets app_metadata.role=admin for admin invites", () => {
    const updates = buildInvitationAuthUpdates({
      invitation: invitation({ role: "admin", created_by: "owner_1" }),
      existingUserMetadata: { invitation_token: "tok_1" },
      name: "Ada Admin",
    });

    expect(updates.app_metadata).toEqual({ role: "admin" });
    expect(updates.user_metadata).toMatchObject({
      name: "Ada Admin",
      full_name: "Ada Admin",
      invitation_token: "tok_1",
    });
    expect(updates.user_metadata.role).toBeUndefined();
  });

  it("buildInvitationAuthUpdates sets teacher role + adminId", () => {
    const updates = buildInvitationAuthUpdates({
      invitation: invitation({ role: "teacher", created_by: "admin_1" }),
      name: "Terry Teacher",
    });

    expect(updates.app_metadata).toEqual({ role: "teacher" });
    expect(updates.user_metadata).toEqual({
      adminId: "admin_1",
      name: "Terry Teacher",
      full_name: "Terry Teacher",
    });
  });

  it("buildInvitationAuthUpdates sets student role", () => {
    const updates = buildInvitationAuthUpdates({
      invitation: invitation({ role: "student", created_by: "teacher_1" }),
      name: "Sam Student",
    });

    expect(updates.app_metadata).toEqual({ role: "student" });
    expect(updates.user_metadata).toMatchObject({
      name: "Sam Student",
    });
    expect(updates.user_metadata.role).toBeUndefined();
  });

  it("buildInvitationAuthUpdates replaces admin app_metadata on teacher convert", () => {
    const updates = buildInvitationAuthUpdates({
      invitation: invitation({ role: "teacher", created_by: "admin_1" }),
      existingAppMetadata: { role: "admin" },
      name: "Terry Teacher",
    });

    expect(updates.app_metadata).toEqual({ role: "teacher" });
  });

  it("buildInvitationAuthUpdates replaces admin app_metadata on student convert", () => {
    const updates = buildInvitationAuthUpdates({
      invitation: invitation({ role: "student", created_by: "teacher_1" }),
      existingAppMetadata: { role: "admin" },
      name: "Sam Student",
    });

    expect(updates.app_metadata).toEqual({ role: "student" });
  });

  it("applyInvitationOrgEffects creates org for admin accept", async () => {
    await applyInvitationOrgEffects({
      invitation: invitation({ role: "admin", created_by: "owner_1" }),
      userId: "admin_new",
    });

    const org = await getOrgByAdmin("admin_new");
    expect(org).toBeDefined();
    expect(org?.teacherIds).toEqual([]);
  });

  it("applyInvitationOrgEffects is idempotent when admin org already exists", async () => {
    await createOrg({ adminUserId: "admin_existing" });
    await applyInvitationOrgEffects({
      invitation: invitation({ role: "admin", created_by: "owner_1" }),
      userId: "admin_existing",
    });

    const orgs = await getOrgByAdmin("admin_existing");
    expect(orgs?.adminUserId).toBe("admin_existing");
  });

  it("applyInvitationOrgEffects links teacher to inviting admin", async () => {
    await createOrg({ adminUserId: "admin_1" });
    await applyInvitationOrgEffects({
      invitation: invitation({ role: "teacher", created_by: "admin_1" }),
      userId: "teacher_new",
    });

    const org = await getOrgByTeacher("teacher_new");
    expect(org?.adminUserId).toBe("admin_1");
    expect(org?.teacherIds).toContain("teacher_new");
  });

  it("assertInvitationCanBeLinked rejects teacher already in another org", async () => {
    await createOrg({ adminUserId: "admin_a" });
    await createOrg({ adminUserId: "admin_b" });
    await addTeacher({ adminUserId: "admin_a", teacherUserId: "teacher_1" });

    await expect(
      assertInvitationCanBeLinked(
        invitation({ role: "teacher", created_by: "admin_b" }),
        "teacher_1"
      )
    ).rejects.toThrow(/already linked/i);
  });

  it("assertInvitationCanBeLinked allows teacher already in same org", async () => {
    await createOrg({ adminUserId: "admin_1" });
    await addTeacher({ adminUserId: "admin_1", teacherUserId: "teacher_1" });

    await expect(
      assertInvitationCanBeLinked(
        invitation({ role: "teacher", created_by: "admin_1" }),
        "teacher_1"
      )
    ).resolves.toBeUndefined();
  });

  it("assertInvitationCanBeLinked is a no-op for admin invites", async () => {
    await expect(
      assertInvitationCanBeLinked(
        invitation({ role: "admin", created_by: "owner_1" }),
        "anyone"
      )
    ).resolves.toBeUndefined();
  });

  it("finalizeAcceptedInvitation updates Auth and creates org for admin", async () => {
    const { redirectTo } = await finalizeAcceptedInvitation({
      user: {
        id: "admin_finalize",
        user_metadata: { foo: "bar" },
        app_metadata: {},
      },
      invitation: invitation({ role: "admin", created_by: "owner_1" }),
      name: "Ada Admin",
    });

    expect(redirectTo).toBe("/teacher");
    expect(updateUserByIdMock).toHaveBeenCalledWith("admin_finalize", {
      app_metadata: { role: "admin" },
      user_metadata: {
        foo: "bar",
        name: "Ada Admin",
        full_name: "Ada Admin",
      },
    });
    expect(await getOrgByAdmin("admin_finalize")).toBeDefined();
  });

  it("finalizeAcceptedInvitation sets teacher claims and links org", async () => {
    await createOrg({ adminUserId: "admin_1" });

    const { redirectTo } = await finalizeAcceptedInvitation({
      user: { id: "teacher_finalize", user_metadata: {}, app_metadata: {} },
      invitation: invitation({ role: "teacher", created_by: "admin_1" }),
      name: "Terry Teacher",
    });

    expect(redirectTo).toBe("/teacher");
    expect(updateUserByIdMock).toHaveBeenCalledWith("teacher_finalize", {
      app_metadata: { role: "teacher" },
      user_metadata: {
        adminId: "admin_1",
        name: "Terry Teacher",
        full_name: "Terry Teacher",
      },
    });
    expect((await getOrgByTeacher("teacher_finalize"))?.adminUserId).toBe(
      "admin_1"
    );
  });

  it("syntheticSelfSignupAdminInvitation is admin role with self as created_by", () => {
    const inv = syntheticSelfSignupAdminInvitation("user_self");
    expect(inv.role).toBe("admin");
    expect(inv.created_by).toBe("user_self");
    expect(inv.status).toBe("accepted");
  });

  it("finalizeSelfSignupAdmin grants app_metadata admin and creates org", async () => {
    const { redirectTo } = await finalizeSelfSignupAdmin({
      user: { id: "self_admin_new", user_metadata: {}, app_metadata: {} },
      name: "Self Admin",
    });

    expect(redirectTo).toBe("/teacher");
    expect(updateUserByIdMock).toHaveBeenCalledWith("self_admin_new", {
      app_metadata: { role: "admin" },
      user_metadata: {
        name: "Self Admin",
        full_name: "Self Admin",
      },
    });
    expect(await getOrgByAdmin("self_admin_new")).toBeDefined();
  });

  it("finalizeSelfSignupAdmin is idempotent for existing org admin", async () => {
    const { redirectTo } = await finalizeSelfSignupAdmin({
      user: {
        id: "self_admin_existing",
        user_metadata: { name: "Ada" },
        app_metadata: { role: "admin" },
      },
      name: "Ada Admin",
    });

    expect(redirectTo).toBe("/teacher");
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("finalizeSelfSignupAdmin does not downgrade owner", async () => {
    const { redirectTo } = await finalizeSelfSignupAdmin({
      user: {
        id: "platform_owner",
        user_metadata: {},
        app_metadata: { role: "owner" },
      },
      name: "Owner",
    });

    expect(redirectTo).toBe("/owner");
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });
});
