import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-markdown", () => ({ default: () => null }));
vi.mock("remark-gfm", () => ({ default: () => undefined }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", null, children),
}));
vi.mock("@/components/canvas/content-composer", () => ({
  ContentComposerChatInterface: () => null,
}));
vi.mock("@/components/NoSSRWrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizableHandle: () => null,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => children,
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/contexts/GraphContext", () => ({
  useGraphContext: () => ({ graphData: {} }),
}));
vi.mock("@/contexts/ThreadProvider", () => ({
  useThreadContext: () => ({ setThreadId: () => undefined }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => undefined }),
}));
vi.mock("./workspace-item-banner", () => ({ WorkspaceItemBanner: () => null }));
vi.mock("./workspace-item-delete-dialog", () => ({
  WorkspaceItemDeleteDialog: () => null,
}));
vi.mock("@/lib/workspace/display", () => ({
  workspaceItemTitle: () => "Evidence",
}));

import {
  EvidenceFieldControl,
  EvidenceStatusDisplay,
  evidenceEditableValues,
  evidenceSubmitRequest,
} from "./evidence-canvas";

describe("evidence canvas controls", () => {
  it("renders frozen fields disabled and displays a filed PR", () => {
    const field = renderToStaticMarkup(
      React.createElement(EvidenceFieldControl, {
        field: {
          id: "method_id",
          label: "Method ID",
          type: "text",
          required: true,
          readOnly: true,
        },
        value: "ai-assisted-essay",
        onChange: () => undefined,
        register: () => undefined,
      })
    );
    expect(field).toContain('disabled=""');
    expect(field).toContain('value="ai-assisted-essay"');
    expect(field).toContain("Frozen run value");

    const status = renderToStaticMarkup(
      React.createElement(EvidenceStatusDisplay, {
        status: "filed",
        pullRequestUrl: "https://github.com/evaluchat/research/pull/12",
        pullRequestNumber: 12,
      })
    );
    expect(status).toContain("filed");
    expect(status).toContain("PR #12");
    expect(status).toContain("https://github.com/evaluchat/research/pull/12");
  });

  it("builds the submit POST with current field values", () => {
    const request = evidenceSubmitRequest("wi/1", "thread/1", {
      narrative: "Owner account",
      publication_authorisation: "confirmed-authorised-to-publish",
    });
    expect(request.url).toBe(
      "/api/workspace/items/wi%2F1/evidence/thread%2F1/submit"
    );
    expect(request.init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(JSON.parse(request.init.body as string)).toEqual({
      values: {
        narrative: "Owner account",
        publication_authorisation: "confirmed-authorised-to-publish",
      },
    });
  });

  it("omits frozen fields from persisted editable values", () => {
    expect(
      evidenceEditableValues(
        {
          method_id: {
            id: "method_id",
            label: "Method ID",
            type: "text",
            required: true,
            readOnly: true,
          },
          narrative: {
            id: "narrative",
            label: "Narrative",
            type: "textarea",
            required: true,
          },
        },
        { method_id: "server-value", narrative: "owner value" }
      )
    ).toEqual({ narrative: "owner value" });
  });
});
