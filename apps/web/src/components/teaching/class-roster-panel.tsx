"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StudentClass } from "@/lib/teaching/types";
import { ChevronDown, ChevronRight, Save } from "lucide-react";

interface RosterStudent {
  studentId: string;
  email: string;
  name: string;
  surname: string;
}

function splitName(fullName: string): { name: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { name: parts[0] ?? "", surname: "" };
  }

  return {
    name: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

function toRosterStudents(
  students: Array<{ studentId: string; email: string; name: string }>
): RosterStudent[] {
  return students.map((student) => {
    const parsed = splitName(student.name);
    return {
      studentId: student.studentId,
      email: student.email,
      name: parsed.name,
      surname: parsed.surname,
    };
  });
}

export function ClassRosterPanel() {
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [savingClassId, setSavingClassId] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    try {
      const res = await fetch("/api/teacher/classes");
      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to load classes:", data.error);
        return;
      }

      const nextClasses: StudentClass[] = (data.classes ?? []).map(
        (studentClass: {
          id: string;
          name: string;
          teacherId: string;
          createdAt: string;
          updatedAt: string;
        }) => ({
          id: studentClass.id,
          name: studentClass.name,
          teacherId: studentClass.teacherId,
          createdAt: studentClass.createdAt,
          updatedAt: studentClass.updatedAt,
        })
      );

      setClasses(nextClasses);
    } catch (error) {
      console.error("Failed to load classes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (classes.length === 0) {
      return;
    }

    let cancelled = false;

    const loadCounts = async () => {
      const entries = await Promise.all(
        classes.map(async (studentClass) => {
          try {
            const res = await fetch(
              `/api/teacher/classes/${studentClass.id}/students`
            );
            const data = await res.json();
            return [
              studentClass.id,
              Array.isArray(data.students) ? data.students.length : 0,
            ] as const;
          } catch {
            return [studentClass.id, 0] as const;
          }
        })
      );

      if (!cancelled) {
        setStudentCounts(Object.fromEntries(entries));
      }
    };

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, [classes]);

  const loadRoster = async (classId: string) => {
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/students`);
      const data = await res.json();
      const students = toRosterStudents(data.students ?? []);

      setRosters((prev) => ({
        ...prev,
        [classId]: students,
      }));
      setStudentCounts((prev) => ({
        ...prev,
        [classId]: students.length,
      }));
    } catch (error) {
      console.error("Failed to load roster:", error);
    }
  };

  const toggleClass = async (classId: string) => {
    if (expandedClassId === classId) {
      setExpandedClassId(null);
      return;
    }

    setExpandedClassId(classId);
    if (!rosters[classId]) {
      await loadRoster(classId);
    }
  };

  const updateStudentField = (
    classId: string,
    studentId: string,
    field: "name" | "surname",
    value: string
  ) => {
    setRosters((prev) => ({
      ...prev,
      [classId]: (prev[classId] ?? []).map((student) =>
        student.studentId === studentId
          ? { ...student, [field]: value }
          : student
      ),
    }));
  };

  const saveRoster = async (classId: string) => {
    const students = rosters[classId];
    if (!students) return;

    setSavingClassId(classId);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/students`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: students.map((student) => ({
            studentId: student.studentId,
            name: [student.name, student.surname].filter(Boolean).join(" "),
          })),
        }),
      });

      if (!res.ok) {
        console.error("Failed to save roster");
        return;
      }

      const data = await res.json();
      const updatedStudents = toRosterStudents(data.students ?? []);
      setRosters((prev) => ({
        ...prev,
        [classId]: updatedStudents,
      }));
      setStudentCounts((prev) => ({
        ...prev,
        [classId]: updatedStudents.length,
      }));
    } catch (error) {
      console.error("Failed to save roster:", error);
    } finally {
      setSavingClassId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading classes…</p>;
  }

  if (classes.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No classes yet. Import students to create your first class.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {classes.map((studentClass) => {
        const expanded = expandedClassId === studentClass.id;
        const roster = rosters[studentClass.id] ?? [];
        const count = studentCounts[studentClass.id];

        return (
          <Card key={studentClass.id}>
            <CardHeader className="pb-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => toggleClass(studentClass.id)}
              >
                <div className="flex items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CardTitle className="text-base">
                    {studentClass.name}
                  </CardTitle>
                </div>
                {count !== undefined && (
                  <Badge variant="secondary">
                    {count} student{count === 1 ? "" : "s"}
                  </Badge>
                )}
              </button>
            </CardHeader>

            {expanded && (
              <CardContent className="space-y-3">
                {roster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students enrolled yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {roster.map((student) => (
                      <div
                        key={student.studentId}
                        className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.5fr_1fr_1fr]"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{student.email}</div>
                        </div>
                        <Input
                          value={student.name}
                          onChange={(e) =>
                            updateStudentField(
                              studentClass.id,
                              student.studentId,
                              "name",
                              e.target.value
                            )
                          }
                          placeholder="First name"
                        />
                        <Input
                          value={student.surname}
                          onChange={(e) =>
                            updateStudentField(
                              studentClass.id,
                              student.studentId,
                              "surname",
                              e.target.value
                            )
                          }
                          placeholder="Surname"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {roster.length > 0 && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => saveRoster(studentClass.id)}
                    disabled={savingClassId === studentClass.id}
                  >
                    <Save className="h-4 w-4" />
                    {savingClassId === studentClass.id
                      ? "Saving…"
                      : "Save names"}
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
