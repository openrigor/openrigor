import { maskEmail } from "./obfuscate";

export type AdminUserSummary = {
  id: string;
  email?: string | null;
  created_at: string;
};

export type RankedAdminUser = {
  userId: string;
  email: string;
  count: number;
};

export type RankedUsageUser = {
  userId: string;
  email: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
};

export type UsageTotals = {
  requests: number;
  tokensIn: number;
  tokensOut: number;
};

export function countUsersJoinedSince(
  users: AdminUserSummary[],
  since: Date,
  now = Date.now()
): number {
  const sinceTime = since.getTime();
  return users.filter((user) => {
    const createdAt = new Date(user.created_at).getTime();
    return (
      Number.isFinite(createdAt) && createdAt >= sinceTime && createdAt <= now
    );
  }).length;
}

export function rankUsersByCount(
  users: AdminUserSummary[],
  counts: Record<string, number>,
  limit = 10
): RankedAdminUser[] {
  return users
    .map((user) => ({
      userId: user.id,
      email: maskEmail(user.email),
      count: Number.isFinite(counts[user.id]) ? counts[user.id] : 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => {
      const countOrder = right.count - left.count;
      return countOrder || left.userId.localeCompare(right.userId);
    })
    .slice(0, limit);
}

export function aggregateUsageEvents(events: unknown[]): UsageTotals {
  return events.reduce<UsageTotals>(
    (totals, event) => {
      if (!event || typeof event !== "object") return totals;
      const value = event as Record<string, unknown>;
      const requests = value.requests;
      const tokensIn = value.tokensIn;
      const tokensOut = value.tokensOut;
      if (
        typeof requests === "number" &&
        Number.isFinite(requests) &&
        requests > 0
      ) {
        totals.requests += requests;
      }
      if (
        typeof tokensIn === "number" &&
        Number.isFinite(tokensIn) &&
        tokensIn > 0
      ) {
        totals.tokensIn += tokensIn;
      }
      if (
        typeof tokensOut === "number" &&
        Number.isFinite(tokensOut) &&
        tokensOut > 0
      ) {
        totals.tokensOut += tokensOut;
      }
      return totals;
    },
    { requests: 0, tokensIn: 0, tokensOut: 0 }
  );
}

export function rankUsersByUsage(
  users: AdminUserSummary[],
  usage: Record<string, UsageTotals>,
  limit = 10
): RankedUsageUser[] {
  return users
    .map((user) => ({
      userId: user.id,
      email: maskEmail(user.email),
      requests: usage[user.id]?.requests ?? 0,
      tokensIn: usage[user.id]?.tokensIn ?? 0,
      tokensOut: usage[user.id]?.tokensOut ?? 0,
    }))
    .filter((entry) => entry.requests > 0)
    .sort((left, right) => {
      const requestOrder = right.requests - left.requests;
      return requestOrder || left.userId.localeCompare(right.userId);
    })
    .slice(0, limit);
}

export function addUsageTotals(
  left: UsageTotals,
  right: UsageTotals
): UsageTotals {
  return {
    requests: left.requests + right.requests,
    tokensIn: left.tokensIn + right.tokensIn,
    tokensOut: left.tokensOut + right.tokensOut,
  };
}
