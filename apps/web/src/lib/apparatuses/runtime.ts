import {
  CANONICAL_ESSAYS_CONFIGURATION,
  type ApparatusConfiguration,
} from "@opencanvas/shared";
import { APPARATUS_CATALOG, type ApparatusCatalogEntry } from "./catalog";

export const BUILTIN_APPARATUS_IDS = new Set(["ai-assisted-essay"]);

export function getApparatusSpecification(
  apparatusId = "ai-assisted-essay"
): ApparatusCatalogEntry | undefined {
  return APPARATUS_CATALOG.find((entry) => entry.id === apparatusId);
}

export function getDefaultApparatusProfile(apparatusId = "ai-assisted-essay") {
  const entry = getApparatusSpecification(apparatusId);
  return (
    entry?.profiles.find(
      (profile) => profile.id === "canonical-constrained-dialogue"
    ) ?? entry?.profiles[0]
  );
}

export function resolveApparatusConfiguration(input: {
  apparatusId?: string;
  profileId?: string;
  configuration?: ApparatusConfiguration;
}): {
  apparatusId: string;
  apparatusVersion: string;
  apparatusProfileId: string;
  apparatusConfiguration: ApparatusConfiguration;
} {
  const apparatusId = input.apparatusId || "ai-assisted-essay";
  const entry = getApparatusSpecification(apparatusId);
  const profile =
    entry?.profiles.find((candidate) => candidate.id === input.profileId) ??
    getDefaultApparatusProfile(apparatusId);

  if (!entry || !profile || !BUILTIN_APPARATUS_IDS.has(apparatusId)) {
    return {
      apparatusId: "ai-assisted-essay",
      apparatusVersion: "0.1.0",
      apparatusProfileId: "canonical-constrained-dialogue",
      apparatusConfiguration: {
        ...CANONICAL_ESSAYS_CONFIGURATION,
        ...(input.configuration ?? {}),
      },
    };
  }

  return {
    apparatusId,
    apparatusVersion: entry.version,
    apparatusProfileId: profile.id,
    // The profile is authoritative. A browser may not override its treatment.
    apparatusConfiguration: { ...profile.configuration },
  };
}

export function isTrackingEnabled(
  configuration?: ApparatusConfiguration
): boolean {
  return configuration?.tracking !== false;
}
