import { describe, expect, it } from "vitest";
import { buildTeacherOverviewMetrics } from "./teacher-overview-metrics";

describe("buildTeacherOverviewMetrics", () => {
  it("maps all fields on happy path", () => {
    expect(
      buildTeacherOverviewMetrics({
        balance: 42,
        orgTeacherIds: ["t1", "t2", "t3"],
        pendingTeacherInvites: 2,
        classCount: 5,
        activeStudentCount: 120,
        pendingStudentInvites: 8,
        assignmentCount: 15,
      })
    ).toEqual({
      credits: 42,
      teachersActive: 3,
      teachersInvited: 2,
      classes: 5,
      studentsActive: 120,
      studentsInvited: 8,
      assignments: 15,
    });
  });

  it("sets each metric to null when its error flag is true", () => {
    expect(
      buildTeacherOverviewMetrics({
        balance: 100,
        balanceError: true,
        orgTeacherIds: ["t1"],
        orgError: true,
        pendingTeacherInvites: 3,
        teacherInvitesError: true,
        classCount: 4,
        classesError: true,
        activeStudentCount: 50,
        studentsError: true,
        pendingStudentInvites: 6,
        studentInvitesError: true,
        assignmentCount: 7,
        assignmentsError: true,
      })
    ).toEqual({
      credits: null,
      teachersActive: null,
      teachersInvited: null,
      classes: null,
      studentsActive: null,
      studentsInvited: null,
      assignments: null,
    });
  });

  it("sets invite metrics to null when pending counts are omitted", () => {
    expect(buildTeacherOverviewMetrics({})).toEqual({
      credits: null,
      teachersActive: null,
      teachersInvited: null,
      classes: null,
      studentsActive: null,
      studentsInvited: null,
      assignments: null,
    });
  });

  it("sets invite metrics to null when pending counts are explicitly null", () => {
    expect(
      buildTeacherOverviewMetrics({
        pendingTeacherInvites: null,
        pendingStudentInvites: null,
      })
    ).toEqual({
      credits: null,
      teachersActive: null,
      teachersInvited: null,
      classes: null,
      studentsActive: null,
      studentsInvited: null,
      assignments: null,
    });
  });

  it("preserves zero invite counts", () => {
    expect(
      buildTeacherOverviewMetrics({
        pendingTeacherInvites: 0,
        pendingStudentInvites: 0,
      })
    ).toEqual({
      credits: null,
      teachersActive: null,
      teachersInvited: 0,
      classes: null,
      studentsActive: null,
      studentsInvited: 0,
      assignments: null,
    });
  });

  it("uses empty orgTeacherIds array as zero active teachers", () => {
    expect(
      buildTeacherOverviewMetrics({
        orgTeacherIds: [],
      })
    ).toEqual({
      credits: null,
      teachersActive: 0,
      teachersInvited: null,
      classes: null,
      studentsActive: null,
      studentsInvited: null,
      assignments: null,
    });
  });

  it("sets count metrics to null when values are not numbers", () => {
    expect(
      buildTeacherOverviewMetrics({
        balance: null,
        orgTeacherIds: null,
        classCount: null,
        activeStudentCount: null,
        assignmentCount: null,
        pendingTeacherInvites: 1,
        pendingStudentInvites: 1,
      })
    ).toEqual({
      credits: null,
      teachersActive: null,
      teachersInvited: 1,
      classes: null,
      studentsActive: null,
      studentsInvited: 1,
      assignments: null,
    });
  });
});
