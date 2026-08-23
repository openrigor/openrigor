"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUserContext } from "@/contexts/UserContext";
import { InviteTeacherDialog } from "@/components/admin/invite-teacher-dialog";
import {
  canInviteTeachers,
  isOwner,
  isTeacher,
} from "@/lib/teaching/teacher-utils";
import { AssignmentListView } from "./assignment-list-view";
import { InviteStudentsDialog } from "./invite-students-dialog";
import { OrgOverviewPanel } from "./org-overview";
import { Toaster } from "@/components/ui/toaster";

export function TeacherDashboard() {
  const router = useRouter();
  const { user, loading: userLoading } = useUserContext();
  const [inviteStudentsOpen, setInviteStudentsOpen] = useState(false);
  const [inviteTeachersOpen, setInviteTeachersOpen] = useState(false);

  const showInviteTeachers = canInviteTeachers(user);

  useEffect(() => {
    if (!userLoading && user && !isTeacher(user)) {
      router.replace(isOwner(user) ? "/owner" : "/student");
    }
  }, [user, userLoading, router]);

  if (userLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto flex h-14 max-w-5xl items-center justify-center gap-6 px-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              Organisation workspace
            </div>
            <Link
              href="/auth/signout"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5"
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Link>
          </div>
        </header>
        <main className="container mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading assignments…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            Organisation workspace
          </div>
          <div className="flex items-center gap-2">
            {showInviteTeachers ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setInviteTeachersOpen(true)}
                data-testid="invite-teacher-button"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite teacher
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setInviteStudentsOpen(true)}
            >
              <Users className="h-3.5 w-3.5" />
              Import students
            </Button>
            <Link
              href="/auth/signout"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5"
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-10 space-y-10">
        {showInviteTeachers ? <OrgOverviewPanel /> : null}
        <AssignmentListView />
      </main>

      <InviteStudentsDialog
        open={inviteStudentsOpen}
        onOpenChange={setInviteStudentsOpen}
      />
      <Dialog open={inviteTeachersOpen} onOpenChange={setInviteTeachersOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite teacher</DialogTitle>
            <DialogDescription>
              Delegated teachers can manage their own classes and students. They
              cannot invite other teachers.
            </DialogDescription>
          </DialogHeader>
          <InviteTeacherDialog />
        </DialogContent>
      </Dialog>
      <Toaster />
    </div>
  );
}
