import { DOCS_URL } from "@/components/auth/login/login-branding";

export type TeacherWorkspaceSection =
  | "overview"
  | "apparatuses"
  | "assignments"
  | "classes"
  | "invite-teachers"
  | "invite-students";

export type TeacherNavItem = {
  id: TeacherWorkspaceSection | "docs";
  label: string;
  kind: "section" | "external";
  href?: string;
  adminOnly?: boolean;
};

export const DEFAULT_TEACHER_SECTION: TeacherWorkspaceSection = "overview";

export const TEACHER_WORKSPACE_NAV: TeacherNavItem[] = [
  { id: "overview", label: "Overview", kind: "section" },
  { id: "apparatuses", label: "Research apparatuses", kind: "section" },
  { id: "assignments", label: "Assignments", kind: "section" },
  { id: "classes", label: "Classes", kind: "section" },
  {
    id: "invite-teachers",
    label: "Invite Teachers",
    kind: "section",
    adminOnly: true,
  },
  { id: "invite-students", label: "Invite Students", kind: "section" },
  {
    id: "docs",
    label: "Docs",
    kind: "external",
    href: DOCS_URL,
  },
];

export function visibleTeacherNavItems(
  canInviteTeachersFlag: boolean
): TeacherNavItem[] {
  return TEACHER_WORKSPACE_NAV.filter(
    (item) => !item.adminOnly || canInviteTeachersFlag
  );
}
