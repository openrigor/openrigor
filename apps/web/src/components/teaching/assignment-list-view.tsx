"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useUserContext } from "@/contexts/UserContext";
import { CreateAssignmentDialog } from "./create-assignment-dialog";
import { ClassManagement } from "./class-management";
import { getAllAssignments } from "@/lib/teaching/assignment-store";
import { getSeedAssignments } from "@/lib/teaching/assignments";
import { getSubmissionStats, isTeacher } from "@/lib/teaching/teacher-utils";
import type {
  TeacherAssignmentView,
  StudentAssignment,
  StudentClassData,
} from "@/lib/teaching/types";
import {
  getAssignmentRegistry,
  isAssignmentAssigned,
  removeAssignment,
} from "@/lib/teaching/assignment-registry";
import { deleteCustomAssignment } from "@/lib/teaching/assignment-store";
import {
  filterThreadsByStudentIds,
  registryTouchesTeacherStudents,
  studentIdsFromClasses,
} from "@/lib/teaching/teacher-submission-scope";
import { normalizeLifecycleStatus } from "@/lib/teaching/assignment-policy";
import { assignmentLocaleLabel } from "@/lib/teaching/assignment-policy";
import { CloseAssignmentDialog } from "./close-assignment-dialog";
import { useTranslations } from "next-intl";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AssignmentListView() {
  const t = useTranslations("teaching");
  const commonT = useTranslations("common");
  const router = useRouter();
  const { user, loading: userLoading } = useUserContext();
  const { getAllThreadsForAssignment } = useThreadContext();
  const [assignmentViews, setAssignmentViews] = useState<
    TeacherAssignmentView[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<
    StudentAssignment | undefined
  >(undefined);
  const [templateAssignment, setTemplateAssignment] = useState<
    StudentAssignment | undefined
  >(undefined);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [closeTarget, setCloseTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeView, setActiveView] = useState<"assignments" | "classes">(
    "assignments"
  );

  const [templateViews, setTemplateViews] = useState<StudentAssignment[]>([]);

  // Auth guard
  useEffect(() => {
    if (!userLoading && user && !isTeacher(user)) {
      router.replace("/student");
    }
  }, [user, userLoading, router]);

  const toTeacherView = useCallback(
    async (
      assignment: StudentAssignment,
      teacherStudentIds: Set<string>
    ): Promise<TeacherAssignmentView> => {
      const threads = filterThreadsByStudentIds(
        await getAllThreadsForAssignment(assignment.id),
        teacherStudentIds
      );
      const stats = getSubmissionStats(threads);
      return {
        ...assignment,
        totalStudents: stats.total,
        submittedCount: stats.submitted,
        inProgressCount: stats.inProgress,
        notStartedCount: stats.notStarted,
        submissionRate:
          stats.total > 0
            ? Math.round((stats.submitted / stats.total) * 100)
            : 0,
      };
    },
    [getAllThreadsForAssignment]
  );

  const loadAssignmentData = useCallback(async () => {
    if (!user || !isTeacher(user)) return;
    try {
      const views: TeacherAssignmentView[] = [];
      const newDraftIds = new Set<string>();

      let teacherStudentIds = new Set<string>();
      try {
        const classesRes = await fetch("/api/teacher/classes");
        if (classesRes.ok) {
          const classesData = await classesRes.json();
          teacherStudentIds = studentIdsFromClasses(
            (classesData.classes || []) as StudentClassData[]
          );
        }
      } catch {
        // roster optional for listing; submissions stay empty if missing
      }

      let registry: Awaited<ReturnType<typeof getAssignmentRegistry>> = [];
      try {
        registry = await getAssignmentRegistry();
      } catch {
        registry = [];
      }

      // Own customs only — never other teachers' rows.
      for (const assignment of await getAllAssignments()) {
        const isAssigned = await isAssignmentAssigned(assignment.id);
        if (!isAssigned) {
          newDraftIds.add(assignment.id);
        }
        views.push(await toTeacherView(assignment, teacherStudentIds));
      }

      // Legacy: seed ids assigned to this teacher's students still appear
      // under "Your assignments". Unassigned seeds stay in Starter templates.
      const templates: StudentAssignment[] = [];
      for (const seed of await getSeedAssignments()) {
        const entry = registry.find((e) => e.assignmentId === seed.id);
        if (registryTouchesTeacherStudents(entry, teacherStudentIds)) {
          views.push(await toTeacherView(seed, teacherStudentIds));
        } else {
          templates.push(seed);
        }
      }

      setAssignmentViews(views);
      setTemplateViews(templates);
      setDraftIds(newDraftIds);
    } catch (error) {
      console.error("Failed to load assignment data:", error);
    } finally {
      setLoading(false);
    }
  }, [user, toTeacherView]);

  useEffect(() => {
    loadAssignmentData();
  }, [loadAssignmentData]);

  const handleAssignmentClick = async (assignment: TeacherAssignmentView) => {
    if (!(await isAssignmentAssigned(assignment.id))) {
      setTemplateAssignment(undefined);
      setEditAssignment(assignment);
      setCreateDialogOpen(true);
      return;
    }
    router.push(`/teacher/assignment/${assignment.id}`);
  };

  const handleTemplateClick = (assignment: StudentAssignment) => {
    // Always copy-into-own — never open the shared seed's live submission page.
    setEditAssignment(undefined);
    setTemplateAssignment(assignment);
    setCreateDialogOpen(true);
  };

  const handleCreateAssignment = () => {
    setEditAssignment(undefined);
    setTemplateAssignment(undefined);
    setCreateDialogOpen(true);
  };

  const handleEditClick = (
    e: React.MouseEvent,
    assignment: TeacherAssignmentView
  ) => {
    e.stopPropagation();
    setTemplateAssignment(undefined);
    setEditAssignment(assignment);
    setCreateDialogOpen(true);
  };

  const handleDeleteClick = (
    e: React.MouseEvent,
    assignment: TeacherAssignmentView
  ) => {
    e.stopPropagation();
    setDeleteTarget({ id: assignment.id, title: assignment.title });
  };

  const handleCloseClick = (
    e: React.MouseEvent,
    assignment: TeacherAssignmentView
  ) => {
    e.stopPropagation();
    setCloseTarget({ id: assignment.id, title: assignment.title });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomAssignment(deleteTarget.id);
      try {
        await removeAssignment(deleteTarget.id);
      } catch {
        // best-effort
      }
      setDeleteTarget(null);
      await loadAssignmentData();
    } catch (error) {
      console.error("Failed to delete assignment:", error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading || userLoading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {t("loadingAssignments")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b">
        <button
          type="button"
          onClick={() => setActiveView("assignments")}
          className={`px-1 pb-2 text-sm font-medium transition-colors ${
            activeView === "assignments"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("assignments")}
        </button>
        <button
          type="button"
          onClick={() => setActiveView("classes")}
          className={`px-1 pb-2 text-sm font-medium transition-colors ${
            activeView === "classes"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("classes")}
        </button>
      </div>

      {activeView === "classes" ? (
        <ClassManagement />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("yourAssignments")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {assignmentViews.length === 0
                  ? t("noAssignmentsYet")
                  : t("assignmentsToManage", { count: assignmentViews.length })}
              </p>
            </div>
            <Button
              onClick={handleCreateAssignment}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("createAssignment")}
            </Button>
          </div>

          <ul className="flex flex-col items-center gap-4">
            {assignmentViews.map((assignment) => (
              <li key={assignment.id} className="w-full max-w-2xl">
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleAssignmentClick(assignment)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {assignment.courseLabel} · {assignment.teacherName} ·
                          {t("courseTeacherDue", {
                            course: assignment.courseLabel,
                            teacher: assignment.teacherName,
                            due: assignment.dueLabel,
                          })}
                        </div>
                        <CardTitle className="text-lg">
                          {assignment.title}
                          {assignmentLocaleLabel(assignment.locale) && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-xs"
                              data-testid={`assignment-locale-${assignment.id}`}
                            >
                              {assignmentLocaleLabel(assignment.locale)}
                            </Badge>
                          )}
                          {draftIds.has(assignment.id) && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {t("draft")}
                            </Badge>
                          )}
                          {assignment.apparatusProfileId && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-xs"
                              data-testid={`apparatus-profile-${assignment.id}`}
                            >
                              {assignment.apparatusProfileId}
                            </Badge>
                          )}
                          {normalizeLifecycleStatus(
                            assignment.lifecycleStatus
                          ) === "closed" && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {t("closed")}
                            </Badge>
                          )}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {normalizeLifecycleStatus(
                          assignment.lifecycleStatus
                        ) === "open" &&
                          Boolean(assignment.teacherId) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              data-testid={`close-assignment-${assignment.id}`}
                              onClick={(e) => handleCloseClick(e, assignment)}
                              title={t("closeAssignment")}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`edit-assignment-${assignment.id}`}
                          onClick={(e) => handleEditClick(e, assignment)}
                          title={t("editAssignment")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`delete-assignment-${assignment.id}`}
                          onClick={(e) => handleDeleteClick(e, assignment)}
                          title={t("deleteAssignment")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {assignment.submittedCount}/{assignment.totalStudents}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("submittedLowercase")}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("submissionRate")}</span>
                        <span>{assignment.submissionRate}%</span>
                      </div>
                      <Progress value={assignment.submissionRate} />
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          <Badge variant="default" className="mr-1">
                            {assignment.submittedCount}
                          </Badge>
                          {t("submitted")}
                        </span>
                        <span>
                          <Badge variant="secondary" className="mr-1">
                            {assignment.inProgressCount}
                          </Badge>
                          {t("inProgress")}
                        </span>
                        <span>
                          <Badge variant="outline" className="mr-1">
                            {assignment.notStartedCount}
                          </Badge>
                          {t("notStarted")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}

            {assignmentViews.length === 0 && (
              <Card className="w-full max-w-2xl">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("noAssignmentsCreateOrAssign")}
                </CardContent>
              </Card>
            )}
          </ul>

          {templateViews.length > 0 && (
            <div className="space-y-3 pt-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t("starterTemplates")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("sharedCatalogAssignmentTemplates")}
                </p>
              </div>
              <ul className="flex flex-col items-center gap-4">
                {templateViews.map((assignment) => (
                  <li key={assignment.id} className="w-full max-w-2xl">
                    <Card
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleTemplateClick(assignment)}
                      data-testid={`template-${assignment.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {t("courseTemplateDue", {
                                course: assignment.courseLabel,
                                due: assignment.dueLabel,
                              })}
                            </div>
                            <CardTitle className="text-lg">
                              {assignment.title}
                              {assignmentLocaleLabel(assignment.locale) && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 text-xs"
                                  data-testid={`assignment-locale-${assignment.id}`}
                                >
                                  {assignmentLocaleLabel(assignment.locale)}
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className="ml-2 text-xs"
                              >
                                {t("template")}
                              </Badge>
                            </CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CreateAssignmentDialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) {
                setEditAssignment(undefined);
                setTemplateAssignment(undefined);
              }
            }}
            onCreated={loadAssignmentData}
            editAssignment={editAssignment}
            templateAssignment={templateAssignment}
          />

          <Dialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  {t("deleteAssignmentTitle")}
                </DialogTitle>
                <DialogDescription>
                  {t("aboutToDeleteAssignment", {
                    title: deleteTarget?.title ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  {commonT("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {t("deleting")}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      {t("delete")}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <CloseAssignmentDialog
            open={!!closeTarget}
            onOpenChange={(open) => {
              if (!open) setCloseTarget(null);
            }}
            assignmentId={closeTarget?.id ?? ""}
            assignmentTitle={closeTarget?.title ?? ""}
            onClosed={() => {
              setCloseTarget(null);
              void loadAssignmentData();
            }}
          />
        </>
      )}
    </div>
  );
}
