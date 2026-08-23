import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherWorkspaceNav } from "./teacher-workspace-nav";

vi.mock("@/contexts/UserContext", () => ({
  useUserContext: () => ({ user: undefined }),
}));

describe("TeacherWorkspaceNav", () => {
  it("hides teacher invitations when the viewer lacks permission", () => {
    const markup = renderToStaticMarkup(
      createElement(TeacherWorkspaceNav, {
        section: "overview",
        onSectionChange: () => undefined,
        canInviteTeachers: false,
      })
    );

    expect(markup).toContain('data-testid="teacher-workspace-nav"');
    expect(markup).not.toContain('data-testid="teacher-credit-balance"');
    expect(markup).not.toContain('data-testid="teacher-nav-credits-footer"');
    expect(markup).not.toContain('data-testid="teacher-nav-credits"');
    expect(markup).not.toContain('data-testid="teacher-nav-invite-teachers"');
  });

  it("renders the documentation link safely in a new tab", () => {
    const markup = renderToStaticMarkup(
      createElement(TeacherWorkspaceNav, {
        section: "overview",
        onSectionChange: () => undefined,
        canInviteTeachers: true,
      })
    );

    expect(markup).toContain('data-testid="teacher-nav-invite-teachers"');
    expect(markup).toContain('data-testid="teacher-nav-docs"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});
