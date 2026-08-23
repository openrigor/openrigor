import { describe, expect, it } from "vitest";
import {
  classifyProxyPath,
  isThreadCreate,
  isThreadListGet,
  threadOwnerMatches,
  withOwnedThreadMetadata,
} from "./thread-ownership";

describe("classifyProxyPath", () => {
  it("detects store paths", () => {
    expect(classifyProxyPath("store")).toEqual({ kind: "store" });
    expect(classifyProxyPath("store/items")).toEqual({ kind: "store" });
  });

  it("detects thread search and list/create", () => {
    expect(classifyProxyPath("threads/search")).toEqual({
      kind: "thread_search",
    });
    expect(classifyProxyPath("threads")).toEqual({ kind: "thread_list" });
  });

  it("extracts thread id from nested paths", () => {
    expect(classifyProxyPath("threads/abc-123")).toEqual({
      kind: "thread_by_id",
      threadId: "abc-123",
    });
    expect(classifyProxyPath("threads/abc-123/runs/stream")).toEqual({
      kind: "thread_by_id",
      threadId: "abc-123",
    });
  });

  it("passes through unrelated paths", () => {
    expect(classifyProxyPath("assistants/search")).toEqual({ kind: "other" });
  });
});

describe("isThreadCreate / isThreadListGet", () => {
  const list = classifyProxyPath("threads");

  it("treats POST /threads as create", () => {
    expect(isThreadCreate("POST", list)).toBe(true);
    expect(isThreadCreate("GET", list)).toBe(false);
  });

  it("treats GET /threads as list", () => {
    expect(isThreadListGet("GET", list)).toBe(true);
    expect(isThreadListGet("POST", list)).toBe(false);
  });
});

describe("threadOwnerMatches", () => {
  it("matches when user_id equals authenticated user", () => {
    expect(threadOwnerMatches({ user_id: "u1" }, "u1")).toBe(true);
  });

  it("fails closed on missing metadata or wrong owner", () => {
    expect(threadOwnerMatches(undefined, "u1")).toBe(false);
    expect(threadOwnerMatches({}, "u1")).toBe(false);
    expect(threadOwnerMatches({ user_id: "other" }, "u1")).toBe(false);
    expect(threadOwnerMatches({ supabase_user_id: "u1" }, "u1")).toBe(false);
  });
});

describe("withOwnedThreadMetadata", () => {
  it("stamps user_id and preserves other fields", () => {
    expect(
      withOwnedThreadMetadata({ assignment_id: "a1", user_id: "evil" }, "u1")
    ).toEqual({ assignment_id: "a1", user_id: "u1" });
  });

  it("handles non-object metadata", () => {
    expect(withOwnedThreadMetadata(null, "u1")).toEqual({ user_id: "u1" });
  });
});
