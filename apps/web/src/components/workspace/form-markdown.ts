import type { FormFieldDefinition, FormValue } from "@/lib/workspace/types";

const FORM_PLACEHOLDER_PATTERN = /\{\{([a-z][a-z0-9_-]*)\}\}/g;
const FORM_UPDATE_PATTERN =
  /(?:<form-updates>|&lt;form-updates&gt;)\s*([\s\S]*?)\s*(?:<\/form-updates>|&lt;\/form-updates&gt;)/gi;

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

export function markFormPlaceholders(markdown: string): string {
  return markdown.replace(
    FORM_PLACEHOLDER_PATTERN,
    (_token, fieldId: string) => `[{{${fieldId}}}](#form-field-${fieldId})`
  );
}

export function messageText(message: { content: unknown }): string {
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

export function parseFormUpdates(
  content: string,
  fields: Record<string, FormFieldDefinition>
): { updates: Record<string, FormValue>; cleanContent: string } | undefined {
  let parsedUpdates: Record<string, FormValue> | undefined;
  let foundUpdateBlock = false;
  const cleanContent = content.replace(
    FORM_UPDATE_PATTERN,
    (_block, json: string) => {
      foundUpdateBlock = true;
      try {
        const candidate = JSON.parse(decodeHtmlEntities(json)) as Record<
          string,
          unknown
        >;
        if (!candidate || typeof candidate !== "object") return "";
        const updates: Record<string, FormValue> = {};
        for (const [fieldId, value] of Object.entries(candidate)) {
          const field = fields[fieldId];
          if (!field) continue;
          if (field.type === "roster") {
            if (
              typeof value === "string" ||
              (Array.isArray(value) &&
                value.every((entry) => typeof entry === "string"))
            ) {
              updates[fieldId] = Array.isArray(value) ? value : value;
            }
            continue;
          }
          if (field.type === "number") {
            if (typeof value === "number" && Number.isFinite(value)) {
              updates[fieldId] = value;
            } else if (typeof value === "string" && value.trim()) {
              const number = Number(value);
              if (Number.isFinite(number)) updates[fieldId] = number;
            }
            continue;
          }
          if (typeof value === "string") updates[fieldId] = value;
        }
        if (Object.keys(updates).length) parsedUpdates = updates;
      } catch {
        // Ignore malformed or partial streaming update blocks.
      }
      return "";
    }
  );

  return foundUpdateBlock
    ? { updates: parsedUpdates ?? {}, cleanContent }
    : undefined;
}

export function findLatestFormUpdate<
  T extends { getType?: () => string; content: unknown },
>(
  messages: T[],
  fields: Record<string, FormFieldDefinition>
):
  | { message: T; parsed: NonNullable<ReturnType<typeof parseFormUpdates>> }
  | undefined {
  for (const message of [...messages].reverse()) {
    if (message.getType?.() !== "ai") continue;
    const parsed = parseFormUpdates(messageText(message), fields);
    if (parsed) return { message, parsed };
  }
  return undefined;
}
