import type { LedgerConfig, LedgerScopeFilter } from "@opencanvas/shared";
import type { EvidenceLedgerDimension } from "@/lib/apparatuses/evidence-ledger";

const LEDGER_UPDATE_PATTERN =
  /(?:<ledger-updates>|&lt;ledger-updates&gt;)\s*([\s\S]*?)\s*(?:<\/ledger-updates>|&lt;\/ledger-updates&gt;)/gi;

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|#39|#x27);/gi,
    (_entity, name: string) => {
      switch (name.toLowerCase()) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "#39":
        case "#x27":
          return "'";
        default:
          return _entity;
      }
    }
  );
}

function messageText(message: { content: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) =>
      typeof part === "object" && part && "text" in part
        ? String((part as { text: unknown }).text)
        : ""
    )
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFilter(
  fieldId: string,
  value: unknown,
  dimension: EvidenceLedgerDimension
): LedgerScopeFilter | undefined {
  if (!isRecord(value) || value.control !== dimension.control) return undefined;

  if (dimension.control === "multi-select") {
    if (
      !Array.isArray(value.values) ||
      value.values.length === 0 ||
      value.values.some(
        (entry) =>
          typeof entry !== "string" ||
          (dimension.options !== undefined &&
            !dimension.options.includes(entry))
      )
    ) {
      return undefined;
    }
    return {
      fieldId,
      control: "multi-select",
      values: [...new Set(value.values)],
    };
  }

  const min = value.min;
  const max = value.max;
  const isValidEndpoint = (endpoint: unknown) => {
    if (endpoint === undefined) return true;
    if (dimension.type === "number") {
      return typeof endpoint === "number" && Number.isFinite(endpoint);
    }
    return typeof endpoint === "string" && endpoint.trim().length > 0;
  };
  if (
    !isValidEndpoint(min) ||
    !isValidEndpoint(max) ||
    (min === undefined && max === undefined)
  ) {
    return undefined;
  }
  const minValue =
    typeof min === "number" || typeof min === "string" ? min : undefined;
  const maxValue =
    typeof max === "number" || typeof max === "string" ? max : undefined;
  return {
    fieldId,
    control: "range",
    ...(minValue !== undefined ? { min: minValue } : {}),
    ...(maxValue !== undefined ? { max: maxValue } : {}),
  };
}

export function parseLedgerUpdates(
  content: string,
  dimensions: EvidenceLedgerDimension[]
): { updates: LedgerConfig["filters"]; cleanContent: string } | undefined {
  const matches = [...content.matchAll(LEDGER_UPDATE_PATTERN)];
  if (!matches.length) return undefined;

  const dimensionById = new Map(
    dimensions.map((dimension) => [dimension.id, dimension])
  );
  const parsedBlocks: LedgerConfig["filters"][] = [];
  for (const match of matches) {
    try {
      const candidate = JSON.parse(decodeHtmlEntities(match[1])) as unknown;
      if (!isRecord(candidate)) return undefined;
      const updates: LedgerConfig["filters"] = [];
      for (const [fieldId, value] of Object.entries(candidate)) {
        const dimension = dimensionById.get(fieldId);
        if (!dimension) continue;
        const filter = normalizeFilter(fieldId, value, dimension);
        if (filter) updates.push(filter);
      }
      parsedBlocks.push(updates);
    } catch {
      // Partial streaming and malformed machine blocks are ignored.
      return undefined;
    }
  }

  return {
    updates: parsedBlocks.at(-1) ?? [],
    cleanContent: content.replace(LEDGER_UPDATE_PATTERN, ""),
  };
}

export function findLatestLedgerUpdate<
  T extends { getType?: () => string; content: unknown },
>(
  messages: T[],
  dimensions: EvidenceLedgerDimension[]
):
  | { message: T; parsed: NonNullable<ReturnType<typeof parseLedgerUpdates>> }
  | undefined {
  for (const message of [...messages].reverse()) {
    if (message.getType?.() !== "ai") continue;
    const parsed = parseLedgerUpdates(messageText(message), dimensions);
    if (parsed) return { message, parsed };
  }
  return undefined;
}
