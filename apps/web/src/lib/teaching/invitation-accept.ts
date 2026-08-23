import type { User } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import { join } from "path";
import { createAdminClient } from "./admin-client";
import { getClassesByTeacher } from "./class-store";
import { readAllCustomAssignments } from "./assignment-file-store";
import {
  addTeacher,
  createOrg,
  getOrgByAdmin,
  getOrgByTeacher,
} from "./org-store";
import type { Invitation, InvitationRole } from "./types";

async function hasRegistryEntriesForAssignments(
  assignmentIds: Set<string>
): Promise<boolean> {
  if (assignmentIds.size === 0) return false;
  try {
    const path =
      process.env.TEACHING_REGISTRY_PATH?.trim() ||
      join(process.cwd(), "data", "teaching", "registry.json");
    const raw = await readFile(path, "utf-8");
    const entries = JSON.parse(raw) as Array<{
      assignmentId?: string;
      assignedStudentIds?: string[];
    }>;
    return entries.some(
      (entry) =>
        assignmentIds.has(entry.assignmentId ?? "") &&
        (entry.assignedStudentIds?.length ?? 0) > 0
    );
  } catch {
    return false;
  }
}

/**
 * Admin accounts can be converted to an invited teacher/student only while
 * their personal organisation is genuinely empty. This protects existing
 * rosters and submissions from silently changing ownership.
 */
async function assertAdminOrganisationCanConvert(
  userId: string
): Promise<void> {
  const org = await getOrgByAdmin(userId);
  if (!org) return;

  if (org.teacherIds.length > 0) {
    throw new Error(
      "This organisation already has members. Use a separate account or decline the invitation."
    );
  }

  const [classes, assignments] = await Promise.all([
    getClassesByTeacher(userId),
    readAllCustomAssignments(),
  ]);
  const ownedAssignments = assignments.filter(
    (assignment) => assignment.teacherId === userId
  );
  if (classes.length > 0 || ownedAssignments.length > 0) {
    throw new Error(
      "This organisation already has classes or assignments. Use a separate account or decline the invitation."
    );
  }

  if (
    await hasRegistryEntriesForAssignments(
      new Set(ownedAssignments.map((assignment) => assignment.id))
    )
  ) {
    throw new Error(
      "This organisation already has submissions. Use a separate account or decline the invitation."
    );
  }
}

export function redirectPathForInvitationRole(role: InvitationRole): string {
  if (role === "admin" || role === "teacher") {
    return "/teacher";
  }
  return "/student";
}

/**
 * Reject teacher accepts when the user is already linked to a different org.
 * Safe to call before marking the invitation accepted.
 */
export async function assertInvitationCanBeLinked(
  invitation: Invitation,
  userId: string,
  user?: Pick<User, "app_metadata">
): Promise<void> {
  if (invitation.role !== "teacher" && invitation.role !== "student") {
    return;
  }

  const existingRole = user?.app_metadata?.role;
  if (existingRole === "owner") {
    throw new Error("The platform owner account cannot be converted.");
  }
  if (existingRole === "admin") {
    await assertAdminOrganisationCanConvert(userId);
  }

  const existing = await getOrgByTeacher(userId);
  if (existing && existing.adminUserId !== invitation.created_by) {
    throw new Error("Teacher is already linked to an organization");
  }
}

