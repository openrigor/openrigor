import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient, getSiteUrl } from "./admin-client";
import {
  classifyInviteEmailFailure,
  describeInviteEmailFailure,
  type InviteEmailFailure,
} from "./invite-email-failure";
import { isTeacher, isOwner } from "./teacher-utils";

export { createAdminClient, getSiteUrl } from "./admin-client";
/** @deprecated Prefer isOwner — re-exported for soft migration. */
export { isAdmin, isOwner } from "./teacher-utils";

/** Pause between Auth invite emails — Supabase rate-limits bursts hard. */
export const INVITE_EMAIL_GAP_MS = 1_200;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseEmailList(input: {
  emails?: string[] | string;
  text?: string;
}): string[] {
  const raw: string[] = [];

  if (Array.isArray(input.emails)) {
    raw.push(...input.emails);
  } else if (typeof input.emails === "string" && input.emails.trim()) {
    raw.push(...input.emails.split(/[\n,;]+/));
  }

  if (typeof input.text === "string" && input.text.trim()) {
    raw.push(...input.text.split(/[\n,;]+/));
  }

  const normalized = raw
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0 && email.includes("@"));

  return Array.from(new Set(normalized));
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  let page = 1;
  const perPage = 200;

  while (true) {
    const {
      data: { users },
      error,
    } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const match = users.find(
      (user) => user.email?.trim().toLowerCase() === normalized
    );
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function inviteUserByEmail(
  email: string,
  metadata: Record<string, unknown>,
  invitationToken: string
): Promise<void> {
  const admin = createAdminClient();
  const redirectTo = `${getSiteUrl()}/invite/accept?token=${encodeURIComponent(invitationToken)}`;

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: metadata,
  });

  if (error) {
    throw error;
  }
}

export async function inviteWorkspaceParticipant(
  email: string,
  options?: { correlationId?: string }
): Promise<{ emailed: boolean }> {
  const admin = createAdminClient();
  const redirectTo = `${getSiteUrl()}/auth/confirm?next=/workspace`;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo }
  );
  if (!inviteError) {
    return { emailed: true };
  }

  const { error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (!linkError) {
    return { emailed: true };
  }

  console.error(
    `[workspace] could not email (${options?.correlationId ?? "unknown"}):`,
    inviteError.message,
    linkError.message
  );
  return { emailed: false };
}

/**
 * Ensure an Auth user exists for an invite. Prefer invite email; on rate-limit
 * (or other send failures), fall back to generateLink so acceptance still works.
 */
export async function ensureInviteAuthUser(
  email: string,
  metadata: Record<string, unknown>,
  invitationToken: string
): Promise<{
  emailed: boolean;
  actionLink?: string;
  failure?: InviteEmailFailure;
  failureReason?: string;
}> {
  const admin = createAdminClient();
  const redirectTo = `${getSiteUrl()}/invite/accept?token=${encodeURIComponent(invitationToken)}`;

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: metadata,
    }
  );

  if (!inviteError) {
    return { emailed: true };
  }

  const message = inviteError.message || "invite failed";
  const failure = classifyInviteEmailFailure(message);
  console.error(
    `[invitations] email send failed for ${email} (${failure}):`,
    message
  );

  // Create/ensure the auth user without relying on the invite email send path.
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
        data: metadata,
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    const detail = linkError?.message || message;
    throw new Error(
      `${describeInviteEmailFailure(failure)} and could not create auth link: ${detail}`
    );
  }

  return {
    emailed: false,
    actionLink: linkData.properties.action_link,
    failure,
    failureReason: describeInviteEmailFailure(failure),
  };
}

export async function inviteUserByEmailWithRole(
  email: string,
  metadata: Record<string, unknown>
): Promise<{ userId?: string; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: `${getSiteUrl()}/auth/register`,
  });

  if (error) {
    return { error: error.message };
  }

  return { userId: data.user?.id };
}

export async function requireAuthenticatedTeacher(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isTeacher(user)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, response: null };
}

export async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Platform invite APIs are owner-only (formerly app_metadata.role=admin).
  if (!isOwner(user)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, response: null };
}
