export interface SurfaceRef {
  kind: "route" | "api" | "agent-node";
  ref: string;
  note?: string;
}

/**
 * Declarative capability → existing surface map (2A-4).
 * Proves capabilities map to EXISTING surfaces; not wired as a runtime loader.
 */
export const APPARATUS_SURFACES: Record<
  string,
  Record<string, SurfaceRef[]>
> = {
  "ai-assisted-essay": {
    "student-workspace": [
      { kind: "route", ref: "/student" },
      {
        kind: "route",
        ref: "/student/assignment/<id>",
        note: "assignment workspace (split-screen)",
      },
    ],
    "teacher-assignment-management": [
      { kind: "route", ref: "/teacher" },
      { kind: "api", ref: "/api/teaching/assignments" },
      { kind: "api", ref: "/api/teaching/seeds" },
      { kind: "api", ref: "/api/teacher/classes" },
      { kind: "api", ref: "/api/teacher/students" },
      { kind: "api", ref: "/api/teacher/invitations" },
    ],
    "ai-dialogue": [
      { kind: "agent-node", ref: "replyToGeneralInput" },
      { kind: "agent-node", ref: "generatePath" },
      {
        kind: "agent-node",
        ref: "assessThesis",
        note: "socratic gate",
      },
    ],
    submission: [
      { kind: "api", ref: "/api/teaching/registry" },
      {
        kind: "route",
        ref: "/student/assignment/<id>",
        note: "submit-assignment-dialog",
      },
    ],
    "process-tracking": [
      { kind: "api", ref: "/api/tracking/events" },
      { kind: "api", ref: "/api/tracking/metrics" },
      { kind: "api", ref: "/api/tracking/sessions" },
    ],
    "closeout-survey": [{ kind: "api", ref: "/api/teaching/closeout-survey" }],
  },
};

export function surfacesForCapability(
  apparatusId: string,
  capability: string
): SurfaceRef[] {
  return APPARATUS_SURFACES[apparatusId]?.[capability] ?? [];
}
