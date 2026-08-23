export type AssignmentCompletionStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "abandoned";

/** Legacy assignment routing retained only for reading older file-backed rows. */
export type AssignmentTier = "free" | "premium";

/** Whether the assignment still consumes an active free slot. */
export type AssignmentLifecycleStatus = "open" | "closed";

export interface StudentAssignment {
  id: string;
  /** e.g. "English Lit" */
  courseLabel: string;
  teacherName: string;
  /**
   * Owning teacher's Supabase user id.
   * Required for custom assignments; seed catalog rows omit this.
   */
  teacherId?: string;
  /** Short display, e.g. "8 Jun" */
  dueLabel: string;
  title: string;
  prompt: string;
  /** Injected as LangGraph configurable systemPrompt for this assignment */
  agentInstructions: string;
  /** Server-authoritative chat model; omit to use the budget default. */
  customModelName?: string;
  wordTarget?: number;
  /** Initial canvas markdown (usually empty) */
  starterMarkdown?: string;
  /** 0–100 for progress bar */
  completionPercent: number;
  status: AssignmentCompletionStatus;
  /** Defaults to "free" for legacy rows; the beta has no paid tier. */
  tier?: AssignmentTier;
  /** Defaults to "open" for legacy rows. */
  lifecycleStatus?: AssignmentLifecycleStatus;
  /** ISO timestamp when teacher closed the assignment. */
  closedAt?: string;
  /** Immutable Research apparatus identity captured at assignment creation. */
  apparatusId?: string;
  apparatusVersion?: string;
  apparatusProfileId?: string;
  apparatusConfiguration?: import("@opencanvas/shared").ApparatusConfiguration;
}

/** Metadata stored on LangGraph threads for teaching prototype. */
export interface TeachingThreadMetadata {
  supabase_user_id: string;
  assignment_id?: string;
  completionPercent?: number;
  customModelName?: string;
  modelConfig?: Record<string, unknown>;
  abandoned?: boolean;
  abandonedAt?: string;
}

/** Teacher view of an assignment with aggregated submission stats. */
export interface TeacherAssignmentView extends StudentAssignment {
  totalStudents: number;
  submittedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  submissionRate: number; // 0-100
}

/** A student's submission for a specific assignment. */
export interface StudentSubmission {
  threadId: string;
  studentEmail: string;
  supabaseUserId: string;
  status: AssignmentCompletionStatus;
  completionPercent: number;
  lastActivity?: string;
}

/** Input shape for creating a new assignment (no id/status/completion yet). */
export interface CreateAssignmentInput {
  title: string;
  courseLabel: string;
  dueLabel: string;
  prompt: string;
  agentInstructions: string;
  wordTarget?: number;
  starterMarkdown?: string;
  /** Who this assignment is assigned to. */
  assignTo: AssignToSelection;
  /** Defaults to "free" for compatibility; treatment is controlled by apparatus profiles. */
  tier?: AssignmentTier;
  apparatusId?: string;
  apparatusProfileId?: string;
}

/** How students are targeted for an assignment. */
export interface AssignToSelection {
  mode: "all_students" | "selected_students" | "class";
  studentIds?: string[];
  classId?: string;
}

/** Invitation product role — admin is org admin (app_metadata on accept). */
export type InvitationRole = "admin" | "teacher" | "student";

export interface Invitation {
  id: string;
  email: string;
  role: InvitationRole;
  classId: string | null;
  className: string | null;
  token: string;
  status: "pending" | "accepted" | "expired";
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface ClassStudent {
  supabaseUserId: string;
  email: string;
  name: string;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface StudentClass {
  id: string;
  name: string;
  teacherId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentClassData {
  id: string;
  name: string;
  teacherId: string;
  students: ClassStudent[];
  createdAt: string;
  updatedAt: string;
}

export interface InvitationRecord {
  id: string;
  email: string;
  token?: string;
  role: InvitationRole;
  status: "pending" | "completed" | "expired";
  invitedAt: string;
  completedAt?: string;
  classId?: string;
}

export interface ClassRecord {
  id: string;
  name: string;
  teacherEmail: string;
  studentIds: string[];
  createdAt: string;
  teacherName?: string;
  studentNames?: Record<string, { name?: string; surname?: string }>;
}

/** Org membership: one admin owns a roster of delegated teachers. */
export type Org = {
  id: string;
  adminUserId: string;
  teacherIds: string[];
  createdAt: string;
  /** Enabled research apparatus ids (SaaS org-level set, 2A-3). Absent = default set. */
  apparatuses?: string[];
};

export interface InviteTeacherInput {
  email: string;
}

export interface InviteStudentsInput {
  emails: string;
  className: string;
}

export function invitationToRecord(invitation: Invitation): InvitationRecord {
  return {
    id: invitation.id,
    email: invitation.email,
    token: invitation.token,
    role: invitation.role,
    status:
      invitation.status === "accepted"
        ? "completed"
        : invitation.status === "expired"
          ? "expired"
          : "pending",
    invitedAt: invitation.created_at,
    completedAt: invitation.accepted_at ?? undefined,
    classId: invitation.classId ?? undefined,
  };
}

export function classDataToRecord(
  studentClass: StudentClassData,
  teacherEmail: string,
  teacherName?: string
): ClassRecord {
  return {
    id: studentClass.id,
    name: studentClass.name,
    teacherEmail,
    teacherName,
    studentIds: studentClass.students
      .map((student) => student.supabaseUserId)
      .filter((id) => id.length > 0),
    createdAt: studentClass.createdAt,
    studentNames: Object.fromEntries(
      studentClass.students
        .filter((student) => student.supabaseUserId)
        .map((student) => [
          student.supabaseUserId,
          { name: student.name || undefined },
        ])
    ),
  };
}
