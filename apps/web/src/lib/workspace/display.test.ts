import { describe, expect, it } from "vitest";
import {
  formatWorkspaceItemDate,
  methodParticipantOpenHref,
  ownParticipantItemId,
  workspaceItemHref,
  workspaceItemKicker,
  workspaceItemTitle,
} from "./display";
import type {
  MethodParticipantWorkspaceItem,
  MethodWorkspaceItem,
} from "./types";

describe("workspace inbox dates", () => {
  const now = new Date("2026-08-12T12:00:00");

  it("shows weekday and time for items received this week", () => {
    expect(formatWorkspaceItemDate("2026-08-10T15:30:00", now)).toMatch(
      /^Mon 15:30$/
    );
  });

  it("shows weekday and day/month for older items this month", () => {
    expect(formatWorkspaceItemDate("2026-08-06T09:00:00", now)).toMatch(
      /^Thu 6\/8$/
    );
  });

  it("shows a padded year/month/day for earlier months", () => {
    expect(formatWorkspaceItemDate("2026-06-23T09:00:00", now)).toBe(
      "2026/06/23"
    );
  });
});

describe("workspace item kickers", () => {
  const base = {
    id: "wi_1",
    ownerId: "user-1",
    status: "active" as const,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    source: {
      catalogRevision: "sha256:catalog",
      templateId: "evaluchat-assignment-brief",
      templateVersion: "1.0.0",
      sourcePath: "templates/platform/evaluchat-assignment-brief.en.md",
    },
    templateSnapshot: {
      kind: "form" as const,
      templateId: "evaluchat-assignment-brief",
      templateVersion: "1.0.0",
      catalogRevision: "sha256:catalog",
      contentHash: "sha256:content",
      title: "Assignment brief",
      description: "Capture a brief",
      assistantGuidance: "guidance",
      layoutMarkdown: "# {{title}}",
      fields: {},
    },
    methodSource: {
      id: "ai-assisted-essay",
      version: "0.1.0",
      title: "AI-assisted essay — constrained dialogic drafting (CAMDLE)",
      description: "Constrained dialogic drafting.",
      url: "https://research.evaluchat.org/methods/ai-assisted-essay.html",
    },
    profileId: "canonical-constrained-dialogue",
    profiles: [{ id: "canonical-constrained-dialogue", label: "Canonical" }],
  };

  it("labels a method draft and a launched run", () => {
    const draft: MethodWorkspaceItem = { ...base, kind: "method" };
    expect(workspaceItemKicker(draft)).toBe("METHOD DRAFT");

    const run: MethodWorkspaceItem = {
      ...draft,
      run: {
        id: "run_1",
        status: "in_progress",
        launchedAt: "2026-08-13T00:00:00.000Z",
        methodId: "ai-assisted-essay",
        methodVersion: "0.1.0",
        profileId: "canonical-constrained-dialogue",
        apparatusConfiguration: {
          ai_assistance: true,
          ai_canvas_actions: true,
          drafting_gate: "discussion-first",
          threshold: 4,
          tracking: true,
        },
        assignment: {
          title: "Great Expectations",
          course: "Grade 10",
          dueDate: "2026-09-01",
          wordTarget: 750,
          prompt: "Write",
          agentInstructions: "",
          group: "A",
        },
        participants: [
          {
            email: "a@example.com",
            invitationStatus: "accepted",
            submissionStatus: "submitted",
          },
          {
            email: "b@example.com",
            invitationStatus: "sent",
            submissionStatus: "not_started",
          },
        ],
      },
    };
    expect(workspaceItemKicker(run)).toBe(
      "ASSIGNMENT RUN · 2 invited · 1 submitted"
    );
    expect(workspaceItemTitle(draft)).toBe(
      "AI-assisted essay — constrained dialogic drafting (CAMDLE)"
    );
    expect(workspaceItemTitle(run)).toBe("Great Expectations");
    expect(ownParticipantItemId(run, "operator-1")).toBeUndefined();
    expect(
      ownParticipantItemId(
        {
          ...run,
          run: {
            ...run.run!,
            participants: [
              {
                email: "cronjev@outlook.com",
                userId: "operator-1",
                itemId: "wi_self",
                invitationStatus: "accepted",
                submissionStatus: "not_started",
              },
            ],
          },
        },
        "operator-1"
      )
    ).toBe("wi_self");
  });

  it("resumes a submitted participant item with threadId and readonly", () => {
    const participant = {
      id: "wi_96bbad93-92ed-4d74-a7f4-1732575f6438",
      ownerId: "user-2",
      status: "active" as const,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      source: base.source,
      kind: "method_participant" as const,
      threadId: "019ffd21-286f-74a9-ade8-7ce5d4665997",
      runId: "run_1",
      operatorItemId: "wi_op",
      operatorId: "user-1",
      methodSource: base.methodSource,
      profileId: base.profileId,
      apparatusConfiguration: {
        ai_assistance: true,
        ai_canvas_actions: true,
        drafting_gate: "discussion-first" as const,
        threshold: 4,
        tracking: true,
      },
      assignment: {
        title: "Great Expectations",
        course: "Grade 10",
        dueDate: "2026-09-01",
        wordTarget: 750,
        prompt: "Write about Pip.",
        agentInstructions: "",
        group: "A",
      },
      submission: {
        status: "submitted" as const,
        submittedAt: "2026-08-13T12:00:00.000Z",
      },
    } satisfies MethodParticipantWorkspaceItem;
    expect(workspaceItemHref(participant)).toBe(
      "/workspace/items/wi_96bbad93-92ed-4d74-a7f4-1732575f6438?threadId=019ffd21-286f-74a9-ade8-7ce5d4665997&readonly=1"
    );
    expect(
      methodParticipantOpenHref(
        "wi_op",
        {
          userId: "user-2",
          itemId: participant.id,
          threadId: participant.threadId,
          submissionStatus: "submitted",
        },
        "user-1"
      )
    ).toBe(`/workspace/items/wi_op/review/${participant.id}`);
  });

  it("falls back to the form snapshot title when the method name was not stored", () => {
    const draft: MethodWorkspaceItem = {
      ...base,
      kind: "method",
      methodSource: { id: "ai-assisted-essay", version: "0.1.0" },
    };
    expect(workspaceItemTitle(draft)).toBe("Assignment brief");
  });
});
