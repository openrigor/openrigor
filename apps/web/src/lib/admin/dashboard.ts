import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/teaching/admin-client";
import { listInvitationCounts } from "./invitations";
import {
  addUsageTotals,
  countUsersJoinedSince,
  rankUsersByCount,
  rankUsersByUsage,
  type AdminUserSummary,
  type UsageTotals,
} from "./aggregation";
import { maskEmail } from "./obfuscate";
import { listAllWorkspaceItemCounts } from "./workspace";
import { listUsage } from "@/lib/workspace/usage-store";

const USER_PAGE_SIZE = 200;
const RECENT_REGISTRATION_LIMIT = 20;
const USAGE_READ_CONCURRENCY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminDashboardData = {
  generatedAt: string;
  registrations: {
    total: number;
    joinedLast7Days: number;
    joinedLast30Days: number;
    recent: Array<{ email: string; joinedAt: string }>;
  };
  topWorkspaceItems: Array<{
    userId: string;
    email: string;
    count: number;
  }>;
  topInvitations: Array<{
    userId: string;
    email: string;
    count: number;
  }>;
  providerUsage: {
    total: UsageTotals;
    topUsers: Array<{
      userId: string;
      email: string;
      requests: number;
      tokensIn: number;
      tokensOut: number;
    }>;
  };
};

export async function listAllAuthUsers(): Promise<User[]> {
  const admin = createAdminClient();
  const users: User[] = [];
  let page = 1;

  while (true) {
    const {
      data: { users: pageUsers },
      error,
    } = await admin.auth.admin.listUsers({ page, perPage: USER_PAGE_SIZE });
    if (error) throw error;
    users.push(...pageUsers);
    if (pageUsers.length < USER_PAGE_SIZE) return users;
    page += 1;
  }
}

function asSummary(user: User): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
  };
}

function dateTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function listUsageForUsers(
  users: User[]
): Promise<Array<readonly [string, UsageTotals]>> {
  const entries: Array<readonly [string, UsageTotals]> = [];
  for (let index = 0; index < users.length; index += USAGE_READ_CONCURRENCY) {
    const batch = await Promise.all(
      users
        .slice(index, index + USAGE_READ_CONCURRENCY)
        .map(async (user) => [user.id, await listUsage(user.id)] as const)
    );
    entries.push(...batch);
  }
  return entries;
}

export async function getAdminDashboardData(
  now = new Date()
): Promise<AdminDashboardData> {
  const users = await listAllAuthUsers();
  const summaries = users.map(asSummary);
  const nowTime = now.getTime();
  const workspaceCountsPromise = listAllWorkspaceItemCounts(users);
  const invitationCountsPromise = listInvitationCounts(users);
  const usagePromise = listUsageForUsers(users);
  const [workspaceCounts, invitationCounts, usageEntries] = await Promise.all([
    workspaceCountsPromise,
    invitationCountsPromise,
    usagePromise,
  ]);
  const usage = Object.fromEntries(usageEntries);
  const totalUsage = usageEntries.reduce(
    (total, [, entry]) => addUsageTotals(total, entry),
    { requests: 0, tokensIn: 0, tokensOut: 0 }
  );

  const recent = summaries
    .filter((user) => dateTime(user.created_at) <= nowTime)
    .sort(
      (left, right) => dateTime(right.created_at) - dateTime(left.created_at)
    )
    .slice(0, RECENT_REGISTRATION_LIMIT)
    .map((user) => ({
      email: maskEmail(user.email),
      joinedAt: user.created_at,
    }));

  return {
    generatedAt: now.toISOString(),
    registrations: {
      total: users.length,
      joinedLast7Days: countUsersJoinedSince(
        summaries,
        new Date(nowTime - 7 * DAY_MS),
        nowTime
      ),
      joinedLast30Days: countUsersJoinedSince(
        summaries,
        new Date(nowTime - 30 * DAY_MS),
        nowTime
      ),
      recent,
    },
    topWorkspaceItems: rankUsersByCount(summaries, workspaceCounts),
    topInvitations: rankUsersByCount(summaries, invitationCounts),
    providerUsage: {
      total: totalUsage,
      topUsers: rankUsersByUsage(summaries, usage),
    },
  };
}
