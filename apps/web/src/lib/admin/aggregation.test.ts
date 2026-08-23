import { describe, expect, it } from "vitest";
import {
  addUsageTotals,
  aggregateUsageEvents,
  countUsersJoinedSince,
  rankUsersByUsage,
  rankUsersByCount,
} from "./aggregation";

const now = Date.parse("2026-08-15T12:00:00.000Z");
const users = [
  {
    id: "one",
    email: "one@example.com",
    created_at: "2026-08-14T00:00:00.000Z",
  },
  {
    id: "two",
    email: "two@example.com",
    created_at: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "three",
    email: "three@example.com",
    created_at: "2026-07-01T00:00:00.000Z",
  },
];

describe("admin dashboard aggregation helpers", () => {
  it("counts users within a rolling window", () => {
    expect(
      countUsersJoinedSince(users, new Date("2026-08-08T12:00:00.000Z"), now)
    ).toBe(1);
    expect(
      countUsersJoinedSince(users, new Date("2026-07-16T12:00:00.000Z"), now)
    ).toBe(2);
    expect(
      countUsersJoinedSince(
        [
          ...users,
          {
            id: "future",
            email: "future@example.com",
            created_at: "2026-08-16T00:00:00.000Z",
          },
          {
            id: "invalid",
            email: "invalid@example.com",
            created_at: "not-a-date",
          },
        ],
        new Date("2026-08-08T12:00:00.000Z"),
        now
      )
    ).toBe(1);
  });

  it("ranks only active users and masks their emails", () => {
    expect(rankUsersByCount(users, { one: 2, two: 9, three: 0 }, 10)).toEqual([
      { userId: "two", email: "t***@example.com", count: 9 },
      { userId: "one", email: "o***@example.com", count: 2 },
    ]);
  });

  it("sums valid usage events and ignores malformed values", () => {
    expect(
      aggregateUsageEvents([
        { date: "2026-08-15", requests: 2, tokensIn: 100, tokensOut: 40 },
        { date: "2026-08-14", requests: 1, tokensIn: 20 },
        { requests: -1, tokensIn: "bad", tokensOut: 3 },
        null,
      ])
    ).toEqual({ requests: 3, tokensIn: 120, tokensOut: 43 });
  });

  it.each([true, [1], "2", Number.NaN, -1, 0])(
    "rejects non-positive or non-number usage values: %p",
    (invalid) => {
      expect(
        aggregateUsageEvents([
          { requests: invalid, tokensIn: invalid, tokensOut: invalid },
        ])
      ).toEqual({ requests: 0, tokensIn: 0, tokensOut: 0 });
    }
  );

  it("ranks usage by exact request count and masks missing emails", () => {
    expect(
      rankUsersByUsage(
        [
          ...users,
          { id: "four", email: null, created_at: "2026-08-15T00:00:00.000Z" },
        ],
        {
          one: { requests: 2, tokensIn: 10, tokensOut: 3 },
          two: { requests: 2, tokensIn: 8, tokensOut: 4 },
          four: { requests: 0, tokensIn: 100, tokensOut: 100 },
        },
        2
      )
    ).toEqual([
      {
        userId: "one",
        email: "o***@example.com",
        requests: 2,
        tokensIn: 10,
        tokensOut: 3,
      },
      {
        userId: "two",
        email: "t***@example.com",
        requests: 2,
        tokensIn: 8,
        tokensOut: 4,
      },
    ]);
  });

  it("adds usage totals without changing either input", () => {
    const left = { requests: 1, tokensIn: 2, tokensOut: 3 };
    const right = { requests: 4, tokensIn: 5, tokensOut: 6 };
    expect(addUsageTotals(left, right)).toEqual({
      requests: 5,
      tokensIn: 7,
      tokensOut: 9,
    });
    expect(left).toEqual({ requests: 1, tokensIn: 2, tokensOut: 3 });
    expect(right).toEqual({ requests: 4, tokensIn: 5, tokensOut: 6 });
  });
});
