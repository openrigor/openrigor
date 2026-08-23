import { randomUUID } from "node:crypto";
import { Client } from "@langchain/langgraph-sdk";
import { LANGGRAPH_API_URL } from "@/constants";
import {
  aggregateUsageEvents,
  type UsageTotals,
} from "@/lib/admin/aggregation";
import { readAllStoreItems } from "@/lib/admin/store-reader";

export type ProviderUsageEvent = {
  date: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
};

export const PROVIDER_USAGE_ROOT = "provider_usage";

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nonNegativeInteger(value: number | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 0;
}

/**
 * Append an immutable event under a unique key. Unique keys avoid lost
 * updates when several runs finish at the same time; totals are aggregated on
 * read instead of maintained as a shared counter.
 */
export async function appendProviderUsageEvent(
  userId: string,
  tokens?: { tokensIn?: number; tokensOut?: number },
  date = new Date()
): Promise<void> {
  const day = utcDate(date);
  const event: ProviderUsageEvent = {
    date: day,
    requests: 1,
    tokensIn: nonNegativeInteger(tokens?.tokensIn),
    tokensOut: nonNegativeInteger(tokens?.tokensOut),
  };
  await client().store.putItem(
    [PROVIDER_USAGE_ROOT, userId],
    `event:${day}:${randomUUID()}`,
    event
  );
}

export async function listUsage(userId: string): Promise<UsageTotals> {
  const items = await readAllStoreItems([PROVIDER_USAGE_ROOT, userId]);
  return aggregateUsageEvents(
    items.map((item) => item.value).filter((value) => value !== undefined)
  );
}
