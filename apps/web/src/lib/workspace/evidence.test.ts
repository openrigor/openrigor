import { describe, expect, it } from "vitest";
import type { ApparatusEvidenceTemplate } from "@/lib/apparatuses/catalog";
import { FormValidationError } from "./form-validation";
import {
  NOT_RECORDED,
  assembleEvidenceMarkdown,
  buildEvidenceSnapshotFromMarker,
  evidenceFilePath,
  evidenceTimestampSlug,
  isAutoMergeEligibleStage,
  normalizeEvidenceTemplate,
  resolveEvidenceFieldValues,
  resolveFrozenRunValues,
  shouldAutoMergeEvidence,
  validateEvidenceSubmission,
  type EvidenceSnapshot,
} from "./evidence";
import type { MethodWorkspaceItem } from "./types";

const template = (overrides: Partial<ApparatusEvidenceTemplate> = {}) =>
  ({
    id: "evidence-template",
    version: "1.2.3",
    defaultStage: "documented-experience",
    sourcePath: "methods/test/evidence-template.en.md",
    guidance: "Keep the account factual.",
    layoutMarkdown: "# {{method_id}}\n\n{{narrative}}",
    fields: {
      method_id: {
        label: "Method ID",
        type: "text",
        required: true,
        read_only: true,
        source: "frozen_run.method.id",
      },
      participant_count: {
        label: "Participants",
        type: "number",
        required: true,
        read_only: true,
        source: "frozen_run.participant_count",
      },
      started: {
        label: "Started",
        type: "date",
        required: true,
        read_only: true,
        source: "frozen_run.started_at",
      },
      dialogic_contribution_summary: {
        label: "Dialogic summary",
        type: "textarea",
        required: true,
        read_only: true,
        source: "frozen_run.analytics.dialogic_contribution_summary",
      },
      mode: {
        label: "Mode",
        type: "select",
        required: true,
        options: ["one", "two"],
      },
      narrative: {
        label: "Narrative",
        type: "textarea",
        required: true,
      },
      contribution_stage: {
        label: "Stage",
        type: "select",
        required: true,
        options: ["documented-experience", "structured-experiment"],
      },
      publication_authorisation: {
        label: "Authorisation",
        type: "select",
        required: true,
        options: [
          "confirmed-authorised-to-publish",
          "not-confirmed-do-not-submit",
        ],
      },
      anonymisation_status: {
        label: "Anonymisation",
        type: "select",
        required: true,
        options: [
          "confirmed-no-student-identifiers-or-raw-student-material",
          "needs-human-privacy-review",
        ],
      },
      data_sharing_limits: {
        label: "Data limits",
        type: "textarea",
        required: true,
      },
    },
    ...overrides,
  }) as ApparatusEvidenceTemplate;

function methodItem(
  overrides: Partial<MethodWorkspaceItem> = {}
): MethodWorkspaceItem {
  return {
    id: "wi_evidence",
    ownerId: "user-1",
    status: "active",
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
    source: {
      catalogRevision: "catalog-1",
      templateId: "evaluchat-assignment-brief",
      templateVersion: "1.0.0",
      sourcePath: "templates/assignment-brief.en.md",
    },
    kind: "method",
    templateSnapshot: {
      kind: "form",
      templateId: "evaluchat-assignment-brief",
      templateVersion: "1.0.0",
      catalogRevision: "canvas-0.5.9",
      contentHash: "hash",
      title: "Assignment",
      description: "Assignment",
      assistantGuidance: "Guidance",
      layoutMarkdown: "# Assignment",
      fields: {},
    },
    methodSource: { id: "ai-assisted-essay", version: "0.1.0" },
    profileId: "canonical-constrained-dialogue",
    profiles: [],
    submission: {
      status: "submitted",
      values: {},
      resolvedMarkdown: "",
      submittedAt: "2026-08-18T11:00:00.000Z",
    },
    run: {
      id: "run-1",
      status: "in_progress",
      launchedAt: "2026-08-18T10:30:00.000Z",
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
        title: "Essay",
        course: "Course",
        dueDate: "2026-09-01",
        wordTarget: 500,
        prompt: "Write.",
        agentInstructions: "",
        group: "Group",
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
        {
          email: "c@example.com",
          invitationStatus: "accepted",
          submissionStatus: "in_progress",
        },
      ],
    },
    ...overrides,
  };
}

