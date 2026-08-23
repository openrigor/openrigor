/**
 * Client-safe apparatus enablement helpers (env-only — no fs).
 * Importable from middleware/edge and client components.
 */

export const KNOWN_APPARATUS_IDS = ["ai-assisted-essay"] as const;

/** Org default when an org record has no explicit apparatuses field. */
export function getDefaultEnabledApparatusIds(): string[] {
  return ["ai-assisted-essay"];
}

/**
 * Parse NEXT_PUBLIC_APPARATUSES (comma-separated).
 * Legacy: unset APPARATUSES + NEXT_PUBLIC_TEACHING_PROTOTYPE=true → ["ai-assisted-essay"].
 */
export function getEnvEnabledApparatusIds(): string[] {
  const raw = process.env.NEXT_PUBLIC_APPARATUSES;
  if (raw !== undefined && raw !== null) {
    const trimmed = String(raw).trim();
    if (trimmed === "") {
      return [];
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  if (process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE === "true") {
    return ["ai-assisted-essay"];
  }

  // Evaluchat.org is the education-research beta. Keep the Essays apparatus
  // on by default; an explicit empty APPARATUSES value remains the escape hatch
  // for a generic canvas deployment.
  if (process.env.NEXT_PUBLIC_TEACHING_PROTOTYPE === undefined) {
    return ["ai-assisted-essay"];
  }

  return [];
}

export function isApparatusEnabled(id: string): boolean {
  return getEnvEnabledApparatusIds().includes(id);
}
