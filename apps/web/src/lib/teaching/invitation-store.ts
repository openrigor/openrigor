import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import type { Invitation } from "./types";

const DATA_DIR = join(process.cwd(), "data", "teaching");
const FILE_PATH = join(DATA_DIR, "invitations.json");

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isExpired(invitation: Invitation): boolean {
  return (
    invitation.status === "expired" ||
    new Date(invitation.expires_at).getTime() < Date.now()
  );
}

async function readInvitations(): Promise<Invitation[]> {
  try {
    const raw = await readFile(FILE_PATH, "utf-8");
    return JSON.parse(raw) as Invitation[];
  } catch {
    return [];
  }
}

async function writeInvitations(invitations: Invitation[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(invitations, null, 2), "utf-8");
}

export async function getAllInvitations(): Promise<Invitation[]> {
  return readInvitations();
}

export async function getInvitationsByCreator(
  createdBy: string
): Promise<Invitation[]> {
  const invitations = await readInvitations();
  return invitations.filter((entry) => entry.created_by === createdBy);
}

export async function getInvitation(
  token: string
): Promise<Invitation | undefined> {
  const invitations = await readInvitations();
  const invitation = invitations.find((entry) => entry.token === token);
  if (!invitation) {
    return undefined;
  }

  if (isExpired(invitation) && invitation.status === "pending") {
    invitation.status = "expired";
    const index = invitations.findIndex((entry) => entry.token === token);
    invitations[index] = invitation;
    await writeInvitations(invitations);
  }

  if (isExpired(invitation)) {
    return undefined;
  }

  return invitation;
}

export async function createInvitation(input: {
  email: string;
  role: Invitation["role"];
  classId?: string | null;
  className?: string | null;
  createdBy: string;
}): Promise<Invitation> {
  const now = new Date();
  const invitation: Invitation = {
    id: `inv_${uuidv4()}`,
    email: normalizeEmail(input.email),
    role: input.role,
    classId: input.classId ?? null,
    className: input.className ?? null,
    token: uuidv4(),
    status: "pending",
    created_by: input.createdBy,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
    accepted_at: null,
  };

  const invitations = await readInvitations();
  invitations.push(invitation);
  await writeInvitations(invitations);
  return invitation;
}

/** Remove a pending invite that never got a successful Supabase auth invite. */
export async function deleteInvitation(token: string): Promise<boolean> {
  const invitations = await readInvitations();
  const next = invitations.filter((entry) => entry.token !== token);
  if (next.length === invitations.length) {
    return false;
  }
  await writeInvitations(next);
  return true;
}

export async function acceptInvitation(token: string): Promise<Invitation> {
  const invitations = await readInvitations();
  const index = invitations.findIndex((entry) => entry.token === token);

  if (index === -1) {
    throw new Error("Invitation not found");
  }

  const invitation = invitations[index];

  if (invitation.status !== "pending") {
    throw new Error("Invitation is no longer pending");
  }

  if (isExpired(invitation)) {
    invitations[index] = { ...invitation, status: "expired" };
    await writeInvitations(invitations);
    throw new Error("Invitation has expired");
  }

  const accepted: Invitation = {
    ...invitation,
    status: "accepted",
    accepted_at: new Date().toISOString(),
  };

  invitations[index] = accepted;
  await writeInvitations(invitations);
  return accepted;
}

export async function getInvitationsByEmail(
  email: string
): Promise<Invitation[]> {
  const normalized = normalizeEmail(email);
  const invitations = await readInvitations();
  return invitations.filter(
    (entry) => normalizeEmail(entry.email) === normalized
  );
}
