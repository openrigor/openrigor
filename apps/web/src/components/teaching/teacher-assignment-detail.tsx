"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useUserContext } from "@/contexts/UserContext";
import { getAssignedStudentIds } from "@/lib/teaching/assignment-registry";
import { getAssignmentByIdIncludingCustom } from "@/lib/teaching/assignment-store";
import {
  filterThreadsByStudentIds,
  studentIdsFromClasses,
} from "@/lib/teaching/teacher-submission-scope";
import {
  StudentAssignment,
  StudentClassData,
  StudentSubmission,
  TeachingThreadMetadata,
} from "@/lib/teaching/types";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { CreateAssignmentDialog } from "./create-assignment-dialog";
import { TeacherAssignmentBreadcrumb } from "./teacher-assignment-breadcrumb";

interface TeacherAssignmentDetailProps {
  assignmentId: string;
}

async function loadClassesForViewer(
  viewerId: string | undefined,
  ownerTeacherId: string | undefined
): Promise<StudentClassData[]> {
  const isOwn = !ownerTeacherId || !viewerId || ownerTeacherId === viewerId;

  if (isOwn) {
    const classesResponse = await fetch("/api/teacher/classes");
    if (!classesResponse.ok) return [];
    const classesData = await classesResponse.json();
    return (classesData.classes || []) as StudentClassData[];
  }

  // Org-admin read-only drill-down into a linked teacher's roster.
  const res = await fetch(
    `/api/teacher/org/teachers/${encodeURIComponent(ownerTeacherId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.classes || []) as StudentClassData[];
}

export function TeacherAssignmentDetail({
  assignmentId,
}: TeacherAssignmentDetailProps) {
  const router = useRouter();
  const { user } = useUserContext();
  const { getAllThreadsForAssignment } = useThreadContext();
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const ownsAssignment =
    !!assignment?.teacherId && !!user?.id && assignment.teacherId === user.id;

  const loadAssignmentAndSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const assignmentData =
        await getAssignmentByIdIncludingCustom(assignmentId);
      setAssignment(assignmentData ?? null);

      if (!assignmentData) return;

      let teacherStudentIds = new Set<string>();
      const studentLookup: Record<string, { email: string }> = {};
      try {
        const classes = await loadClassesForViewer(
          user?.id,
          assignmentData.teacherId
        );
        teacherStudentIds = studentIdsFromClasses(classes);
        for (const studentClass of classes) {
          for (const student of studentClass.students) {
            if (student.supabaseUserId) {
              studentLookup[student.supabaseUserId] = {
                email: student.email,
              };
            }
          }
        }
      } catch {
        // fall through with empty roster
      }

      const assignedIds = await getAssignedStudentIds(assignmentId);
      // Show assignees that belong to this teacher's roster (ignore global noise)
      const rosterAssigned = assignedIds.filter((id) =>
        teacherStudentIds.has(id)
      );
      setAssignedCount(rosterAssigned.length);

      const threads = filterThreadsByStudentIds(
        await getAllThreadsForAssignment(assignmentId),
        teacherStudentIds
      );

      const bestPerStudent: Record<string, StudentSubmission> = {};

      for (const thread of threads) {
        const metadata = thread.metadata as unknown as TeachingThreadMetadata;
        const userId = metadata.supabase_user_id;
        if (!userId || metadata.abandoned) continue;

        const completionPercent = metadata.completionPercent ?? 0;
        let status: "not_started" | "in_progress" | "submitted";
        if (completionPercent >= 100) {
          status = "submitted";
        } else if (completionPercent > 0) {
          status = "in_progress";
        } else {
          status = "not_started";
        }

        const submission: StudentSubmission = {
          threadId: thread.thread_id,
          studentEmail: studentLookup[userId]?.email || "Unknown",
          supabaseUserId: userId,
          status,
          completionPercent,
          lastActivity: thread.updated_at,
        };

        const current = bestPerStudent[userId];
        const statusRank = (s: string) =>
          s === "submitted" ? 2 : s === "in_progress" ? 1 : 0;
        if (!current || statusRank(status) > statusRank(current.status)) {
          bestPerStudent[userId] = submission;
        }
      }

      // Assigned students with no thread yet still appear as not started
      for (const userId of rosterAssigned) {
        if (bestPerStudent[userId]) continue;
        bestPerStudent[userId] = {
          threadId: "",
          studentEmail: studentLookup[userId]?.email || "Unknown",
          supabaseUserId: userId,
          status: "not_started",
          completionPercent: 0,
        };
      }

      setSubmissions(Object.values(bestPerStudent));
    } catch (error) {
      console.error("Failed to load assignment and submissions:", error);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, getAllThreadsForAssignment, user?.id]);

  useEffect(() => {
    void loadAssignmentAndSubmissions();
  }, [loadAssignmentAndSubmissions]);

  const handleBack = () => {
    router.push("/teacher?section=assignments");
  };

  const handleViewSubmission = (threadId: string) => {
    router.push(`/teacher/assignment/${assignmentId}/student/${threadId}`);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "submitted":
        return "default";
      case "in_progress":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "submitted":
        return "Submitted";
      case "in_progress":
        return "In Progress";
      default:
        return "Not Started";
    }
  };

  if (!assignment && !loading) {
    return (
      <div className="container max-w-4xl px-4 py-10">
        <div className="text-center">
          <TeacherAssignmentBreadcrumb currentLabel="Assignment not found" />
          <h1 className="text-2xl font-bold mb-4">Assignment Not Found</h1>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !assignment) {
    return (
      <div className="container max-w-4xl px-4 py-10">
        <div className="space-y-4">
          <TeacherAssignmentBreadcrumb currentLabel="Loading…" />
          <Button onClick={handleBack} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="text-sm text-muted-foreground">
            Loading submissions...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl px-4 py-10">
      <div className="space-y-6">
        <div className="space-y-4">
          <TeacherAssignmentBreadcrumb
            assignmentTitle={assignment.title}
            currentLabel="Assignment details"
          />
          <div className="flex items-center justify-between gap-2">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assignments
            </Button>
            {ownsAssignment ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                data-testid="edit-assignment-detail"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            ) : assignment.teacherId ? (
              <Badge variant="secondary" data-testid="assignment-read-only">
                Read-only
              </Badge>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <div className="space-y-2">
                <CardTitle className="text-xl">{assignment.title}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{assignment.courseLabel}</Badge>
                  <span>Due {assignment.dueLabel}</span>
                  <span>•</span>
                  <span>by {assignment.teacherName}</span>
                  {!assignment.teacherId && (
                    <Badge variant="secondary">Shared catalog id</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {assignment.prompt}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Assigned to {assignedCount} student
                {assignedCount === 1 ? "" : "s"} in{" "}
                {ownsAssignment ? "your" : "this teacher's"} classes
                {ownsAssignment && assignedCount === 0
                  ? " — use Edit → Assign to add students from your roster."
                  : "."}
              </p>
              {!assignment.teacherId && submissions.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  This URL is a shared starter-template id. Assign it from{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={handleBack}
                  >
                    Starter templates
                  </button>{" "}
                  on your dashboard to create your own copy — other
                  teachers&apos; students are never shown here.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Student Submissions ({submissions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students from your classes are assigned yet.
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((submission) => (
                  <div
                    key={
                      submission.threadId ||
                      `pending-${submission.supabaseUserId}`
                    }
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium text-sm">
                          {submission.studentEmail}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {submission.completionPercent}% complete
                          {submission.lastActivity && (
                            <span className="ml-2">
                              • Last activity:{" "}
                              {new Date(
                                submission.lastActivity
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(submission.status)}>
                        {getStatusLabel(submission.status)}
                      </Badge>

                      {submission.status === "submitted" &&
                        submission.threadId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleViewSubmission(submission.threadId)
                            }
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateAssignmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onCreated={() => {
          void loadAssignmentAndSubmissions();
        }}
        editAssignment={ownsAssignment ? assignment : undefined}
      />
    </div>
  );
}
