// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("./workspace-item-banner", () => ({
  WorkspaceItemBanner: () => null,
}));
vi.mock("./workspace-item-delete-dialog", () => ({
  WorkspaceItemDeleteDialog: () => null,
}));
vi.mock("@/lib/workspace/display", () => ({
  workspaceItemTitle: () => "Evidence",
}));

import { EvidenceMarkdown, type EvidencePayload } from "./evidence-canvas";

describe("EvidenceMarkdown", () => {
  it("keeps a textarea mounted when its value changes", () => {
    const fields = {
      data_sharing_limits: {
        id: "data_sharing_limits",
        label: "Data sharing limits",
        type: "textarea" as const,
        required: true,
        displayLines: 5,
      },
      method_id: {
        id: "method_id",
        label: "Method ID",
        type: "text" as const,
        required: true,
        readOnly: true,
      },
    };
    const payload: EvidencePayload = {
      threadId: "thread-1",
      status: "draft",
      pullRequestUrl: undefined,
      template: {
        id: "evidence-template",
        version: "1",
        sourcePath: "templates/evidence.md",
        fields,
        layoutMarkdown: "",
        guidance: "",
      },
      fields,
      layoutMarkdown: "## Evidence\n\n{{data_sharing_limits}}\n\n{{method_id}}",
      guidance: "",
      frozenValues: { method_id: "method-1" },
      method: { id: "method-1", version: "1" },
    };
    const errors = {};
    const onChange = vi.fn();
    const register = vi.fn();
    const values = {
      data_sharing_limits: "",
      method_id: "method-1",
    };

    const { container, rerender } = render(
      <EvidenceMarkdown
        payload={payload}
        values={values}
        errors={errors}
        onChange={onChange}
        register={register}
        locked={false}
      />
    );
    const textareaRef = container.querySelector("textarea");
    expect(textareaRef).not.toBeNull();

    rerender(
      <EvidenceMarkdown
        payload={payload}
        values={{ ...values, data_sharing_limits: "x" }}
        errors={errors}
        onChange={onChange}
        register={register}
        locked={false}
      />
    );

    expect(textareaRef?.isConnected).toBe(true);
    expect(container.querySelector("textarea")).toBe(textareaRef);
  });
});
