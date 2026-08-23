import { describe, expect, it } from "vitest";
import { displayPath } from "./display-path";

describe("displayPath", () => {
  it("returns Untitled for null or empty", () => {
    expect(displayPath(null)).toBe("Untitled");
    expect(displayPath("")).toBe("Untitled");
    expect(displayPath("   ")).toBe("Untitled");
  });

  it("returns basename for posix and windows paths", () => {
    expect(displayPath("/home/me/notes.md")).toBe("notes.md");
    expect(displayPath("C:\\Users\\me\\notes.md")).toBe("notes.md");
  });
});
