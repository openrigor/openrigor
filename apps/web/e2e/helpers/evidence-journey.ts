/**
 * Shared evidence-journey setup helpers for the public-beta E2E suite.
 * Extracted from evidence-declaration-submit.spec.ts so focus/width
 * regression specs can reuse the same provisioning flow.
 */
import { expect, Page, type APIResponse } from "@playwright/test";
import { baseUrl, requireEnv, TIMEOUTS } from "./auth";

type GithubRepositoriesResponse = {
  connected?: boolean;
  installationId?: number;
  repositories?: Array<{ id: number; nameWithOwner: string }>;
};

type WorkspaceItemWire = {
  id: string;
  kind: string;
  binding?: { repositoryId?: number };
  selectedMethodIds?: string[];
};

type MethodWire = {
  id: string;
  title?: string;
};

async function jsonResponse<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

export async function ensureFixtureRepository(page: Page): Promise<string> {
  const { E2E_BETA_FIXTURE_REPO } = requireEnv("E2E_BETA_FIXTURE_REPO");
  const githubResponse = await page.request.get(
    `${baseUrl()}/api/workspace/github/repositories`
  );
  expect(githubResponse.status()).toBe(200);
  const github = await jsonResponse<GithubRepositoriesResponse>(githubResponse);
  expect(github.connected).toBe(true);
  expect(github.installationId).toEqual(expect.any(Number));
  const fixtureRepository = github.repositories?.find(
    (repository) => repository.nameWithOwner === E2E_BETA_FIXTURE_REPO
  );
  expect(fixtureRepository).toBeTruthy();

  const itemsResponse = await page.request.get(
    `${baseUrl()}/api/workspace/items`
  );
  expect(itemsResponse.status()).toBe(200);
  const items = await jsonResponse<{ items?: WorkspaceItemWire[] }>(
    itemsResponse
  );
  const boundRepository = items.items?.find(
    (item) =>
      item.kind === "research_repository" &&
      item.binding?.repositoryId === fixtureRepository!.id
  );
  if (boundRepository) return boundRepository.id;

  const anotherBoundRepository = items.items?.find(
    (item) => item.kind === "research_repository"
  );
  expect(
    anotherBoundRepository,
    "The beta account is bound to a different repository"
  ).toBeUndefined();

  const bindResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    {
      data: {
        kind: "research_repository",
        repositoryId: fixtureRepository!.id,
        installationId: github.installationId,
      },
    }
  );
  expect(bindResponse.status()).toBe(201);
  const bindBody = await jsonResponse<{ item?: { id?: string } }>(bindResponse);
  expect(bindBody.item?.id).toBeTruthy();
  return bindBody.item!.id!;
}

export async function ensureSelectedMethod(
  page: Page,
  repositoryItemId: string
): Promise<string> {
  const methodsResponse = await page.request.get(
    `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository/methods`
  );
  expect(methodsResponse.status()).toBe(200);
  const methods = await jsonResponse<{
    methods?: MethodWire[];
    selectedMethodIds?: string[];
  }>(methodsResponse);
  const method = methods.methods?.[0];
  expect(method).toBeTruthy();
  const selectedMethodIds = [
    ...new Set([...(methods.selectedMethodIds ?? []), method!.id]),
  ];
  if (!methods.selectedMethodIds?.includes(method!.id)) {
    const selectResponse = await page.request.patch(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository/methods`,
      { data: { selectedMethodIds } }
    );
    expect(selectResponse.status()).toBe(200);
  }
  return method!.id;
}

/**
 * Create a method workspace item, conclude it (start the run), and open an
 * evidence thread. Returns `${itemId}?evidence=<threadId>` ready to navigate.
 */
export async function createConcludedPrivateMethod(
  page: Page,
  repositoryItemId: string,
  methodId: string
): Promise<string> {
  const { E2E_BETA_EMAIL } = requireEnv("E2E_BETA_EMAIL");
  const createResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    { data: { methodId, repositoryItemId } }
  );
  expect(createResponse.status()).toBe(201);
  const createBody = await jsonResponse<{ item?: { id?: string } }>(
    createResponse
  );
  expect(createBody.item?.id).toBeTruthy();
  const itemId = createBody.item!.id!;

  const startResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items/${itemId}/submit`,
    {
      data: {
        values: {
          title: "Evidence declaration regression",
          course: "Regression course",
          due_date: "2026-12-15",
          word_target: 500,
          essay_prompt: "Write a short factual response.",
          group: "Regression group",
          participants: E2E_BETA_EMAIL,
        },
      },
    }
  );
  expect([200, 201]).toContain(startResponse.status());
  const startBody = await jsonResponse<{ item?: { run?: unknown } }>(
    startResponse
  );
  expect(startBody.item?.run).toBeTruthy();

  const evidenceResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items/${itemId}/evidence`
  );
  expect([200, 201]).toContain(evidenceResponse.status());
  const evidenceBody = await jsonResponse<{ threadId?: string }>(
    evidenceResponse
  );
  expect(evidenceBody.threadId).toBeTruthy();
  return `${itemId}?evidence=${encodeURIComponent(evidenceBody.threadId!)}`;
}
