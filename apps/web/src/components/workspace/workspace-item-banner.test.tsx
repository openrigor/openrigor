import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MethodWorkspaceItem } from "@/lib/workspace/types";

vi.mock("next/image", () => ({
  default: (props: React.ComponentProps<"img">) =>
    React.createElement("img", props),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", props, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) =>
    React.createElement("button", props, children),
  buttonVariants: () => "button",
}));
vi.mock("@/lib/workspace/display", () => ({
  workspaceItemTitle: () => "Owner Method",
}));

import { WorkspaceItemBanner } from "./workspace-item-banner";

function methodItem(privateMethod: boolean): MethodWorkspaceItem {
  return {
    id: "wi_method",
    ownerId: "user-1",
    status: "active",
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
    source: {
      catalogRevision: "catalog-1",
      templateId: "assignment-brief",
      templateVersion: "1",
      sourcePath: "templates/assignment-brief.en.md",
    },
    kind: "method",
    templateSnapshot: {
      kind: "form",
      templateId: "assignment-brief",
      templateVersion: "1",
      sourcePath: "templates/assignment-brief.en.md",
      catalogRevision: "catalog-1",
      title: "Assignment brief",
      description: "Brief",
      guidance: "Complete the form.",
      layoutMarkdown: "# Assignment",
      fields: {},
    },
    methodSource: {
      id: "owner-method",
      version: "a".repeat(40),
      title: "Owner Method",
      ...(privateMethod
        ? {
            privateRepository: {
              repositoryItemId: "wi_repo",
              repositoryId: 101,
              commitSha: "a".repeat(40),
            },
          }
        : {}),
    },
    profileId: "default",
    profiles: [{ id: "default", label: "Default" }],
  };
}

describe("WorkspaceItemBanner private provenance", () => {
  it("shows a Private badge and hides the public catalog link", () => {
    const rendered = renderToStaticMarkup(
      React.createElement(WorkspaceItemBanner, {
        item: methodItem(true),
        onAbandon: () => undefined,
      })
    );

    expect(rendered).toContain('data-testid="private-workspace-badge"');
    expect(rendered).toContain(">Private<");
    expect(rendered).not.toContain('data-testid="method-spec-link"');
  });

  it("keeps the public catalog link for a public Method", () => {
    const rendered = renderToStaticMarkup(
      React.createElement(WorkspaceItemBanner, {
        item: methodItem(false),
        onAbandon: () => undefined,
      })
    );

    expect(rendered).not.toContain('data-testid="private-workspace-badge"');
    expect(rendered).toContain('data-testid="method-spec-link"');
    expect(rendered).toContain(
      "https://research.openrigor.org/methods/owner-method.html"
    );
  });
});
