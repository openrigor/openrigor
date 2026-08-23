"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  Org,
  StudentAssignment,
  StudentClassData,
} from "@/lib/teaching/types";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

type TeacherOverview = {
  teacherId: string;
  classes: StudentClassData[];
  assignments: StudentAssignment[];
};

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function OrgOverviewPanel() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/org", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load organisation");
      }
      const data = (await res.json()) as { org?: Org | null };
      setOrg(data.org ?? null);
    } catch (loadError) {
      console.error("Failed to load org:", loadError);
      setError("Could not load organisation roster");
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  const loadTeacherOverview = useCallback(async (teacherId: string) => {
    setOverviewLoading(true);
    setOverviewError(null);
    setOverview(null);
    try {
      const res = await fetch(
        `/api/teacher/org/teachers/${encodeURIComponent(teacherId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load teacher overview");
      }
      setOverview({
        teacherId: data.teacherId as string,
        classes: (data.classes ?? []) as StudentClassData[],
        assignments: (data.assignments ?? []) as StudentAssignment[],
      });
    } catch (loadError) {
      console.error("Failed to load teacher overview:", loadError);
      setOverviewError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load teacher overview"
      );
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const handleToggleTeacher = (teacherId: string) => {
    if (expandedId === teacherId) {
      setExpandedId(null);
      setOverview(null);
      setOverviewError(null);
      return;
    }
    setExpandedId(teacherId);
    void loadTeacherOverview(teacherId);
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading organisation…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!org) {
    return null;
  }

  const teacherIds = org.teacherIds;

  return (
    <div className="space-y-4" data-testid="org-overview">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Organisation</h2>
        <p className="text-sm text-muted-foreground">
          Read-only view of linked teachers&apos; classes, assignments, and
          submissions. You cannot edit their work.
        </p>
      </div>

      {teacherIds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No linked teachers yet. Invite a teacher to collaborate in this
            organisation workspace.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {teacherIds.map((teacherId) => {
            const expanded = expandedId === teacherId;
            return (
              <li key={teacherId}>
                <Card>
                  <CardHeader className="pb-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => handleToggleTeacher(teacherId)}
                      data-testid={`org-teacher-${teacherId}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">
                            Teacher {shortId(teacherId)}
                          </CardTitle>
                          <p className="truncate text-xs text-muted-foreground">
                            {teacherId}
                          </p>
                        </div>
                      </div>
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </CardHeader>
                  {expanded ? (
                    <CardContent className="space-y-4 border-t pt-4">
                      {overviewLoading ? (
                        <p className="text-sm text-muted-foreground">
                          Loading classes and assignments…
                        </p>
                      ) : null}
                      {overviewError ? (
                        <p className="text-sm text-destructive" role="alert">
                          {overviewError}
                        </p>
                      ) : null}
                      {overview && overview.teacherId === teacherId ? (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-sm font-medium">Classes</h3>
                            {overview.classes.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No classes.
                              </p>
                            ) : (
                              <ul className="space-y-2">
                                {overview.classes.map((studentClass) => (
                                  <li
                                    key={studentClass.id}
                                    className="rounded-md border px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium">
                                        {studentClass.name}
                                      </span>
                                      <Badge variant="outline">
                                        {studentClass.students.length} student
                                        {studentClass.students.length === 1
                                          ? ""
                                          : "s"}
                                      </Badge>
                                    </div>
                                    {studentClass.students.length > 0 ? (
                                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                        {studentClass.students.map(
                                          (student) => (
                                            <li
                                              key={
                                                student.supabaseUserId ||
                                                student.email
                                              }
                                            >
                                              {student.email}
                                              {student.acceptedAt
                                                ? ""
                                                : " (invited)"}
                                            </li>
                                          )
                                        )}
                                      </ul>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="space-y-2">
                            <h3 className="text-sm font-medium">Assignments</h3>
                            {overview.assignments.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No custom assignments.
                              </p>
                            ) : (
                              <ul className="space-y-2">
                                {overview.assignments.map((assignment) => (
                                  <li key={assignment.id}>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-auto w-full justify-start px-3 py-2 text-left"
                                      onClick={() =>
                                        router.push(
                                          `/teacher/assignment/${assignment.id}`
                                        )
                                      }
                                      data-testid={`org-assignment-${assignment.id}`}
                                    >
                                      <div className="min-w-0 space-y-0.5">
                                        <div className="truncate text-sm font-medium">
                                          {assignment.title}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                          {assignment.courseLabel} · Due{" "}
                                          {assignment.dueLabel}
                                        </div>
                                      </div>
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Open an assignment to view submissions
                              (read-only).
                            </p>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
