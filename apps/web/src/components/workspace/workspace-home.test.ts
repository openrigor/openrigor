// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { WorkspaceItem } from "@/lib/workspace/types";

vi.mock("@/contexts/UserContext", () => ({
  UserProvider: ({ children }: { children: ReactNode }) => children,
  useUserContext: () => ({ user: undefined, loading: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { shouldShowGithubResearchOnboarding } from "./workspace-home";
import { WorkspaceHome } from "./workspace-home";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const createdMethodItem: WorkspaceItem = {
  id: "created-method-item",
  ownerId: "user-one",
  kind: "method",
  status: "active",
  createdAt: "2026-08-24T08:00:00.000Z",
  updatedAt: "2026-08-24T08:00:00.000Z",
  source: {
    catalogRevision: "test",
    templateId: "method-template",
    templateVersion: "1",
    sourcePath: "test",
  },
  templateSnapshot: {
    kind: "form",
    templateId: "method-template",
    templateVersion: "1",
    catalogRevision: "test",
    contentHash: "hash",
    title: "Private Method",
    description: "A private method",
    assistantGuidance: "",
    layoutMarkdown: "",
    fields: {},
  },
  methodSource: {
    id: "private-method",
    version: "v1",
    title: "Private Method",
    description: "A private method",
    privateRepository: {
      repositoryItemId: "repository-item-1",
      repositoryId: 101,
      commitSha: "a".repeat(40),
    },
  },
  profileId: "profile-1",
  profiles: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workspace home GitHub research onboarding", () => {
  it("shows only when the feature endpoint is available and no repository is bound", () => {
    expect(
      shouldShowGithubResearchOnboarding({ ok: true, status: 200 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(true);
    expect(
      shouldShowGithubResearchOnboarding({ ok: true, status: 200 }, [
        { kind: "research_repository" },
      ])
    ).toBe(false);
  });

  it("stays hidden when the server-gated endpoint is disabled or unavailable", () => {
    expect(
      shouldShowGithubResearchOnboarding({ ok: false, status: 404 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(false);
    expect(
      shouldShowGithubResearchOnboarding({ ok: false, status: 503 }, [
        { kind: "markdown_template" },
      ])
    ).toBe(false);
  });

  it("shows the Method catalog for an empty workspace and starts a Method", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/workspace/items" && init?.method !== "POST") {
          return jsonResponse({ items: [] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({}, 404);
        }
        if (url === "/api/workspace/catalog?kind=method") {
          return jsonResponse({
            kind: "method",
            results: [
              {
                id: "public-method",
                title: "Public Method",
                description: "A public method",
              },
              {
                id: "private-method",
                title: "Private Method",
                description: "A private method",
                private: true,
                repositoryItemId: "repository-item-1",
              },
            ],
          });
        }
        if (url === "/api/workspace/items" && init?.method === "POST") {
          return jsonResponse({ item: createdMethodItem });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHome));

    expect(await screen.findByTestId("method-catalog")).toBeTruthy();
    expect(await screen.findByText("Public Method")).toBeTruthy();
    expect(await screen.findByText("Private Method")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace/catalog?kind=method",
      { credentials: "include" }
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Start Private Method" })
    );

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, request]) => request?.method === "POST"
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        kind: "method",
        methodId: "private-method",
        repositoryItemId: "repository-item-1",
      });
    });
  });
});
