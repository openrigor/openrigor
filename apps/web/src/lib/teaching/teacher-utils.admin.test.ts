import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  canInviteAdmins,
  canInviteTeachers,
  canTopUpCredits,
  isAdmin,
  isOrgAdmin,
  isOwner,
  isResearcher,
  isTeacher,
  canAccessStudentDashboard,
} from "./teacher-utils";
import { postLoginPath } from "./config";

function user(partial: {
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): User {
  return {
    id: "test-id",
    aud: "authenticated",
    created_at: new Date().toISOString(),
    app_metadata: partial.app_metadata ?? {},
    user_metadata: partial.user_metadata ?? {},
    email: partial.email,
  } as User;
}

describe("owner / org admin / teacher roles", () => {
  const prevTeaching = process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE = "true";
  });

  afterEach(() => {
    if (prevTeaching === undefined) {
      delete process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE;
    } else {
      process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE = prevTeaching;
    }
  });

  it("isOwner only when app_metadata.role is owner", () => {
    expect(isOwner(user({ app_metadata: { role: "owner" } }))).toBe(true);
    expect(isOwner(user({ app_metadata: { role: "admin" } }))).toBe(false);
    expect(isOwner(user({ user_metadata: { role: "owner" } }))).toBe(false);
    expect(isOwner(user({ user_metadata: { role: "teacher" } }))).toBe(false);
  });

  it("isOrgAdmin only when app_metadata.role is admin", () => {
    expect(isOrgAdmin(user({ app_metadata: { role: "admin" } }))).toBe(true);
    expect(isOrgAdmin(user({ app_metadata: { role: "owner" } }))).toBe(false);
    expect(isOrgAdmin(user({ user_metadata: { role: "admin" } }))).toBe(false);
    expect(isOrgAdmin(user({ user_metadata: { role: "teacher" } }))).toBe(
      false
    );
  });

  it("isAdmin is a deprecated alias of isOwner", () => {
    expect(isAdmin(user({ app_metadata: { role: "owner" } }))).toBe(true);
    expect(isAdmin(user({ app_metadata: { role: "admin" } }))).toBe(false);
  });

  it("isTeacher is true for org admins and teachers, false for owners", () => {
    expect(isTeacher(user({ app_metadata: { role: "admin" } }))).toBe(true);
    expect(isTeacher(user({ app_metadata: { role: "teacher" } }))).toBe(true);
    expect(isTeacher(user({ user_metadata: { role: "teacher" } }))).toBe(false);
    expect(isTeacher(user({ app_metadata: { role: "owner" } }))).toBe(false);
    expect(
      isTeacher(
        user({
          app_metadata: { role: "owner" },
          user_metadata: { role: "teacher" },
        })
      )
    ).toBe(false);
  });

  it("capability helpers gate on owner vs org admin", () => {
    const owner = user({ app_metadata: { role: "owner" } });
    const orgAdmin = user({ app_metadata: { role: "admin" } });
    const teacher = user({ app_metadata: { role: "teacher" } });

    expect(canInviteAdmins(owner)).toBe(true);
    expect(canInviteAdmins(orgAdmin)).toBe(false);
    expect(canInviteAdmins(teacher)).toBe(false);

    expect(canInviteTeachers(orgAdmin)).toBe(true);
    expect(canInviteTeachers(owner)).toBe(false);
    expect(canInviteTeachers(teacher)).toBe(false);

    expect(canTopUpCredits(orgAdmin)).toBe(true);
    expect(canTopUpCredits(owner)).toBe(false);
    expect(canTopUpCredits(teacher)).toBe(false);
  });

  it("postLoginPath routes every retained user to /workspace", () => {
    expect(postLoginPath({ app_metadata: { role: "owner" } })).toBe(
      "/workspace"
    );
  });

  it("postLoginPath ignores legacy organisation roles", () => {
    expect(
      postLoginPath({
        app_metadata: { role: "admin" },
        user_metadata: { role: "teacher" },
      })
    ).toBe("/workspace");
  });

  it("postLoginPath routes legacy teacher claims to /workspace", () => {
    expect(postLoginPath({ app_metadata: { role: "teacher" } })).toBe(
      "/workspace"
    );
    expect(postLoginPath({ user_metadata: { role: "teacher" } })).toBe(
      "/workspace"
    );
  });

  it("postLoginPath routes legacy student claims to /workspace", () => {
    expect(postLoginPath({ app_metadata: { role: "student" } })).toBe(
      "/workspace"
    );
    expect(postLoginPath({ user_metadata: { role: "student" } })).toBe(
      "/workspace"
    );
  });

  it("routes legacy researcher claims to the org workspace", () => {
    expect(postLoginPath({ user_metadata: { role: "researcher" } })).toBe(
      "/workspace"
    );
  });

  it("does not expose an in-app researcher persona", () => {
    expect(isResearcher(user({ user_metadata: { role: "researcher" } }))).toBe(
      false
    );
    expect(isResearcher(user({ user_metadata: { role: "teacher" } }))).toBe(
      false
    );
    expect(isResearcher(user({ app_metadata: { role: "owner" } }))).toBe(false);
    expect(
      canAccessStudentDashboard(user({ app_metadata: { role: "student" } }))
    ).toBe(true);
    expect(
      canAccessStudentDashboard(user({ user_metadata: { role: "student" } }))
    ).toBe(false);
    expect(
      canAccessStudentDashboard(user({ user_metadata: { role: "teacher" } }))
    ).toBe(false);
  });

  it("routes role-less (fresh OAuth) users to the org workspace", () => {
    expect(postLoginPath({ app_metadata: { provider: "google" } })).toBe(
      "/workspace"
    );
    expect(postLoginPath({})).toBe("/workspace");
    expect(postLoginPath(null)).toBe("/workspace");
  });

  it("keeps direct registration on the org workspace when apparatus env is absent", () => {
    const previous = process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE;
    const previousApparatuses = process.env.NEXT_PUBLIC_APPARATUSES;
    delete process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE;
    delete process.env.NEXT_PUBLIC_APPARATUSES;
    try {
      expect(postLoginPath({})).toBe("/workspace");
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE;
      } else {
        process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE = previous;
      }
      if (previousApparatuses === undefined) {
        delete process.env.NEXT_PUBLIC_APPARATUSES;
      } else {
        process.env.NEXT_PUBLIC_APPARATUSES = previousApparatuses;
      }
    }
  });

  it("postLoginPath ignores legacy test-user routing", () => {
    const prev = process.env.TEST_TEACHER_EMAIL;
    process.env.TEST_TEACHER_EMAIL = "test-teacher@example.com";
    try {
      expect(postLoginPath({ email: "test-teacher@example.com" })).toBe(
        "/workspace"
      );
    } finally {
      if (prev === undefined) {
        delete process.env.TEST_TEACHER_EMAIL;
      } else {
        process.env.TEST_TEACHER_EMAIL = prev;
      }
    }
  });
});
