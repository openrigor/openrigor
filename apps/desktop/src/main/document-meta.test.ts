import { describe, expect, it } from "vitest";
import { formatWindowTitle, validateDocumentMeta } from "./document-meta";

describe("formatWindowTitle", () => {
  it("uses Untitled when path is null", () => {
    expect(formatWindowTitle({ dirty: false, path: null })).toBe(
      "Untitled — Evaluchat"
    );
  });

  it("shows basename and dirty marker", () => {
    expect(formatWindowTitle({ dirty: true, path: "/docs/notes.md" })).toBe(
      "notes.md* — Evaluchat"
    );
  });
});

describe("validateDocumentMeta", () => {
  it("accepts valid meta", () => {
    expect(validateDocumentMeta({ dirty: true, path: "/a.md" })).toEqual({
      dirty: true,
      path: "/a.md",
    });
    expect(validateDocumentMeta({ dirty: false, path: null })).toEqual({
      dirty: false,
      path: null,
    });
  });

  it("rejects invalid shapes", () => {
    expect(validateDocumentMeta(null)).toBeNull();
    expect(validateDocumentMeta({ dirty: "yes", path: null })).toBeNull();
    expect(validateDocumentMeta({ dirty: false, path: "" })).toBeNull();
    expect(validateDocumentMeta({ dirty: false })).toBeNull();
  });
});
