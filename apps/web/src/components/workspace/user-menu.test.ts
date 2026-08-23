import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { getUserInitials } from "./user-menu";

function userWith(partial: {
  email?: string;
  full_name?: string;
  name?: string;
}): User {
  return {
    id: "test-user",
    aud: "authenticated",
    role: "authenticated",
    email: partial.email,
    app_metadata: {},
    user_metadata: {
      ...(partial.full_name !== undefined
        ? { full_name: partial.full_name }
        : {}),
      ...(partial.name !== undefined ? { name: partial.name } : {}),
    },
    created_at: new Date().toISOString(),
  } as User;
}

describe("getUserInitials", () => {
  it("uses first and last initials from full_name", () => {
    expect(
      getUserInitials(userWith({ full_name: "Jane Doe", email: "j@x.com" }))
    ).toBe("JD");
  });

  it("falls back to user_metadata.name when full_name is absent", () => {
    expect(getUserInitials(userWith({ name: "Ada", email: "a@x.com" }))).toBe(
      "A"
    );
  });

  it("uses the email local-part first letter when names are empty", () => {
    expect(getUserInitials(userWith({ email: "cronjev@example.com" }))).toBe(
      "C"
    );
  });

  it("returns empty string when email and names are missing", () => {
    expect(getUserInitials(userWith({}))).toBe("");
  });

  it("ignores blank full_name and uses email", () => {
    expect(
      getUserInitials(userWith({ full_name: "   ", email: "zoe@example.com" }))
    ).toBe("Z");
  });
});
