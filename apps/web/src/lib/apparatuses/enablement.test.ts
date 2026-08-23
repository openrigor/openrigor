import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnvEnabledApparatusIds, isApparatusEnabled } from "./enablement";

describe("enablement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses NEXT_PUBLIC_APPARATUSES comma-separated ids", () => {
    vi.stubEnv("NEXT_PUBLIC_APPARATUSES", "ai-assisted-essay, stress-test");
    expect(getEnvEnabledApparatusIds()).toEqual([
      "ai-assisted-essay",
      "stress-test",
    ]);
    expect(isApparatusEnabled("ai-assisted-essay")).toBe(true);
    expect(isApparatusEnabled("stress-test")).toBe(true);
  });

  it("maps legacy TEACHING_PROTOTYPE=true to essays when APPARATUSES unset", () => {
    delete process.env.NEXT_PUBLIC_APPARATUSES;
    vi.stubEnv("NEXT_PUBLIC_TEACHING_PROTOTYPE", "true");
    expect(process.env.NEXT_PUBLIC_APPARATUSES).toBeUndefined();
    expect(getEnvEnabledApparatusIds()).toEqual(["ai-assisted-essay"]);
    expect(isApparatusEnabled("ai-assisted-essay")).toBe(true);
    expect(isApparatusEnabled("stress-test")).toBe(false);
  });

  it("returns empty when neither env is set", () => {
    delete process.env.NEXT_PUBLIC_APPARATUSES;
    vi.stubEnv("NEXT_PUBLIC_TEACHING_PROTOTYPE", "false");
    expect(getEnvEnabledApparatusIds()).toEqual([]);
    expect(isApparatusEnabled("ai-assisted-essay")).toBe(false);
  });

  it("trims whitespace and drops empty entries", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_APPARATUSES",
      " ai-assisted-essay , , stress-test "
    );
    expect(getEnvEnabledApparatusIds()).toEqual([
      "ai-assisted-essay",
      "stress-test",
    ]);
  });
});
