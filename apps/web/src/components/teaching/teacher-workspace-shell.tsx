"use client";

import { ReactNode, useEffect } from "react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import {
  canInviteTeachers,
  isOwner,
  isTeacher,
} from "@/lib/teaching/teacher-utils";
import { TeacherWorkspaceSection } from "@/lib/teaching/teacher-workspace-nav";
import {
  WorkspaceSiteHeader,
  workspaceNavGhostClass,
} from "./workspace-site-header";
import { TeacherWorkspaceNav } from "./teacher-workspace-nav";
import { Toaster } from "@/components/ui/toaster";

interface TeacherWorkspaceShellProps {
  section: TeacherWorkspaceSection;
  onSectionChange: (section: TeacherWorkspaceSection) => void;
  children: ReactNode;
}

export function TeacherWorkspaceShell({
  section,
  onSectionChange,
  children,
}: TeacherWorkspaceShellProps) {
  const router = useRouter();
  const { user, loading: userLoading } = useUserContext();
  const showInviteTeachers = canInviteTeachers(user);

  useEffect(() => {
    if (!userLoading && user && !isTeacher(user)) {
      router.replace(isOwner(user) ? "/owner" : "/student");
    }
  }, [user, userLoading, router]);

  if (userLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <WorkspaceSiteHeader
          workspaceLabel="Organisation workspace"
          maxWidthClass="max-w-7xl"
        >
          <Link
            href="/auth/signout"
            className={workspaceNavGhostClass}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </WorkspaceSiteHeader>
        <main className="p-6 text-sm text-muted-foreground">Loading…</main>
      </div>
    );
  }

  if (!user || !isTeacher(user)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <WorkspaceSiteHeader
        workspaceLabel="Organisation workspace"
        maxWidthClass="max-w-7xl"
      >
        <Link
          href="/auth/signout"
          className={workspaceNavGhostClass}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Link>
      </WorkspaceSiteHeader>

      <div className="flex h-[calc(100vh-3.75rem)]">
        <TeacherWorkspaceNav
          section={section}
          onSectionChange={onSectionChange}
          canInviteTeachers={showInviteTeachers}
        />
        <main
          className="min-w-0 flex-1 overflow-y-auto p-6"
          data-testid="teacher-workspace-main"
        >
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  );
}

export function TeacherNestedWorkspaceShell({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <TeacherWorkspaceShell
      section="assignments"
      onSectionChange={(section) => router.push(`/teacher?section=${section}`)}
    >
      {children}
    </TeacherWorkspaceShell>
  );
}
