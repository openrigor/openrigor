import { afterEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { isAdminDashboardEnabled, isPlatformAdmin } from "./guard";

function user(email?: string): User {
  return { email } as User;
}

describe("admin dashboard guard", () => {
  const previous = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (previous === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previous;
  });

  it("is disabled when ADMIN_EMAILS is unset or empty", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminDashboardEnabled()).toBe(false);
    process.env.ADMIN_EMAILS = " ,  ";
    expect(isAdminDashboardEnabled()).toBe(false);
  });

  it("matches configured emails case-insensitively and with whitespace", () => {
    process.env.ADMIN_EMAILS = " admin@example.com, second@example.com ";
    expect(isPlatformAdmin(user(" ADMIN@EXAMPLE.COM "))).toBe(true);
    expect(isPlatformAdmin(user("second@example.com"))).toBe(true);
    expect(isPlatformAdmin(user("other@example.com"))).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });

  it("reads ADMIN_EMAILS at request time", () => {
    process.env.ADMIN_EMAILS = "first@example.com";
    expect(isPlatformAdmin(user("second@example.com"))).toBe(false);
    process.env.ADMIN_EMAILS = "second@example.com";
    expect(isPlatformAdmin(user("second@example.com"))).toBe(true);
  });
});