export type InvitationAuthUpdates = {
  app_metadata?: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

/** Build Supabase Auth claim updates for an accepted invitation. */
export function buildInvitationAuthUpdates(opts: {
  invitation: Invitation;
  existingUserMetadata?: Record<string, unknown> | null;
  existingAppMetadata?: Record<string, unknown> | null;
  name: string;
}): InvitationAuthUpdates {
  const existing = opts.existingUserMetadata ?? {};
  const baseMeta: Record<string, unknown> = {
    ...existing,
    full_name: opts.name,
    name: opts.name,
  };

  if (opts.invitation.role === "admin") {
    return {
      app_metadata: { role: "admin" },
      user_metadata: baseMeta,
    };
  }

  if (opts.invitation.role === "teacher") {
    return {
      app_metadata: { role: "teacher" },
      user_metadata: {
        ...baseMeta,
        adminId: opts.invitation.created_by,
      },
    };
  }

  return {
    app_metadata: { role: "student" },
    user_metadata: {
      ...baseMeta,
    },
  };
}

/**
 * Org membership side effects after an invitation is accepted.
 * - admin → ensure org row exists for this user
 * - teacher → link to inviting admin's org (one teacher ↔ one admin)
 */
export async function applyInvitationOrgEffects(opts: {
  invitation: Invitation;
  userId: string;
}): Promise<void> {
  const { invitation, userId } = opts;

  if (invitation.role === "admin") {
    const existing = await getOrgByAdmin(userId);
    if (!existing) {
      await createOrg({ adminUserId: userId });
    }
    return;
  }

  if (invitation.role === "teacher") {
    await addTeacher({
      adminUserId: invitation.created_by,
      teacherUserId: userId,
    });
  }
}

/**
 * Apply Auth claims + org membership for an accepted invitation.
 * Caller is responsible for acceptInvitation() and class roster updates.
 */
export async function finalizeAcceptedInvitation(opts: {
  user: Pick<User, "id" | "user_metadata" | "app_metadata">;
  invitation: Invitation;
  name: string;
}): Promise<{ redirectTo: string }> {
  const updates = buildInvitationAuthUpdates({
    invitation: opts.invitation,
    existingUserMetadata: opts.user.user_metadata,
    existingAppMetadata: opts.user.app_metadata,
    name: opts.name,
  });

  // Students do not get an organisation row of their own. Persist the
  // inviting teacher's organisation on the Auth metadata so every subsequent
  // assignment/thread read can enforce the same organisation boundary.
  if (opts.invitation.role === "student") {
    const org =
      (await getOrgByAdmin(opts.invitation.created_by)) ||
      (await getOrgByTeacher(opts.invitation.created_by));
    if (org) {
      updates.user_metadata = {
        ...updates.user_metadata,
        adminId: org.adminUserId,
        orgId: org.id,
      };
    }
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    opts.user.id,
    updates
  );

  if (updateError) {
    throw new Error(
      updateError.message || "Failed to update user profile for invitation"
    );
  }

  await applyInvitationOrgEffects({
    invitation: opts.invitation,
    userId: opts.user.id,
  });

  return { redirectTo: redirectPathForInvitationRole(opts.invitation.role) };
}

/** Synthetic invitation for tokenless org-admin self-signup (no invite token). */
export function syntheticSelfSignupAdminInvitation(userId: string): Invitation {
  return {
    id: `self_signup_${userId}`,
    email: "",
    role: "admin",
    classId: null,
    className: null,
    token: "",
    status: "accepted",
    created_by: userId,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    accepted_at: new Date().toISOString(),
  };
}

/**
 * Grant org-admin role + org row for tokenless self-signup.
 * Skips users who already have owner or org-admin claims.
 */
export async function finalizeSelfSignupAdmin(opts: {
  user: Pick<User, "id" | "user_metadata" | "app_metadata">;
  name: string;
}): Promise<{ redirectTo: string }> {
  if (opts.user.app_metadata?.role === "owner") {
    return { redirectTo: "/owner" };
  }
  if (opts.user.app_metadata?.role === "admin") {
    return { redirectTo: redirectPathForInvitationRole("admin") };
  }

  const invitation = syntheticSelfSignupAdminInvitation(opts.user.id);
  const updates = buildInvitationAuthUpdates({
    invitation,
    existingUserMetadata: opts.user.user_metadata,
    name: opts.name,
  });

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    opts.user.id,
    updates
  );

  if (updateError) {
    throw new Error(
      updateError.message || "Failed to grant org admin role for self-signup"
    );
  }

  await applyInvitationOrgEffects({
    invitation,
    userId: opts.user.id,
  });

  return { redirectTo: redirectPathForInvitationRole("admin") };
}
