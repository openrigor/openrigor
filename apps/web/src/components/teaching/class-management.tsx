"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudentClassData } from "@/lib/teaching/types";
import { ClassRoster } from "./class-roster";
import { StudentInviteForm } from "./student-invite-form";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClassManagementProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  refreshKey?: number;
}

export function ClassManagement({
  open,
  onOpenChange,
  refreshKey = 0,
}: ClassManagementProps = {}) {
  const t = useTranslations("teaching");
  const commonT = useTranslations("common");
  const isDialog = onOpenChange !== undefined;
  const [classes, setClasses] = useState<StudentClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StudentClassData | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentClassData | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/teacher/classes");
      if (!res.ok) {
        throw new Error(t("failedToLoadClasses"));
      }

      const data = await res.json();
      const nextClasses = (data.classes ?? []) as StudentClassData[];
      setClasses(nextClasses);

      if (
        selectedClassId &&
        !nextClasses.some((entry) => entry.id === selectedClassId)
      ) {
        setSelectedClassId(null);
      }
    } catch (loadError) {
      console.error("Failed to load classes:", loadError);
      setError(t("couldNotLoadClasses"));
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (isDialog && !open) {
      return;
    }

    loadClasses();
  }, [loadClasses, isDialog, open, refreshKey]);

  const selectedClass = classes.find((entry) => entry.id === selectedClassId);

  const handleCreateClass = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newClassName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/teacher/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? t("failedToCreateClass"));
      }

      setCreateOpen(false);
      setNewClassName("");
      await loadClasses();
      if (data.class?.id) {
        setSelectedClassId(data.class.id);
      }
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("failedToCreateClass")
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRenameClass = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renameTarget) return;

    const name = renameValue.trim();
    if (!name) return;

    setRenaming(true);
    setError(null);

    try {
      const res = await fetch(`/api/teacher/classes/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? t("failedToRenameClass"));
      }

      setRenameTarget(null);
      setRenameValue("");
      await loadClasses();
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : t("failedToRenameClass")
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/teacher/classes/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? t("failedToDeleteClass"));
      }

      setDeleteTarget(null);
      await loadClasses();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("failedToDeleteClass")
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    const loadingMessage = (
      <p className="text-sm text-muted-foreground">{t("loadingClasses")}</p>
    );
    if (isDialog) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
            {loadingMessage}
          </DialogContent>
        </Dialog>
      );
    }
    return loadingMessage;
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("classes")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("classesDescription")}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          {t("newClass")}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          {classes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("noClassesInviteStudents")}
              </CardContent>
            </Card>
          ) : (
            classes.map((studentClass) => (
              <Card
                key={studentClass.id}
                className={`cursor-pointer transition-colors ${
                  selectedClassId === studentClass.id
                    ? "border-primary"
                    : "hover:bg-muted/40"
                }`}
                onClick={() => setSelectedClassId(studentClass.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {studentClass.name}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("studentCount", {
                          count: studentClass.students.length,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRenameTarget(studentClass);
                          setRenameValue(studentClass.name);
                        }}
                        title={t("renameClass")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(studentClass);
                        }}
                        title={t("deleteClass")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-6">
          {selectedClass ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("inviteStudents")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StudentInviteForm
                    defaultClassName={selectedClass.name}
                    onInvited={loadClasses}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <ClassRoster
                    classId={selectedClass.id}
                    className={selectedClass.name}
                    students={selectedClass.students}
                    onChanged={loadClasses}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("selectClassToManage")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateClass}>
            <DialogHeader>
              <DialogTitle>{t("createClass")}</DialogTitle>
              <DialogDescription>{t("addEmptyClass")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="new-class-name">{t("className")}</Label>
              <Input
                id="new-class-name"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder={t("classNamePlaceholder")}
                required
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                {commonT("cancel")}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRenameClass}>
            <DialogHeader>
              <DialogTitle>{t("renameClass")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="rename-class">{t("className")}</Label>
              <Input
                id="rename-class"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                required
                disabled={renaming}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
                disabled={renaming}
              >
                {commonT("cancel")}
              </Button>
              <Button type="submit" disabled={renaming}>
                {renaming ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteClass")}</DialogTitle>
            <DialogDescription>
              {t("deleteClassWarning", { name: deleteTarget?.name ?? "" })}
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
              onClick={handleDeleteClass}
              disabled={deleting}
            >
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (isDialog) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("manageClasses")}</DialogTitle>
            <DialogDescription>{t("classesDescription")}</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
