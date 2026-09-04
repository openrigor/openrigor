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
import type { ResearchRepositoryWorkspaceItem } from "@/lib/workspace/research-repository/method-host-types";
import { PrivateResearchRepositoriesCard } from "./private-research-repositories-card";

const repositoryItem = (
  id: string,
  repositoryId: number,
  initialized = true
): ResearchRepositoryWorkspaceItem => ({
  id,
  ownerId: "user-one",
  kind: "research_repository",
  status: "active",
  createdAt: "2026-08-24T08:00:00.000Z",
  updatedAt: "2026-08-24T08:00:00.000Z",
  binding: {
    provider: "github",
    repositoryId,
    installationId: 99,
    branch: "openrigor/workspace",
    layoutVersion: "1.0",
    headCommitSha: "a".repeat(40),
    boundAt: "2026-08-24T08:00:00.000Z",
    initialized,
    ...(initialized
      ? {}
      : { initializationFailureReason: "methods_index_missing" as const }),
  },
  selectedMethodIds: ["method-a"],
});

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

describe("PrivateResearchRepositoriesCard", () => {
  it("lists bound repositories and expands conformance-filtered methods", async () => {
    const initialized = repositoryItem("repository-one", 101);
    const uninitialized = repositoryItem("repository-two", 102, false);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [initialized, uninitialized] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            repositories: [
              { id: 101, nameWithOwner: "owner/essay-study" },
              { id: 102, nameWithOwner: "owner/uninitialized-study" },
            ],
          });
        }
        if (url.endsWith("/repository/methods")) {
          return jsonResponse({
            methods: [
              { id: "method-a", title: "Essay Review" },
              { id: "method-b", title: "Interview Study" },
            ],
            selectedMethodIds: ["method-a"],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: "repository-one",
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));

    expect(await screen.findByText("essay-study")).toBeTruthy();
    expect(screen.getByText("owner/essay-study (Private)")).toBeTruthy();
    expect((await screen.findAllByText("openrigor/workspace")).length).toBe(2);
    expect((await screen.findAllByText("ready")).length).toBe(2);
    expect(screen.getByText("Initialized")).toBeTruthy();
    expect(screen.getByText("methods index missing")).toBeTruthy();
    expect(screen.queryByText("Methods available in Create")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Manage owner/essay-study" })
    );

    expect(await screen.findByText("Methods available in Create")).toBeTruthy();
    expect(screen.getByText("Why can't I see my method?")).toBeTruthy();
    expect(
      await screen.findByRole("checkbox", { name: "Select Essay Review" })
    ).toBeTruthy();
  });

  it("round-trips method checkbox selections through the stored selection endpoint", async () => {
    const item = repositoryItem("repository-one", 101);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [item] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
          });
        }
        if (url.endsWith("/repository/methods") && init?.method === "PATCH") {
          return jsonResponse({ selectedMethodIds: ["method-a", "method-b"] });
        }
        if (url.endsWith("/repository/methods")) {
          return jsonResponse({
            methods: [
              { id: "method-a", title: "Essay Review" },
              { id: "method-b", title: "Interview Study" },
            ],
            selectedMethodIds: ["method-a"],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: item.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Manage owner/essay-study",
      })
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select Interview Study" })
    );

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/repository/methods") &&
          init?.method === "PATCH"
      );
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        selectedMethodIds: ["method-a", "method-b"],
      });
    });
  });

  it("opens the add section and binds an installation repository", async () => {
    const addedItem = repositoryItem("repository-added", 303);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/workspace/items" && init?.method === "POST") {
          return jsonResponse({ item: addedItem }, 201);
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            repositories: [{ id: 303, nameWithOwner: "owner/new-study" }],
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add private research repository",
      })
    );
    expect(screen.getByTestId("add-private-repository")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Create from template" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Bind owner/new-study" })
    );

    expect(await screen.findByText("new-study")).toBeTruthy();
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/workspace/items" && init?.method === "POST"
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      kind: "research_repository",
      installationId: 99,
      repositoryId: 303,
    });
  });

  it("keeps the existing GitHub connect path for disconnected users", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/workspace/items") {
        return jsonResponse({ items: [] });
      }
      return jsonResponse({ connected: false, repositories: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add private research repository",
      })
    );

    expect(
      screen.getByRole("link", { name: "Connect GitHub" }).getAttribute("href")
    ).toBe("/api/workspace/github/authorize");
  });

  it("does not render a second status pill in the expanded methods panel", async () => {
    const item = repositoryItem("repository-one", 101);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/items") {
        return jsonResponse({ items: [item] });
      }
      if (url === "/api/workspace/github/repositories") {
        return jsonResponse({
          connected: true,
          installationId: 99,
          repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
        });
      }
      if (url.endsWith("/repository/methods")) {
        return jsonResponse({
          methods: [{ id: "method-a", title: "Essay Review" }],
          selectedMethodIds: ["method-a"],
        });
      }
      if (url.endsWith("/repository")) {
        return jsonResponse({
          status: {
            workspaceId: item.id,
            repositoryId: 101,
            state: "disconnected",
            reason: "disconnected",
            checkedAt: "2026-08-24T08:00:00.000Z",
          },
        });
      }
      return jsonResponse({ error: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage owner/essay-study" })
    );

    expect(await screen.findByText("Methods available in Create")).toBeTruthy();
    expect(
      await screen.findByRole("checkbox", { name: "Select Essay Review" })
    ).toBeTruthy();
    // The row header shows the single collapsed status pill…
    expect(screen.getAllByText("disconnected")).toHaveLength(1);
    expect(screen.queryByText("disconnected · disconnected")).toBeNull();
    // …and the expanded panel adds no duplicate badge or Connect button.
    expect(screen.queryByRole("link", { name: "Connect GitHub" })).toBeNull();
    const statusFetches = fetchMock.mock.calls.filter(
      ([url]) =>
        String(url).endsWith("/repository") &&
        !String(url).endsWith("/repository/methods")
    );
    expect(statusFetches).toHaveLength(1);
  });

  it("lists a second live installation repository as bindable", async () => {
    const bound = repositoryItem("repository-one", 101);
    const addedItem = repositoryItem("repository-added", 303);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/workspace/items" && init?.method === "POST") {
          return jsonResponse({ item: addedItem }, 201);
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [bound] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            login: "octocat",
            repositories: [
              { id: 101, nameWithOwner: "owner/essay-study" },
              { id: 303, nameWithOwner: "owner/new-study" },
            ],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: bound.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add private research repository",
      })
    );

    expect(
      screen.getByRole("button", { name: "Bind owner/essay-study" })
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Bound")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Bind owner/new-study" })
    );
    expect(await screen.findByText("new-study")).toBeTruthy();
  });

  it("removes a bound repository after confirm", async () => {
    const item = repositoryItem("repository-one", 101);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === `/api/workspace/items/${item.id}` &&
          init?.method === "DELETE"
        ) {
          return new Response(null, { status: 204 });
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [item] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            login: "octocat",
            repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: item.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage owner/essay-study" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove owner/essay-study" })
    );

    expect(confirm).toHaveBeenCalledWith(
      "Remove owner/essay-study from your OpenRigor workspace? Artifacts stay in the repository on GitHub."
    );
    await waitFor(() => {
      expect(screen.queryByText("essay-study")).toBeNull();
    });
    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `/api/workspace/items/${item.id}` &&
        init?.method === "DELETE"
    );
    expect(deleteCall?.[1]?.headers).toMatchObject({
      "X-Requested-With": "XMLHttpRequest",
    });
  });

  it("does not delete when remove is declined", async () => {
    const item = repositoryItem("repository-one", 101);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false)
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/items") {
        return jsonResponse({ items: [item] });
      }
      if (url === "/api/workspace/github/repositories") {
        return jsonResponse({
          connected: true,
          installationId: 99,
          repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
        });
      }
      if (url.endsWith("/repository")) {
        return jsonResponse({
          status: {
            workspaceId: item.id,
            repositoryId: 101,
            state: "ready",
            checkedAt: "2026-08-24T08:00:00.000Z",
          },
        });
      }
      return jsonResponse({ error: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage owner/essay-study" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove owner/essay-study" })
    );

    expect(screen.getByText("essay-study")).toBeTruthy();
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    expect(fetchCalls.some(([, init]) => init?.method === "DELETE")).toBe(
      false
    );
  });

  it("keeps the row and shows an alert when remove fails", async () => {
    const item = repositoryItem("repository-one", 101);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === `/api/workspace/items/${item.id}` &&
          init?.method === "DELETE"
        ) {
          return jsonResponse({ error: "failed" }, 500);
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [item] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: item.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage owner/essay-study" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove owner/essay-study" })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("essay-study")).toBeTruthy();
  });

  it("disconnects GitHub and returns the connect affordance", async () => {
    const item = repositoryItem("repository-one", 101);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === "/api/workspace/github/disconnect" &&
          init?.method === "POST"
        ) {
          return new Response(null, { status: 204 });
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [item] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            login: "octocat",
            repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
          });
        }
        if (url.endsWith("/repository/methods")) {
          return jsonResponse({
            methods: [{ id: "method-a", title: "Essay Review" }],
            selectedMethodIds: ["method-a"],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: item.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    expect(await screen.findByTestId("connected-as")).toBeTruthy();
    fireEvent.click(screen.getByTestId("disconnect-github"));

    await waitFor(() => {
      expect(
        screen
          .getByRole("link", { name: "Connect GitHub" })
          .getAttribute("href")
      ).toBe("/api/workspace/github/authorize");
    });
    const disconnectCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/workspace/github/disconnect" &&
        init?.method === "POST"
    );
    expect(disconnectCall?.[1]?.headers).toMatchObject({
      "X-Requested-With": "XMLHttpRequest",
    });

    // Retained bindings stay visible but read-only until reconnect.
    fireEvent.click(
      screen.getByRole("button", { name: "Manage owner/essay-study" })
    );
    const checkbox = await screen.findByRole("checkbox", {
      name: "Select Essay Review",
    });
    expect(checkbox).toHaveProperty("disabled", true);
  });

  it("keeps connected state and shows an alert when disconnect fails", async () => {
    const item = repositoryItem("repository-one", 101);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === "/api/workspace/github/disconnect" &&
          init?.method === "POST"
        ) {
          return jsonResponse({ error: "failed" }, 500);
        }
        if (url === "/api/workspace/items") {
          return jsonResponse({ items: [item] });
        }
        if (url === "/api/workspace/github/repositories") {
          return jsonResponse({
            connected: true,
            installationId: 99,
            login: "octocat",
            repositories: [{ id: 101, nameWithOwner: "owner/essay-study" }],
          });
        }
        if (url.endsWith("/repository")) {
          return jsonResponse({
            status: {
              workspaceId: item.id,
              repositoryId: 101,
              state: "ready",
              checkedAt: "2026-08-24T08:00:00.000Z",
            },
          });
        }
        return jsonResponse({ error: "Unexpected request" }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PrivateResearchRepositoriesCard));
    fireEvent.click(await screen.findByTestId("disconnect-github"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("connected-as")).toBeTruthy();
    expect(screen.getByText("essay-study")).toBeTruthy();
  });
});
