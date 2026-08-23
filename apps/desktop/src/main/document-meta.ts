import { basename } from "node:path";

export interface DocumentMeta {
  dirty: boolean;
  path: string | null;
}

export const DEFAULT_DOCUMENT_META: DocumentMeta = {
  dirty: false,
  path: null,
};

const APP_TITLE = "Evaluchat";

export function formatWindowTitle(meta: DocumentMeta): string {
  const name =
    meta.path && meta.path.trim().length > 0 ? basename(meta.path) : "Untitled";
  const dirtyMark = meta.dirty ? "*" : "";
  return `${name}${dirtyMark} — ${APP_TITLE}`;
}

export function validateDocumentMeta(raw: unknown): DocumentMeta | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.dirty !== "boolean") {
    return null;
  }

  if (
    record.path !== null &&
    (typeof record.path !== "string" || record.path.trim().length === 0)
  ) {
    return null;
  }

  return {
    dirty: record.dirty,
    path: record.path === null ? null : (record.path as string),
  };
}
