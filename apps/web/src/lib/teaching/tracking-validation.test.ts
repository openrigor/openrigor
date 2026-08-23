import { describe, expect, it } from "vitest";
import { isValidTrackingId } from "./tracking-validation";

describe("isValidTrackingId", () => {
  it("accepts safe alphanumeric ids", () => {
    expect(isValidTrackingId("thread-abc_123")).toBe(true);
  });

  it("rejects path traversal and empty values", () => {
    expect(isValidTrackingId("../etc/passwd")).toBe(false);
    expect(isValidTrackingId("")).toBe(false);
    expect(isValidTrackingId(null)).toBe(false);
  });
});
