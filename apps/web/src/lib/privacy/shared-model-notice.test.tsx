import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assertCurrentSharedModelNoticeVersion,
  SHARED_MODEL_NOTICE_EFFECTIVE_DATE,
  SHARED_MODEL_NOTICE_VERSION,
  SharedModelNoticeContent,
  isSharedModelNoticeVersionCurrent,
} from "./shared-model-notice";

describe("shared-model privacy notice", () => {
  it("keeps the recorded immutable version and effective date", () => {
    expect(SHARED_MODEL_NOTICE_VERSION).toBe("2026-08-25");
    expect(SHARED_MODEL_NOTICE_EFFECTIVE_DATE).toBe("2026-08-25");
  });

  it("rejects stale notice versions", () => {
    expect(isSharedModelNoticeVersionCurrent("2026-08-24")).toBe(false);
    expect(isSharedModelNoticeVersionCurrent(SHARED_MODEL_NOTICE_VERSION)).toBe(
      true
    );
    expect(() => assertCurrentSharedModelNoticeVersion("2026-08-24")).toThrow(
      /stale/i
    );
  });

  it("renders all five shared-model privacy facts", () => {
    const html = renderToStaticMarkup(createElement(SharedModelNoticeContent));

    expect(html).toContain(SHARED_MODEL_NOTICE_VERSION);
    expect(html).toContain(SHARED_MODEL_NOTICE_EFFECTIVE_DATE);
    expect(html).toMatch(/best.?effort availability/i);
    expect(html).toMatch(/pause|stop/i);
    expect(html).toMatch(/logged and retained/i);
    expect(html).toMatch(/train or improve/i);
    expect(html).toMatch(/hosted or processed in China/i);
  });
});
