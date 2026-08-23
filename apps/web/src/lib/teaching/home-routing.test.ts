import { describe, expect, it } from "vitest";
import {
  allowsTeachingHomeCanvas,
  deniedTeachingRoleRedirect,
  sharedAuthCookieDomain,
} from "./home-routing";

describe("allowsTeachingHomeCanvas", () => {
  it("never enables the legacy canvas workspace at / (now the landing)", () => {
    expect(
      allowsTeachingHomeCanvas({
        isTeaching: false,
        isOwner: true,
        isTeacher: true,
        hasAssignment: false,
      })
    ).toBe(false);
    expect(
      allowsTeachingHomeCanvas({
        isTeaching: true,
        isOwner: false,
        isTeacher: false,
        hasAssignment: true,
      })
    ).toBe(false);
  });
});

describe("deniedTeachingRoleRedirect", () => {
  it("sends students away from /teacher and /owner", () => {
    const opts = {
      isTeaching: true,
      isOwner: false,
      isTeacher: false,
      isResearcher: false,
    };
    expect(deniedTeachingRoleRedirect({ ...opts, pathname: "/teacher" })).toBe(
      "/student"
    );
    expect(
      deniedTeachingRoleRedirect({
        ...opts,
        pathname: "/teacher/assignment/abc",
      })
    ).toBe("/student");
    expect(deniedTeachingRoleRedirect({ ...opts, pathname: "/owner" })).toBe(
      "/student"
    );
  });

  it("allows teachers on /teacher and owners on /owner", () => {
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/teacher",
        isOwner: false,
        isTeacher: true,
        isResearcher: false,
      })
    ).toBeNull();
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/owner",
        isOwner: true,
        isTeacher: false,
        isResearcher: false,
      })
    ).toBeNull();
  });

  it("does not role-gate the public research route", () => {
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/researcher",
        isOwner: false,
        isTeacher: false,
        isResearcher: false,
      })
    ).toBeNull();
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/researcher",
        isOwner: true,
        isTeacher: false,
        isResearcher: false,
      })
    ).toBeNull();
  });

  it("sends owners off /teacher and teachers off /owner", () => {
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/teacher",
        isOwner: true,
        isTeacher: false,
        isResearcher: false,
      })
    ).toBe("/owner");
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: true,
        pathname: "/owner",
        isOwner: false,
        isTeacher: true,
        isResearcher: false,
      })
    ).toBe("/teacher");
  });

  it("is a no-op when teaching mode is off", () => {
    expect(
      deniedTeachingRoleRedirect({
        isTeaching: false,
        pathname: "/teacher",
        isOwner: false,
        isTeacher: false,
        isResearcher: false,
      })
    ).toBeNull();
  });
});

describe("sharedAuthCookieDomain", () => {
  it("scopes evaluchat hosts to .evaluchat.org", () => {
    expect(sharedAuthCookieDomain("evaluchat.org")).toBe(".evaluchat.org");
    expect(sharedAuthCookieDomain("knowledge.evaluchat.org")).toBe(
      ".evaluchat.org"
    );
    expect(sharedAuthCookieDomain("dev.evaluchat.org")).toBe(".evaluchat.org");
  });

  it("returns undefined for localhost", () => {
    expect(sharedAuthCookieDomain("localhost")).toBeUndefined();
    expect(sharedAuthCookieDomain("127.0.0.1")).toBeUndefined();
  });
});
