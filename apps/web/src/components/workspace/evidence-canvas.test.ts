import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
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
  latestEvidenceFormUpdate,
  unplacedEditableFieldIds,
} from "./evidence-canvas";

describe("evidence canvas controls", () => {
  it("renders multi-line fields at full text-column width", () => {
    const field = renderToStaticMarkup(
      React.createElement(EvidenceFieldControl, {
        field: {
          id: "observations",
          label: "Observations",
          type: "textarea",
          required: true,
          displayLines: 5,
        },
        value: "",
        onChange: () => undefined,
        register: () => undefined,
      })
    );

    expect(field).toContain('class="my-1 flex w-full flex-col align-middle"');
    expect(field).toContain('class="flex w-full items-start"');
    expect(field).toMatch(/<textarea[^>]+class="[^"]*w-full/);
    expect(field).not.toMatch(/<textarea[^>]+min-w-\[/);
    expect(field).toContain('rows="5"');
  });

  it("keeps single-line fields inline-sized", () => {
    const field = renderToStaticMarkup(
      React.createElement(EvidenceFieldControl, {
        field: {
          id: "method_name",
          label: "Method name",
          type: "text",
          required: false,
        },
        value: "",
        onChange: () => undefined,
        register: () => undefined,
      })
    );

    expect(field).toMatch(
      /<input[^>]+class="[^"]*inline-flex[^"]*min-w-\[12ch\]/
    );
  });

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
        pullRequestUrl: "https://github.com/openrigor/research/pull/12",
        pullRequestNumber: 12,
      })
    );
    expect(status).toContain("filed");
    expect(status).toContain("PR #12");
    expect(status).toContain("https://github.com/openrigor/research/pull/12");
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

  it("lists editable fields whose layout placeholder is absent", () => {
    const fields = {
      method_id: {
        id: "method_id",
        label: "Method ID",
        type: "text" as const,
        required: true,
        readOnly: true,
      },
      publication_authorisation: {
        id: "publication_authorisation",
        label: "Publication authorisation",
        type: "select" as const,
        required: true,
      },
      observations: {
        id: "observations",
        label: "Observations",
        type: "textarea" as const,
        required: true,
      },
      optional_note: {
        id: "optional_note",
        label: "Optional note",
        type: "text" as const,
        required: false,
      },
    };
    const layoutMarkdown =
      "Confirm {{publication_authorisation}} and {{anonymisation_status}}.";

    expect(unplacedEditableFieldIds(fields, layoutMarkdown)).toEqual([
      "observations",
      "optional_note",
    ]);
    expect(
      unplacedEditableFieldIds(fields, `${layoutMarkdown}\n{{observations}}`)
    ).toEqual(["optional_note"]);
    expect(unplacedEditableFieldIds(fields, "{{optional_note}}")).toEqual([
      "publication_authorisation",
      "observations",
    ]);
  });
});

describe("latestEvidenceFormUpdate", () => {
  const fields = {
    observations: {
      id: "observations",
      label: "Observations",
      type: "textarea" as const,
      required: true,
    },
    run_id: {
      id: "run_id",
      label: "Run id",
      type: "text" as const,
      required: true,
      readOnly: true,
    },
  };

  it("returns the latest AI message updates with the block stripped", () => {
    const older = new AIMessage({
      content: 'Earlier. <form-updates>{"observations":"stale"}</form-updates>',
    });
    const latest = new AIMessage({
      content:
        'Applied notes.\n<form-updates>{"observations":"fresh notes"}</form-updates>',
    });
    const human = new HumanMessage({ content: "Please fill observations." });

    const result = latestEvidenceFormUpdate([older, human, latest], fields);

    expect(result?.message).toBe(latest);
    expect(result?.updates).toEqual({ observations: "fresh notes" });
    expect(result?.cleanContent).toBe("Applied notes.\n");
  });

  it("skips readOnly fields and keeps editable ones", () => {
    const message = new AIMessage({
      content:
        'Done. <form-updates>{"observations":"keep me","run_id":"do-not-overwrite"}</form-updates>',
    });

    const result = latestEvidenceFormUpdate([message], fields);

    expect(result?.updates).toEqual({ observations: "keep me" });
    expect(result?.cleanContent).toBe("Done. ");
  });

  it("returns undefined when no update block is present", () => {
    const result = latestEvidenceFormUpdate(
      [new AIMessage({ content: "No machine block here." })],
      fields
    );

    expect(result).toBeUndefined();
  });

  it("ignores malformed and partial update blocks", () => {
    expect(
      latestEvidenceFormUpdate(
        [
          new AIMessage({
            content: 'Partial. <form-updates>{"observations":"',
          }),
        ],
        fields
      )
    ).toBeUndefined();
    const malformed = latestEvidenceFormUpdate(
      [
        new AIMessage({
          content: "Broken. <form-updates>{not json}</form-updates>",
        }),
      ],
      fields
    );
    expect(malformed?.updates).toEqual({});
    expect(malformed?.cleanContent).toBe("Broken. ");
  });
});
