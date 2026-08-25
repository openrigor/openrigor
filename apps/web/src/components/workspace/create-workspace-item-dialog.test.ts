// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  buildWorkspaceItemCreateBody,
  catalogResultBadge,
  catalogResultTitle,
  CreateWorkspaceItemDialog,
  workspaceItemCreationKinds,
} from "./create-workspace-item-dialog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateWorkspaceItemDialog request bodies", () => {
  it("creates a plain method item request body", () => {
    expect(
      buildWorkspaceItemCreateBody({ id: "method-1", kind: "method" })
    ).toEqual({ kind: "method", methodId: "method-1" });
  });

  it("includes the bound repository reference for a private Method", () => {
    expect(
      buildWorkspaceItemCreateBody({
        id: "method-1",
        kind: "method",
        private: true,
        repositoryItemId: "wi_repository",
      })
    ).toEqual({
      kind: "method",
      methodId: "method-1",
      repositoryItemId: "wi_repository",
    });
  });

  it("marks private Methods in the Create list", () => {
    expect(catalogResultTitle({ title: "Owner Method", private: true })).toBe(
      "Owner Method (Private)"
    );
    expect(catalogResultTitle({ title: "Catalog Method" })).toBe(
      "Catalog Method"
    );
    expect(catalogResultBadge({ private: true })).toBe("Private");
    expect(catalogResultBadge({})).toBeUndefined();
  });

  it("creates an Evidence Ledger item request body", () => {
    expect(
      buildWorkspaceItemCreateBody({ id: "ledger-demo-method", kind: "ledger" })
    ).toEqual({ kind: "ledger", methodId: "ledger-demo-method" });
  });

  it("never offers private repository bindings as workspace item kinds", () => {
    expect(workspaceItemCreationKinds()).toEqual([
      "template",
      "ledger",
      "method",
    ]);
    expect(workspaceItemCreationKinds()).not.toContain("research_repository");
  });

  it("opens on the Methods tab", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ kind: "method", results: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(CreateWorkspaceItemDialog, { onCreated: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspace/catalog?kind=method&q=",
        { credentials: "include" }
      );
    });
  });
});
