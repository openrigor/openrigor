"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import { InviteTeacherDialog } from "@/components/admin/invite-teacher-dialog";
import {
  DEFAULT_TEACHER_SECTION,
  TeacherWorkspaceSection,
} from "@/lib/teaching/teacher-workspace-nav";
import { TeacherOverviewDashboard } from "./teacher-overview-dashboard";
import { ApparatusCatalogPanel } from "./apparatus-catalog-panel";
import { AssignmentListView } from "./assignment-list-view";
import { ClassManagement } from "./class-management";
import { InviteStudentsPanel } from "./invite-students-panel";
import { canInviteTeachers } from "@/lib/teaching/teacher-utils";
import { isTeacher } from "@/lib/teaching/teacher-utils";
import { postLoginPath } from "@/lib/teaching/config";
import { TeacherWorkspaceShell } from "./teacher-workspace-shell";

export function TeacherLandingPage() {
  const { user } = useUserContext();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<TeacherWorkspaceSection>(
    DEFAULT_TEACHER_SECTION
  );
  const showInviteTeachers = canInviteTeachers(user);

  useEffect(() => {
    if (user && !isTeacher(user)) {
      window.location.replace(postLoginPath(user));
    }
  }, [user]);

  useEffect(() => {
    const requestedSection = searchParams.get(
      "section"
    ) as TeacherWorkspaceSection | null;
    const validSections: TeacherWorkspaceSection[] = [
      "overview",
      "apparatuses",
      "assignments",
      "classes",
      "invite-teachers",
      "invite-students",
    ];
    if (requestedSection && validSections.includes(requestedSection)) {
      setSection(requestedSection);
    }
  }, [searchParams]);

  useEffect(() => {
    if (section === "invite-teachers" && !showInviteTeachers) {
      setSection(DEFAULT_TEACHER_SECTION);
    }
  }, [section, showInviteTeachers]);

  // After all hooks — early return must not precede useEffect (Rules of Hooks).
  if (user && !isTeacher(user)) return null;

  return (
    <TeacherWorkspaceShell section={section} onSectionChange={setSection}>
      {section === "overview" && (
        <TeacherOverviewDashboard canInviteTeachers={showInviteTeachers} />
      )}
      {section === "apparatuses" && (
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Research apparatuses
            </h1>
            <p className="text-sm text-muted-foreground">
              Inspect the public specifications and enable reviewed profiles for
              this organisation.
            </p>
          </div>
          <ApparatusCatalogPanel />
        </div>
      )}
      {section === "assignments" && (
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">
              Loading assignments…
            </div>
          }
        >
          <AssignmentListView />
        </Suspense>
      )}
      {section === "classes" && <ClassManagement />}
      {section === "invite-teachers" && showInviteTeachers && (
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-semibold">Invite Teachers</h1>
          <InviteTeacherDialog />
        </div>
      )}
      {section === "invite-students" && (
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-semibold">Invite Students</h1>
          <InviteStudentsPanel />
        </div>
      )}
    </TeacherWorkspaceShell>
  );
}
