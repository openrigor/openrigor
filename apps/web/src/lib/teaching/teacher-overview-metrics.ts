export type MetricValue = number | null;

export type TeacherOverviewMetrics = {
  /** Deprecated compatibility field; billing is not part of the beta. */
  credits: MetricValue;
  teachersActive: MetricValue;
  teachersInvited: MetricValue;
  classes: MetricValue;
  studentsActive: MetricValue;
  studentsInvited: MetricValue;
  assignments: MetricValue;
};

export type TeacherOverviewMetricsInput = {
  /** Legacy value is retained for read compatibility; beta UI never renders it. */
  credits?: number | null;
  /** Older callers supplied the balance under this name. */
  balance?: number | null;
  balanceError?: boolean;
  orgTeacherIds?: string[] | null;
  orgError?: boolean;
  /** Pending teacher invites; omit/null if viewer cannot list them */
  pendingTeacherInvites?: number | null;
  teacherInvitesError?: boolean;
  classCount?: number | null;
  classesError?: boolean;
  activeStudentCount?: number | null;
  studentsError?: boolean;
  pendingStudentInvites?: number | null;
  studentInvitesError?: boolean;
  assignmentCount?: number | null;
  assignmentsError?: boolean;
};

function metricFromNumber(
  error: boolean | undefined,
  value: number | null | undefined
): MetricValue {
  if (error) return null;
  if (typeof value === "number") return value;
  return null;
}

function metricFromArrayLength(
  error: boolean | undefined,
  values: string[] | null | undefined
): MetricValue {
  if (error) return null;
  if (Array.isArray(values)) return values.length;
  return null;
}

function metricFromInviteCount(
  error: boolean | undefined,
  pendingInvites: number | null | undefined
): MetricValue {
  if (error) return null;
  if (pendingInvites === undefined || pendingInvites === null) return null;
  return pendingInvites;
}

export function buildTeacherOverviewMetrics(
  input: TeacherOverviewMetricsInput
): TeacherOverviewMetrics {
  return {
    credits: input.balanceError
      ? null
      : typeof (input.credits ?? input.balance) === "number" &&
          Number.isFinite(input.credits ?? input.balance)
        ? (input.credits ?? input.balance)!
        : null,
    teachersActive: metricFromArrayLength(input.orgError, input.orgTeacherIds),
    teachersInvited: metricFromInviteCount(
      input.teacherInvitesError,
      input.pendingTeacherInvites
    ),
    classes: metricFromNumber(input.classesError, input.classCount),
    studentsActive: metricFromNumber(
      input.studentsError,
      input.activeStudentCount
    ),
    studentsInvited: metricFromInviteCount(
      input.studentInvitesError,
      input.pendingStudentInvites
    ),
    assignments: metricFromNumber(
      input.assignmentsError,
      input.assignmentCount
    ),
  };
}
