"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveCustomAssignment,
  updateCustomAssignment,
} from "@/lib/teaching/assignment-store";
import {
  getAssignedStudentIds,
  registerAssignment,
} from "@/lib/teaching/assignment-registry";
import {
  parseStudentCsv,
  generateCsvTemplate,
  CsvImportResult,
} from "@/lib/teaching/csv-import";
import { resolveAssignmentStudentIds } from "@/lib/teaching/resolve-assignment-students";
import { useUserContext } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AssignmentTier,
  CreateAssignmentInput,
  StudentAssignment,
  StudentClassData,
} from "@/lib/teaching/types";
import { DEFAULT_LANGUAGE_LOCALE, LANGUAGE_LOCALES } from "@opencanvas/shared";
import { normalizeAssignmentLocale } from "@/lib/teaching/assignment-policy";
import { FREE_STUDENTS_PER_ASSIGNMENT_CAP } from "@/lib/teaching/assignment-policy";
import { useTranslations } from "next-intl";

interface CreateAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** When set, dialog opens in edit mode pre-filled with this assignment. */
  editAssignment?: StudentAssignment;
  /**
   * Prefill from a shared seed template. Always creates a new owned custom
   * assignment — never reuses or registers the shared seed id.
   */
  templateAssignment?: StudentAssignment;
}

interface Student {
  id: string;
  email: string;
}

