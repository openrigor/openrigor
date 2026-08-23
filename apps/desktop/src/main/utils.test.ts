import { describe, expect, it } from "vitest";
import { isSmokeTest } from "./utils";

describe("isSmokeTest", () => {
  it("detects --smoke-test and ignores unrelated argv", () => {
    expect(isSmokeTest(["--smoke-test"])).toBe(true);
    expect(isSmokeTest([])).toBe(false);
    expect(isSmokeTest(["--foo"])).toBe(false);
  });
});
