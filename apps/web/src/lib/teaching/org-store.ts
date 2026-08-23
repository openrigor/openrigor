import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { v4 as uuidv4 } from "uuid";
import { getDefaultEnabledApparatusIds } from "@/lib/apparatuses/enablement";
import type { Org } from "./types";

const DEFAULT_FILE_PATH = join(process.cwd(), "data", "teaching", "orgs.json");

function resolveFilePath(): string {
  return process.env.ORG_STORE_PATH?.trim() || DEFAULT_FILE_PATH;
}

/** In-process serial queue so concurrent RMW ops do not clobber the JSON file. */
let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readOrgs(): Promise<Org[]> {
  try {
    const raw = await readFile(resolveFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Org[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOrgs(orgs: Org[]): Promise<void> {
  const filePath = resolveFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(orgs, null, 2), "utf-8");
}

export async function listOrgs(): Promise<Org[]> {
  return readOrgs();
}

export async function getOrgById(orgId: string): Promise<Org | undefined> {
  const orgs = await readOrgs();
  return orgs.find((entry) => entry.id === orgId);
}

export async function getOrgByAdmin(
  adminUserId: string
): Promise<Org | undefined> {
  const orgs = await readOrgs();
  return orgs.find((entry) => entry.adminUserId === adminUserId);
}

export async function getOrgByTeacher(
  teacherUserId: string
): Promise<Org | undefined> {
  const orgs = await readOrgs();
  return orgs.find((entry) => entry.teacherIds.includes(teacherUserId));
}

export async function createOrg(input: { adminUserId: string }): Promise<Org> {
  const adminUserId = input.adminUserId.trim();
  if (!adminUserId) {
    throw new Error("adminUserId is required");
  }

  return withLock(async () => {
    const orgs = await readOrgs();
    if (orgs.some((entry) => entry.adminUserId === adminUserId)) {
      throw new Error("Admin already has an organization");
    }

    const org: Org = {
      id: `org_${uuidv4()}`,
      adminUserId,
      teacherIds: [],
      createdAt: new Date().toISOString(),
    };

    orgs.push(org);
    await writeOrgs(orgs);
    return org;
  });
}

export type AddTeacherInput = {
  teacherUserId: string;
} & (
  | { adminUserId: string; orgId?: never }
  | { orgId: string; adminUserId?: never }
);

/**
 * Link a teacher to an org. Rejects if the teacher is already linked to any org
 * (one teacher ↔ one admin). Idempotent when already in the target org.
 */
export async function addTeacher(input: AddTeacherInput): Promise<Org> {
  const teacherUserId = input.teacherUserId.trim();
  if (!teacherUserId) {
    throw new Error("teacherUserId is required");
  }

  const hasAdmin = typeof input.adminUserId === "string";
  const hasOrgId = typeof input.orgId === "string";
  if (hasAdmin === hasOrgId) {
    throw new Error("Provide exactly one of adminUserId or orgId");
  }

  return withLock(async () => {
    const orgs = await readOrgs();

    let index = -1;
    if (hasOrgId) {
      index = orgs.findIndex((entry) => entry.id === input.orgId);
    } else {
      index = orgs.findIndex(
        (entry) => entry.adminUserId === input.adminUserId
      );
    }

    if (index === -1) {
      throw new Error("Organization not found");
    }

    const org = orgs[index];

    if (org.teacherIds.includes(teacherUserId)) {
      return org;
    }

    const existing = orgs.find((entry) =>
      entry.teacherIds.includes(teacherUserId)
    );
    if (existing) {
      throw new Error("Teacher is already linked to an organization");
    }

    const updated: Org = {
      ...org,
      teacherIds: [...org.teacherIds, teacherUserId],
    };
    orgs[index] = updated;
    await writeOrgs(orgs);
    return updated;
  });
}

/**
 * Enabled apparatus ids for an org. Missing org or absent field → default set.
 * Never throws.
 */
export async function getOrgApparatuses(orgId: string): Promise<string[]> {
  try {
    const org = await getOrgById(orgId);
    if (!org) {
      return getDefaultEnabledApparatusIds();
    }
    return org.apparatuses ?? getDefaultEnabledApparatusIds();
  } catch {
    return getDefaultEnabledApparatusIds();
  }
}

/**
 * Persist the org-level apparatus enablement set (RMW under lock).
 */
export async function setOrgApparatuses(
  orgId: string,
  apparatuses: string[]
): Promise<Org> {
  return withLock(async () => {
    const orgs = await readOrgs();
    const index = orgs.findIndex((entry) => entry.id === orgId);
    if (index === -1) {
      throw new Error("Organization not found");
    }

    const updated: Org = {
      ...orgs[index],
      apparatuses: [...apparatuses],
    };
    orgs[index] = updated;
    await writeOrgs(orgs);
    return updated;
  });
}
