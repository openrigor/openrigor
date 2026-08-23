/**
 * Public apparatus runtime contract.
 *
 * Research repositories describe apparatuses and immutable profiles. The canvas
 * only executes implementations that are already mapped to a known id; this
 * module contains the small, dependency-free contract shared by the web app
 * and the agent graph.
 */

export const APPARATUS_CAPABILITIES = [
  "assignment-context",
  "student-authoring",
  "submission",
  "ai-dialogue",
  "ai-canvas-actions",
  "drafting-gate",
  "process-tracking",
] as const;

export type ApparatusCapability = (typeof APPARATUS_CAPABILITIES)[number];

export type ApparatusRole = "student" | "teacher" | "org-admin";

export type ApparatusKnobType = "boolean" | "integer" | "enum";

export interface ApparatusKnobDefinition {
  id: string;
  type: ApparatusKnobType;
  default: boolean | number | string;
  values?: string[];
  min?: number;
  max?: number;
  requires?: Record<string, boolean | number | string>;
  excludes?: Record<string, boolean | number | string>;
  effect: string;
}

export interface ApparatusProvenance {
  sources: Array<{ id: string; resource: string; title?: string }>;
  generated?: { by: string; at: string };
}

export interface ApparatusConfiguration {
  ai_assistance: boolean;
  ai_canvas_actions: boolean;
  drafting_gate: "none" | "discussion-first" | "thesis-approved";
  threshold: number;
  tracking: boolean;
}

export const CANONICAL_ESSAYS_CONFIGURATION: ApparatusConfiguration = {
  ai_assistance: true,
  ai_canvas_actions: true,
  drafting_gate: "discussion-first",
  threshold: 4,
  tracking: true,
};

export interface ApparatusProfile {
  id: string;
  version: string;
  label: string;
  description: string;
  author: string;
  immutable: true;
  configuration: ApparatusConfiguration;
}

export interface ApparatusSpecification {
  id: string;
  version: string;
  min_canvas_version: string;
  required_capabilities: ApparatusCapability[];
  roles: ApparatusRole[];
  telemetry: string[];
  provenance: ApparatusProvenance;
  knobs: ApparatusKnobDefinition[];
  profiles: ApparatusProfile[];
}

export function isKnownCapability(value: string): value is ApparatusCapability {
  return (APPARATUS_CAPABILITIES as readonly string[]).includes(value);
}

function sameValue(
  actual: unknown,
  expected: boolean | number | string
): boolean {
  return actual === expected;
}

/** Validate a resolved profile before it can be persisted or executed. */
export function validateApparatusConfiguration(
  specification: ApparatusSpecification,
  configuration: ApparatusConfiguration
): string[] {
  const errors: string[] = [];
  const definitionById = new Map(
    specification.knobs.map((knob) => [knob.id, knob])
  );

  for (const knobId of Object.keys(configuration)) {
    if (!definitionById.has(knobId)) {
      errors.push(`unknown knob ${knobId}`);
    }
  }

  for (const knob of specification.knobs) {
    const value = configuration[knob.id as keyof ApparatusConfiguration];
    if (value === undefined) {
      errors.push(`missing knob ${knob.id}`);
      continue;
    }
    for (const otherId of [
      ...Object.keys(knob.requires ?? {}),
      ...Object.keys(knob.excludes ?? {}),
    ]) {
      if (!definitionById.has(otherId)) {
        errors.push(`knob ${knob.id} references unknown knob ${otherId}`);
      }
    }
    if (knob.type === "boolean" && typeof value !== "boolean") {
      errors.push(`knob ${knob.id} must be boolean`);
    }
    if (
      knob.type === "integer" &&
      (!Number.isInteger(value) || typeof value !== "number")
    ) {
      errors.push(`knob ${knob.id} must be an integer`);
    }
    if (
      knob.type === "enum" &&
      (typeof value !== "string" || !knob.values?.includes(value))
    ) {
      errors.push(`knob ${knob.id} has an unsupported value`);
    }
    if (typeof value === "number") {
      if (knob.min !== undefined && value < knob.min)
        errors.push(`knob ${knob.id} is below its minimum`);
      if (knob.max !== undefined && value > knob.max)
        errors.push(`knob ${knob.id} is above its maximum`);
    }
    for (const [otherId, expected] of Object.entries(knob.requires ?? {})) {
      const actual = configuration[otherId as keyof ApparatusConfiguration];
      if (sameValue(value, knob.default) && !sameValue(actual, expected)) {
        errors.push(`knob ${knob.id} requires ${otherId}=${String(expected)}`);
      }
    }
    for (const [otherId, expected] of Object.entries(knob.excludes ?? {})) {
      const actual = configuration[otherId as keyof ApparatusConfiguration];
      if (sameValue(value, knob.default) && sameValue(actual, expected)) {
        errors.push(`knob ${knob.id} excludes ${otherId}=${String(expected)}`);
      }
    }
  }

  // A student must always have a place to read the assignment, author, and
  // submit. Those are capabilities, not optional treatment knobs.
  const required = new Set(specification.required_capabilities);
  for (const capability of [
    "assignment-context",
    "student-authoring",
    "submission",
  ] as const) {
    if (!required.has(capability)) {
      errors.push(`apparatus must provide ${capability}`);
    }
  }
  if (!configuration.ai_assistance && configuration.drafting_gate !== "none") {
    errors.push("drafting gate requires AI assistance");
  }
  if (configuration.drafting_gate === "none" && configuration.threshold !== 0) {
    errors.push("threshold must be zero when the drafting gate is disabled");
  }
  if (configuration.drafting_gate !== "none" && configuration.threshold < 1) {
    errors.push("enabled drafting gate requires a positive threshold");
  }
  if (!definitionById.has("tracking")) {
    errors.push("apparatus must declare the tracking knob");
  }

  return errors;
}

export function assertValidApparatusConfiguration(
  specification: ApparatusSpecification,
  configuration: ApparatusConfiguration
): void {
  const errors = validateApparatusConfiguration(specification, configuration);
  if (errors.length > 0) {
    throw new Error(`Invalid apparatus configuration: ${errors.join("; ")}`);
  }
}