export function CreateAssignmentDialog({
  open,
  onOpenChange,
  onCreated,
  editAssignment,
  templateAssignment,
}: CreateAssignmentDialogProps) {
  const t = useTranslations("teaching");
  const { getUser } = useUserContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"details" | "assign">("details");

  // Form state
  const [title, setTitle] = useState("");
  const [courseLabel, setCourseLabel] = useState("");
  const [dueLabel, setDueLabel] = useState("");
  const [wordTarget, setWordTarget] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [locale, setLocale] = useState<string>(DEFAULT_LANGUAGE_LOCALE);
  const [tier, setTier] = useState<AssignmentTier>("free");
  const [apparatuses, setApparatuses] = useState<
    Array<{
      id: string;
      name: string;
      profiles?: Array<{ id: string; label: string }>;
    }>
  >([]);
  const [apparatusProfileId, setApparatusProfileId] = useState(
    "canonical-constrained-dialogue"
  );

  // Assignment state
  const [assignMode, setAssignMode] = useState<
    "all_students" | "selected_students" | "class"
  >("all_students");
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<StudentClassData[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const prefillSource = templateAssignment ?? editAssignment;

  // Fetch students and pre-fill form when dialog opens
  useEffect(() => {
    if (!open) return;

    fetchStudents();
    fetchClasses();
    fetchApparatuses();
    if (prefillSource) {
      setTitle(prefillSource.title);
      setCourseLabel(prefillSource.courseLabel);
      setDueLabel(prefillSource.dueLabel);
      setWordTarget(prefillSource.wordTarget?.toString() || "");
      setPrompt(prefillSource.prompt);
      setAgentInstructions(prefillSource.agentInstructions);
      setLocale(normalizeAssignmentLocale(prefillSource.locale));
      setTier(prefillSource.tier === "premium" ? "premium" : "free");
      setApparatusProfileId(
        prefillSource.apparatusProfileId || "canonical-constrained-dialogue"
      );
    } else {
      setTier("free");
    }

    // Hydrate prior assignees when editing an already-registered assignment
    if (editAssignment && !templateAssignment) {
      void getAssignedStudentIds(editAssignment.id).then((ids) => {
        if (ids.length === 0) return;
        setSelectedStudentIds(new Set(ids));
        setAssignMode("selected_students");
      });
    }
  }, [open, prefillSource, editAssignment, templateAssignment]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const response = await fetch("/api/teacher/students");
      if (!response.ok) {
        throw new Error(t("failedToFetchStudents"));
      }
      const data = await response.json();
      setStudents(data.students || []);
    } catch (error) {
      console.error("Error fetching students:", error);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchClasses = async () => {
    setLoadingClasses(true);
    try {
      const response = await fetch("/api/teacher/classes");
      if (!response.ok) {
        throw new Error(t("failedToFetchClasses"));
      }
      const data = await response.json();
      setClasses(data.classes || []);
    } catch (error) {
      console.error("Error fetching classes:", error);
      setClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  };

  const fetchApparatuses = async () => {
    try {
      const response = await fetch("/api/methods");
      if (!response.ok) return;
      const data = await response.json();
      const enabled = Array.isArray(data.enabled)
        ? new Set<string>(data.enabled)
        : undefined;
      setApparatuses(
        (data.methods || []).filter(
          (entry: { id: string }) => !enabled || enabled.has(entry.id)
        )
      );
    } catch (error) {
      console.error("Error fetching apparatus catalog:", error);
    }
  };

  const resetForm = () => {
    setActiveTab("details");
    setTitle("");
    setCourseLabel("");
    setDueLabel("");
    setWordTarget("");
    setPrompt("");
    setAgentInstructions("");
    setLocale(DEFAULT_LANGUAGE_LOCALE);
    setTier("free");
    setApparatusProfileId("canonical-constrained-dialogue");
    setAssignMode("all_students");
    setSelectedStudentIds(new Set());
    setSelectedClassId("");
    setClasses([]);
    setCsvResult(null);
    setSaving(false);
  };

  const isFormValid = () => {
    return (
      title.trim() && courseLabel.trim() && dueLabel.trim() && prompt.trim()
    );
  };

  const getSelectedStudentIds = (): string[] => {
    return resolveAssignmentStudentIds({
      assignMode,
      students,
      classes,
      selectedClassId,
      selectedStudentIds: Array.from(selectedStudentIds),
    });
  };

  const canAssign = () => {
    if (!isFormValid()) return false;
    if (assignMode === "class") return selectedClassId.length > 0;
    // All / selected both need at least one roster student at click time
    // (all_students also re-fetches on save, but do not enable a no-op Assign).
    if (assignMode === "all_students") return students.length > 0;
    return getSelectedStudentIds().length > 0;
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map((s) => s.id)));
    }
  };

  const handleStudentToggle = (studentId: string) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudentIds(newSelected);
  };

  const handleCsvUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseStudentCsv(file, students);
      setCsvResult(result);

      // Auto-check matched students
      const matchedIds = result.matched.map((m) => m.studentId);
      setSelectedStudentIds(
        new Set([...Array.from(selectedStudentIds), ...matchedIds])
      );

      // Switch to selected students mode
      setAssignMode("selected_students");
    } catch (error) {
      console.error("Error parsing CSV:", error);
      setCsvResult({
        emails: [],
        matched: [],
        unmatched: [t("errorParsingCsvFile")],
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadCsvTemplate = () => {
    const template = generateCsvTemplate();
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = async (shouldAssign: boolean) => {
    if (!isFormValid()) return;

    setSaving(true);
    try {
      const user = await getUser();
      if (!user) {
        throw new Error(t("userNotAuthenticated"));
      }

      const teacherName = user.email || t("unknownTeacher");

      // Resolve student IDs at save time for "all_students" and "class" modes
      let studentList = students;
      let classList = classes;

      if (
        assignMode === "all_students" &&
        studentList.length === 0 &&
        shouldAssign
      ) {
        try {
          const resp = await fetch("/api/teacher/students");
          if (resp.ok) {
            const data = await resp.json();
            studentList = data.students || [];
            setStudents(studentList);
          }
        } catch (e) {
          console.error("Failed to fetch students at save time:", e);
        }
      }

      if (assignMode === "class" && (classList.length === 0 || shouldAssign)) {
        try {
          const resp = await fetch("/api/teacher/classes");
          if (resp.ok) {
            const data = await resp.json();
            classList = data.classes || [];
            setClasses(classList);
          }
        } catch (e) {
          console.error("Failed to fetch classes at save time:", e);
        }
      }

      const resolvedStudentIds = resolveAssignmentStudentIds({
        assignMode,
        students: studentList,
        classes: classList,
        selectedClassId,
        selectedStudentIds: Array.from(selectedStudentIds),
      });

      if (shouldAssign && resolvedStudentIds.length === 0) {
        throw new Error(
          assignMode === "class"
            ? t("selectedClassHasNoStudents")
            : t("selectStudentToAssign")
        );
      }

      if (
        shouldAssign &&
        resolvedStudentIds.length > FREE_STUDENTS_PER_ASSIGNMENT_CAP
      ) {
        throw new Error(
          `Assignments may have at most ${FREE_STUDENTS_PER_ASSIGNMENT_CAP} students.`
        );
      }

      // Editing keeps existing tier; new/template uses selected tier.
      const effectiveTier: AssignmentTier =
        editAssignment && !templateAssignment
          ? editAssignment.tier === "premium"
            ? "premium"
            : "free"
          : tier;

      const assignmentInput: CreateAssignmentInput = {
        title: title.trim(),
        locale,
        courseLabel: courseLabel.trim(),
        dueLabel: dueLabel.trim(),
        prompt: prompt.trim(),
        agentInstructions:
          agentInstructions.trim() ||
          "Act as a Socratic writing coach. Help students improve their writing through thoughtful questions and guidance.",
        wordTarget: wordTarget ? parseInt(wordTarget, 10) : undefined,
        tier: effectiveTier,
        apparatusId: editAssignment?.apparatusId || "ai-assisted-essay",
        apparatusProfileId,
        assignTo:
          assignMode === "class"
            ? {
                mode: "class",
                classId: selectedClassId,
                studentIds: resolvedStudentIds,
              }
            : {
                mode: assignMode,
                studentIds: resolvedStudentIds,
              },
      };

      // Templates always become a new owned custom assignment (never reuse
      // the shared seed id). Own drafts update in place.
      let savedId: string;
      if (editAssignment && !templateAssignment) {
        const updated = await updateCustomAssignment(
          editAssignment.id,
          assignmentInput
        );
        savedId = updated?.id ?? editAssignment.id;
      } else {
        const created = await saveCustomAssignment(
          assignmentInput,
          teacherName,
          user.id
        );
        savedId = created.id;
      }

      if (shouldAssign) {
        await registerAssignment({
          assignmentId: savedId,
          assignedStudentIds: resolvedStudentIds,
          assignedAt: new Date().toISOString(),
        });
      }

      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      console.error("Error saving assignment:", error);
      toast({
        title: shouldAssign ? t("assignmentFailed") : t("saveFailed"),
        description:
          error instanceof Error ? error.message : t("couldNotSaveAssignment"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const tierLocked = Boolean(editAssignment && !templateAssignment);

  const renderDetailsTab = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t("titleRequired")}</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("assignmentTitlePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assignment-locale">{t("assignmentLanguage")}</Label>
        <select
          id="assignment-locale"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          {LANGUAGE_LOCALES.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apparatus-profile">
          {t("researchApparatusProfile")}
        </Label>
        <select
          id="apparatus-profile"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={apparatusProfileId}
          onChange={(event) => setApparatusProfileId(event.target.value)}
          disabled={tierLocked}
        >
          {(apparatuses.length
            ? apparatuses.flatMap((apparatus) =>
                (apparatus.profiles || []).map((profile) => ({
                  id: profile.id,
                  label: `${apparatus.name} — ${profile.label}`,
                }))
              )
            : [
                {
                  id: "canonical-constrained-dialogue",
                  label: t("canonicalEssayProfile"),
                },
              ]
          ).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t("immutableProfileDescription")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="course">{t("courseRequired")}</Label>
        <Input
          id="course"
          value={courseLabel}
          onChange={(e) => setCourseLabel(e.target.value)}
          placeholder={t("coursePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dueDate">{t("dueDateRequired")}</Label>
        <Input
          id="dueDate"
          value={dueLabel}
          onChange={(e) => setDueLabel(e.target.value)}
          placeholder={t("dueDatePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wordTarget">{t("wordTarget")}</Label>
        <Input
          id="wordTarget"
          type="number"
          value={wordTarget}
          onChange={(e) => setWordTarget(e.target.value)}
          placeholder={t("wordTargetPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">{t("essayPromptRequired")}</Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("essayPromptPlaceholder")}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agentInstructions">{t("agentInstructions")}</Label>
        <Textarea
          id="agentInstructions"
          value={agentInstructions}
          onChange={(e) => setAgentInstructions(e.target.value)}
          placeholder={t("agentInstructionsPlaceholder")}
          rows={6}
        />
      </div>
    </div>
  );

  const renderAssignTab = () => (
    <div className="space-y-6">
      {/* Assignment Mode Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("assignTo")}</Label>
        {assignMode === "all_students" && students.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("noStudentsInviteOrPickClass")}
          </p>
        )}

        <div className="space-y-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assignMode"
              checked={assignMode === "all_students"}
              onChange={() => setAssignMode("all_students")}
              className="h-4 w-4"
            />
            <span className="text-sm">
              {t("allStudentsInClasses", { count: students.length })}
            </span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assignMode"
              checked={assignMode === "selected_students"}
              onChange={() => setAssignMode("selected_students")}
              className="h-4 w-4"
            />
            <span className="text-sm">{t("selectStudents")}</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="assignMode"
              checked={assignMode === "class"}
              onChange={() => setAssignMode("class")}
              className="h-4 w-4"
            />
            <span className="text-sm">{t("assignToClass")}</span>
          </label>
        </div>
      </div>

      {assignMode === "class" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("class")}</Label>
          {loadingClasses ? (
            <div className="text-sm text-muted-foreground">
              {t("loadingClasses")}
            </div>
          ) : classes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("noClassesCreateFirst")}
            </div>
          ) : (
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectClass")} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((studentClass) => (
                  <SelectItem key={studentClass.id} value={studentClass.id}>
                    {t("classStudentCount", {
                      name: studentClass.name,
                      count: studentClass.students.length,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Student Selection */}
      {assignMode === "selected_students" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("students")}</Label>
            {students.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedStudentIds.size === students.length
                  ? t("deselectAll")
                  : t("selectAll")}
              </Button>
            )}
          </div>

          {loadingStudents ? (
            <div className="text-sm text-muted-foreground">
              {t("loadingStudents")}
            </div>
          ) : students.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("noStudentsInviteFirst")}
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center space-x-2 p-2 border-b last:border-b-0"
                >
                  <Checkbox
                    id={student.id}
                    checked={selectedStudentIds.has(student.id)}
                    onCheckedChange={() => handleStudentToggle(student.id)}
                  />
                  <label
                    htmlFor={student.id}
                    className="text-sm flex-1 cursor-pointer"
                  >
                    {student.email}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CSV Import */}
      {assignMode !== "class" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("importFromCsv")}</Label>

          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1"
            >
              <Upload className="h-4 w-4" />
              <span>{t("uploadCsv")}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={downloadCsvTemplate}
              className="flex items-center space-x-1"
            >
              <Download className="h-4 w-4" />
              <span>{t("downloadTemplate")}</span>
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
          />

          {csvResult && (
            <div className="text-sm space-y-1">
              <div className="text-green-600">
                {t("studentsMatched", { count: csvResult.matched.length })}
              </div>
              {csvResult.unmatched.length > 0 && (
                <div className="text-orange-600">
                  {t("emailsNotFound", { count: csvResult.unmatched.length })}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {csvResult.unmatched.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {templateAssignment
              ? t("assignFromTemplate")
              : editAssignment
                ? t("editAssignmentTitle")
                : t("createAssignmentTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex space-x-6 border-b">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`pb-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "details"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("details")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("assign")}
              className={`pb-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "assign"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("assign")}
            </button>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === "details" && renderDetailsTab()}
            {activeTab === "assign" && renderAssignTab()}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={!isFormValid() || saving}
          >
            {saving ? t("saving") : t("saveDraft")}
          </Button>

          <Button
            type="button"
            onClick={() => handleSave(true)}
            disabled={!canAssign() || saving}
          >
            {saving ? t("assigning") : t("assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