describe("Evidence runtime", () => {
  it("uses stamped frozen values when rebuilding a thread snapshot", () => {
    const item = methodItem();
    const snapshot = buildEvidenceSnapshotFromMarker(item, {
      method_id: "ai-assisted-essay",
      method_version: "0.1.0",
      template_version: "1.2.3",
      frozen_values: { method_id: "stamped-method", participant_count: 99 },
    });
    expect(snapshot.frozenValues).toEqual({
      method_id: "stamped-method",
      participant_count: 99,
    });
    expect(snapshot.frozenValues).not.toEqual(
      expect.objectContaining({ participant_count: 3 })
    );
    // The method version is the one stamped at creation, not the current
    // item's methodSource.version.
    expect(snapshot.methodVersion).toBe("0.1.0");
  });

  it("normalizes snake_case fields, carries controls, and rejects invalid types", () => {
    const normalized = normalizeEvidenceTemplate(template());
    expect(normalized.fields.method_id).toMatchObject({
      id: "method_id",
      readOnly: true,
      source: "frozen_run.method.id",
    });
    expect(normalized.fields.mode).toMatchObject({
      type: "select",
      options: ["one", "two"],
    });
    const ledgerTemplate = template();
    const normalizedLedger = normalizeEvidenceTemplate({
      ...ledgerTemplate,
      fields: {
        ...ledgerTemplate.fields,
        mode: {
          ...ledgerTemplate.fields.mode,
          options: ["one", "two", "unknown"],
          missing_semantics: "unknown",
          ledger_dimension: { role: "context", control: "multi-select" },
        },
      },
    });
    expect(normalizedLedger.fields.mode).toMatchObject({
      ledgerDimension: { role: "context", control: "multi-select" },
      missingSemantics: "unknown",
    });
    expect(normalized.fields.started).toMatchObject({ type: "date" });
    expect(() =>
      normalizeEvidenceTemplate(
        template({ fields: { broken: { type: "checkbox" } } })
      )
    ).toThrow(/invalid evidence field type/i);
  });

  it("resolves run counts and timestamps while leaving analytics honest", () => {
    const item = methodItem();
    const frozen = resolveFrozenRunValues(item);
    expect(frozen.collection).toMatchObject({
      eligible_owner_count: 3,
      invited_owner_count: 3,
      responded_owner_count: 1,
      opened_at: "2026-08-18T10:30:00.000Z",
      submitted_at: "2026-08-18T11:00:00.000Z",
    });
    expect(frozen.frozen_run).toMatchObject({
      participant_count: 3,
      started_at: "2026-08-18T10:30:00.000Z",
      concluded_at: "2026-08-18T11:00:00.000Z",
    });
    const fields = normalizeEvidenceTemplate(template()).fields;
    const values = resolveEvidenceFieldValues(fields, frozen);
    expect(values).toMatchObject({
      method_id: "ai-assisted-essay",
      participant_count: 3,
      started: "2026-08-18T10:30:00.000Z",
      dialogic_contribution_summary: NOT_RECORDED,
    });
    expect(Object.values(frozen.frozen_run.analytics)).toEqual(
      expect.arrayContaining([NOT_RECORDED])
    );
    expect(Object.values(frozen.frozen_run.analytics)).not.toContain("0");
  });

  it("replaces read-only submissions server-side and enforces consent", () => {
    const fields = normalizeEvidenceTemplate(template()).fields;
    const snapshot: EvidenceSnapshot = {
      kind: "evidence",
      templateId: "evidence-template",
      templateVersion: "1.2.3",
      defaultStage: "documented-experience",
      sourcePath: "methods/test/evidence-template.en.md",
      guidance: "Guidance",
      layoutMarkdown: "{{method_id}} {{narrative}}",
      fields,
      frozenValues: {
        method_id: "server-method",
        participant_count: 3,
        started: "2026-08-18T10:30:00.000Z",
        dialogic_contribution_summary: NOT_RECORDED,
      },
      methodId: "server-method",
      methodVersion: "1.0.0",
      workspaceItemId: "wi_evidence",
      runId: "run-1",
    };
    const valid = {
      method_id: "client-forged-method",
      mode: "one",
      narrative: "A factual account.",
      contribution_stage: "documented-experience",
      publication_authorisation: "confirmed-authorised-to-publish",
      anonymisation_status:
        "confirmed-no-student-identifiers-or-raw-student-material",
      data_sharing_limits: "Aggregate counts only.",
    };
    expect(validateEvidenceSubmission(snapshot, valid).values).toMatchObject({
      method_id: "server-method",
      mode: "one",
      narrative: "A factual account.",
    });
    expect(() =>
      validateEvidenceSubmission(snapshot, {
        ...valid,
        publication_authorisation: "not-confirmed-do-not-submit",
      })
    ).toThrow(FormValidationError);
    expect(() =>
      validateEvidenceSubmission(snapshot, {
        ...valid,
        narrative: "",
      })
    ).toThrow(/invalid/i);
  });

  it("assembles lint-shaped frontmatter and escaped resolved Markdown", () => {
    const timestamp = "2026-08-18T12:34:56.789Z";
    const timestampSlug = evidenceTimestampSlug(timestamp);
    const snapshot: EvidenceSnapshot = {
      kind: "evidence",
      templateId: "evidence-template",
      templateVersion: "1.2.3",
      defaultStage: "documented-experience",
      sourcePath: "methods/ai-assisted-essay/evidence-template.en.md",
      guidance: "Guidance",
      layoutMarkdown: "# {{method_id}}\n\n{{narrative}}",
      fields: {},
      frozenValues: {
        resolved_levers: '{"threshold":4}',
        canvas_version: "canvas-0.5.9",
      },
      methodId: "ai-assisted-essay",
      methodVersion: "0.1.0",
      workspaceItemId: "wi_evidence",
      runId: "run-1",
    };
    const markdown = assembleEvidenceMarkdown({
      snapshot,
      values: {
        method_id: "ai-assisted-essay",
        narrative: "A *claim* <without> [raw] values.",
        publication_authorisation: "confirmed-authorised-to-publish",
        anonymisation_status:
          "confirmed-no-student-identifiers-or-raw-student-material",
        data_sharing_limits: "Aggregate only.",
      },
      stage: "documented-experience",
      generatedAt: timestamp,
    });
    expect(markdown).toContain("type: Evidence Contribution");
    expect(markdown).toContain(`id: \"${timestampSlug}\"`);
    expect(markdown).toContain("lang: en");
    expect(markdown).toContain("description:");
    expect(markdown).toContain("status: draft");
    expect(markdown).toContain("stage:");
    expect(markdown).toContain("generated:");
    expect(markdown).toContain("publication_authorisation:");
    expect(markdown).toContain("anonymisation_status:");
    expect(markdown).toContain("method:");
    expect(markdown).toContain("provenance:");
    expect(markdown).toContain('method:\n  id: "ai-assisted-essay"');
    expect(markdown).toContain('  levers: {"threshold":4}');
    expect(markdown).toContain("A \\*claim\\* &lt;without&gt; \\[raw\\]");
    expect(markdown).not.toContain("{{narrative}}");
    expect(evidenceFilePath("ai-assisted-essay", timestampSlug)).toBe(
      `methods/ai-assisted-essay/evidence/${timestampSlug}.en.md`
    );
  });

  it("only auto-merges documented experience with every integrity gate", () => {
    expect(isAutoMergeEligibleStage("documented-experience")).toBe(true);
    for (const stage of ["structured-experiment", "replication", "challenge"]) {
      expect(isAutoMergeEligibleStage(stage)).toBe(false);
    }
    const complete = {
      stage: "documented-experience",
      provenancePresent: true,
      consentPresent: true,
      okfLintPassed: true,
    };
    expect(shouldAutoMergeEvidence(complete)).toBe(true);
    expect(
      shouldAutoMergeEvidence({ ...complete, consentPresent: false })
    ).toBe(false);
    expect(
      shouldAutoMergeEvidence({ ...complete, provenancePresent: false })
    ).toBe(false);
    expect(shouldAutoMergeEvidence({ ...complete, okfLintPassed: false })).toBe(
      false
    );
  });
});
