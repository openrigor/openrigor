"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClassStudent } from "@/lib/teaching/types";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClassRosterProps {
  classId: string;
  className: string;
  students?: ClassStudent[];
  onChanged?: () => void;
}

export function ClassRoster({
  classId,
  className,
  students: initialStudents,
  onChanged,
}: ClassRosterProps) {
  const t = useTranslations("teaching");
  const commonT = useTranslations("common");
  const [students, setStudents] = useState<ClassStudent[]>(
    initialStudents ?? []
  );
  const [loading, setLoading] = useState(!initialStudents);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ClassStudent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/teacher/classes/${classId}/students`);
      if (!res.ok) {
        throw new Error(t("failedToLoadClassRoster"));
      }

      const data = await res.json();
      const mapped = (data.students ?? []).map(
        (s: { studentId: string; email: string; name?: string }) => ({
          supabaseUserId: s.studentId,
          email: s.email,
          name: s.name ?? "",
          invitedAt: "",
          acceptedAt: null,
        })
      );

      setStudents(mapped);
    } catch (loadError) {
      console.error("Failed to load roster:", loadError);
      setError(t("couldNotLoadStudents"));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (initialStudents) {
      setStudents(initialStudents);
      setLoading(false);
      return;
    }

    loadStudents();
  }, [initialStudents, loadStudents]);

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;

    const studentId =
      removeTarget.supabaseUserId || removeTarget.email.toLowerCase();

    setRemovingId(studentId);
    setError(null);

    try {
      const res = await fetch(
        `/api/teacher/classes/${classId}/students/${encodeURIComponent(studentId)}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t("failedToRemoveStudent"));
      }

      setRemoveTarget(null);
      await loadStudents();
      onChanged?.();
    } catch (removeError) {
      console.error("Failed to remove student:", removeError);
      setError(
        removeError instanceof Error
          ? removeError.message
          : t("failedToRemoveStudent")
      );
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("loadingRosterFor", { className })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t("classRoster", { className })}
        </h3>
        <Badge variant="secondary">
          {t("studentCount", { count: students.length })}
        </Badge>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("noStudentsInClass")}
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {students.map((student) => {
            const key = student.supabaseUserId || student.email;
            const status = student.acceptedAt ? "Joined" : "Invited";

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {student.name || t("pendingName")}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {student.email}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={student.acceptedAt ? "default" : "outline"}>
                    {status === "Joined" ? t("joined") : t("invited")}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(student)}
                    disabled={removingId === key}
                    title={t("removeStudent")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("removeStudent")}</DialogTitle>
            <DialogDescription>
              {t("removeStudentWarning", {
                email: removeTarget?.email ?? "",
                className,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={!!removingId}
            >
              {commonT("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={!!removingId}
            >
              {removingId ? t("removing") : t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
