import { describe, expect, it } from "vitest";
import { isSubmittedThreadLock } from "./GraphContext";

describe("isSubmittedThreadLock", () => {
  it("locks the thread once phase_state is submitted", () => {
    expect(
      isSubmittedThreadLock({
        phaseState: "submitted",
        submitted: false,
      })
    ).toBe(true);
  });

  it("locks the thread when the workspace item submission is submitted", () => {
    expect(
      isSubmittedThreadLock({ phaseState: "drafting", submitted: true })
    ).toBe(true);
  });

  it("unlocks while drafting / not submitted", () => {
    expect(
      isSubmittedThreadLock({ phaseState: "drafting", submitted: false })
    ).toBe(false);
    expect(isSubmittedThreadLock({ phaseState: undefined })).toBe(false);
  });
});
