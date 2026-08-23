"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserContext } from "@/contexts/UserContext";
import { getAllAssignments } from "@/lib/teaching/assignment-store";
import { getAssignmentRegistry } from "@/lib/teaching/assignment-registry";
import { getSeedAssignments } from "@/lib/teaching/assignments";
import {
  buildTeacherOverviewMetrics,
  type TeacherOverviewMetrics,
  type TeacherOverviewMetricsInput,
} from "@/lib/teaching/teacher-overview-metrics";
import { registryTouchesTeacherStudents } from "@/lib/teaching/teacher-submission-scope";

type InvitationResponse = {
  invitations?: Array<{ status?: unknown }>;
};

type ClassesResponse = {
  classes?: Array<{
    students?: Array<{ supabaseUserId?: unknown }>;
  }>;
};

type OrgResponse = {
  org?: { teacherIds?: unknown } | null;
};

const emptyMetrics = buildTeacherOverviewMetrics({});

function formatMetric(value: number | null): string {
  return value === null ? "—" : String(value);
}

function formatActiveAndInvited(
  active: number | null,
  invited: number | null
): string {
  return `${formatMetric(active)} / ${formatMetric(invited)}`;
}

function countPendingInvitations(data: InvitationResponse): number {
  return Array.isArray(data.invitations)
    ? data.invitations.filter((invitation) => invitation.status === "pending")
        .length
    : 0;
}

async function responseData<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return response.json() as Promise<T>;
}

export function TeacherOverviewDashboard({
  canInviteTeachers,
}: {
  canInviteTeachers: boolean;
}) {
  const { user } = useUserContext();
  const [metrics, setMetrics] = useState<TeacherOverviewMetrics>(emptyMetrics);

  useEffect(() => {
    let cancelled = false;

    const loadMetrics = async () => {
      const requests = await Promise.allSettled([
        responseData<OrgResponse>("/api/teacher/org"),
        canInviteTeachers
          ? responseData<InvitationResponse>("/api/admin/teachers/invitations")
          : Promise.resolve(null),
        responseData<ClassesResponse>("/api/teacher/classes"),
        responseData<InvitationResponse>("/api/teacher/invitations"),
      ]);

      const [
        orgResult,
        teacherInvitesResult,
        classesResult,
        studentInvitesResult,
      ] = requests;

      const input: TeacherOverviewMetricsInput = {
        orgError: orgResult.status === "rejected",
        teacherInvitesError:
          canInviteTeachers && teacherInvitesResult.status === "rejected",
        classesError: classesResult.status === "rejected",
        studentInvitesError: studentInvitesResult.status === "rejected",
      };

      if (orgResult.status === "fulfilled") {
        const { teacherIds } = orgResult.value.org ?? {};
        if (
          Array.isArray(teacherIds) &&
          teacherIds.every((id) => typeof id === "string")
        ) {
          input.orgTeacherIds =
            canInviteTeachers && typeof user?.id === "string"
              ? Array.from(new Set([...teacherIds, user.id]))
              : teacherIds;
        } else if (orgResult.value.org === null) {
          input.orgTeacherIds = [];
        } else {
          input.orgError = true;
        }
      }

      if (
        teacherInvitesResult.status === "fulfilled" &&
        teacherInvitesResult.value
      ) {
        input.pendingTeacherInvites = countPendingInvitations(
          teacherInvitesResult.value
        );
      }

      let teacherStudentIds = new Set<string>();
      if (classesResult.status === "fulfilled") {
        const { classes } = classesResult.value;
        if (Array.isArray(classes)) {
          input.classCount = classes.length;
          teacherStudentIds = new Set(
            classes.flatMap((studentClass) =>
              (studentClass.students ?? [])
                .map((student) => student.supabaseUserId)
                .filter(
                  (id): id is string => typeof id === "string" && id.length > 0
                )
            )
          );
          input.activeStudentCount = teacherStudentIds.size;
        } else {
          input.classesError = true;
          input.studentsError = true;
        }
      }

      if (studentInvitesResult.status === "fulfilled") {
        input.pendingStudentInvites = countPendingInvitations(
          studentInvitesResult.value
        );
      }

      try {
        const customs = await getAllAssignments();
        const seeds = await getSeedAssignments();
        let registry: Awaited<ReturnType<typeof getAssignmentRegistry>> = [];

        try {
          registry = await getAssignmentRegistry();
        } catch {
          registry = [];
        }

        input.assignmentCount =
          customs.length +
          seeds.filter((seed) =>
            registryTouchesTeacherStudents(
              registry.find((entry) => entry.assignmentId === seed.id),
              teacherStudentIds
            )
          ).length;
      } catch {
        input.assignmentsError = true;
      }

      if (!cancelled) {
        setMetrics(buildTeacherOverviewMetrics(input));
      }
    };

    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [canInviteTeachers, user?.id]);

  const tiles = [
    {
      testId: "overview-tile-teachers",
      label: "Teachers",
      value: formatActiveAndInvited(
        metrics.teachersActive,
        metrics.teachersInvited
      ),
    },
    {
      testId: "overview-tile-classes",
      label: "Classes",
      value: formatMetric(metrics.classes),
    },
    {
      testId: "overview-tile-students",
      label: "Students",
      value: formatActiveAndInvited(
        metrics.studentsActive,
        metrics.studentsInvited
      ),
    },
    {
      testId: "overview-tile-assignments",
      label: "Assignments",
      value: formatMetric(metrics.assignments),
    },
  ];

  return (
    <section className="space-y-4" data-testid="teacher-overview">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organisation, assignments, classes, invitations, and
          research apparatuses.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.testId} data-testid={tile.testId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {tile.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
