import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  slots: [] as Array<{ value: unknown }>,
  actions: {} as Record<string, () => void>,
  dialogOpenChange: undefined as undefined | ((open: boolean) => void),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (!state.enabled) return actual.useState(initial);
      const index = state.index++;
      if (!state.slots[index]) state.slots[index] = { value: initial };
      return [
        state.slots[index].value,
        (update: unknown) => {
          const slot = state.slots[index];
          slot.value =
            typeof update === "function"
              ? (update as (value: unknown) => unknown)(slot.value)
              : update;
        },
      ];
    },
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => {
    state.dialogOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children, ...props }: React.ComponentProps<"div">) =>
    React.createElement("div", props, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("p", undefined, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", undefined, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", undefined, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", undefined, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<"button">) => {
    const testId = props["data-testid"];
    if (testId && onClick) state.actions[testId] = onClick;
    return React.createElement("button", props, children);
  },
}));

import { ledgerPublishRequestBody } from "@/lib/workspace/ledger-publication";
import { LedgerPublishDialog } from "./ledger-publish-dialog";

const item = {
  id: "wi_snapshot",
  ownerId: "user-1",
  status: "active" as const,
  createdAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:00:00.000Z",
  kind: "ledger_snapshot" as const,
  snapshot: {
    ledgerId: "ledger_demo",
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    filters: [],
    manifest: { contributions: [] },
    inputFingerprint: "sha256:input",
    renderHash: "sha256:render",
    buckets: { Included: 0 },
    predicate: "all accepted evidence",
    generatedAt: "2026-08-19T12:00:00.000Z",
    resolverVersion: "1.0.0",
    sourceCommit: "commit",
  },
  config: {
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    filters: [],
  },
  parentLedgerItemId: "wi_ledger",
  source: {
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    sourceCommit: "commit",
  },
};

function renderDialog() {
  state.index = 0;
  return renderToStaticMarkup(
    React.createElement(LedgerPublishDialog, {
      item,
      open: true,
      onOpenChange: vi.fn(),
      onPublished: vi.fn(),
    })
  );
}

describe("LedgerPublishDialog", () => {
  afterEach(() => {
    state.enabled = false;
    state.index = 0;
    state.slots = [];
    state.actions = {};
    state.dialogOpenChange = undefined;
    vi.unstubAllGlobals();
  });

  it("enables Create draft PR only after all three declarations are checked", () => {
    state.enabled = true;
    expect(renderDialog()).toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="ledger-confirm-publish"/
    );

    state.slots = [{ value: true }, { value: true }, { value: true }];
    expect(renderDialog()).toContain('data-testid="ledger-confirm-publish"');
    expect(renderDialog()).not.toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="ledger-confirm-publish"/
    );
  });

  it("posts the declaration body and surfaces write-access errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ reason: "missing_write_access" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    state.enabled = true;
    state.slots = [{ value: true }, { value: true }, { value: true }];
    renderDialog();

    state.actions["ledger-confirm-publish"]!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace/items/wi_snapshot/ledger/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(
          ledgerPublishRequestBody({
            authorised: true,
            anonymised: true,
            publicData: true,
          })
        ),
      })
    );
    await vi.waitFor(() => {
      expect(String(state.slots[3].value)).toContain(
        "No branch or pull request was created"
      );
    });
  });

  it("keeps a pending publish dialog open until its request resolves", async () => {
    let resolveResponse: (response: {
      ok: boolean;
      json: () => Promise<{
        publication: { status: "draft"; pullRequestNumber: number };
      }>;
    }) => void;
    const pendingResponse = new Promise<{
      ok: boolean;
      json: () => Promise<{
        publication: { status: "draft"; pullRequestNumber: number };
      }>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();
    const onPublished = vi.fn();
    const renderPendingDialog = () => {
      state.index = 0;
      return renderToStaticMarkup(
        React.createElement(LedgerPublishDialog, {
          item,
          open: true,
          onOpenChange,
          onPublished,
        })
      );
    };

    state.enabled = true;
    state.slots = [{ value: true }, { value: true }, { value: true }];
    renderPendingDialog();
    state.actions["ledger-confirm-publish"]!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(renderPendingDialog()).toMatch(
      /<button[^>]*disabled=""[^>]*>Cancel<\/button>/
    );
    state.dialogOpenChange!(false);
    state.dialogOpenChange!(true);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolveResponse!({
      ok: true,
      json: async () => ({
        publication: { status: "draft", pullRequestNumber: 85 },
      }),
    });
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
