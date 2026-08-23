import { describe, expect, it } from "vitest";
import { DOCS_URL } from "@/components/auth/login/login-branding";
import {
  DEFAULT_TEACHER_SECTION,
  TEACHER_WORKSPACE_NAV,
  visibleTeacherNavItems,
} from "./teacher-workspace-nav";

describe("teacher-workspace-nav", () => {
  it("defaults to overview", () => {
    expect(DEFAULT_TEACHER_SECTION).toBe("overview");
  });

  it("hides invite-teachers for non-admins", () => {
    const ids = visibleTeacherNavItems(false).map((i) => i.id);
    expect(ids).not.toContain("invite-teachers");
    expect(ids).toEqual([
      "overview",
      "apparatuses",
      "assignments",
      "classes",
      "invite-students",
      "docs",
    ]);
  });

  it("shows invite-teachers for admins", () => {
    const ids = visibleTeacherNavItems(true).map((i) => i.id);
    expect(ids).toContain("invite-teachers");
  });

  it("excludes credits from nav model", () => {
    const ids = TEACHER_WORKSPACE_NAV.map((i) => i.id);
    expect(ids).not.toContain("credits" as string);
  });

  it("marks docs as external link", () => {
    const docs = TEACHER_WORKSPACE_NAV.find((i) => i.id === "docs");
    expect(docs?.kind).toBe("external");
    expect(docs?.href).toBe(DOCS_URL);
  });
});
