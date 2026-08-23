import { describe, expect, it } from "vitest";
import { BRAND_PANEL_COLOR } from "@/components/auth/login/login-branding";
import {
  workspaceNavGhostClass,
  workspaceNavOutlineClass,
} from "./workspace-site-header";

describe("workspace-site-header", () => {
  it("uses docs brand panel blue for chrome", () => {
    expect(BRAND_PANEL_COLOR).toBe("#2c3e56");
  });

  it("styles ghost nav controls for white-on-brand headers", () => {
    expect(workspaceNavGhostClass).toContain("gap-1.5");
    expect(workspaceNavGhostClass).toContain("text-[#F08080]");
  });

  it("styles outline nav controls for white-on-brand headers", () => {
    expect(workspaceNavOutlineClass).toContain("border-white/35");
    expect(workspaceNavOutlineClass).toContain("text-white");
  });
});
