import { expect, test } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  getGithubFixtureEnv,
  recordGithubFixtureSkipReason,
  verifyGithubFixtureRepository,
} from "../helpers/github-fixture";

type WorkspaceItemWire = {
  id: string;
  kind: string;
  binding?: { repositoryId?: number };
};

type GithubRepositoriesResponse = {
  connected?: boolean;
  repositories?: Array<{ id: number; nameWithOwner: string }>;
};

type MethodWire = {
  id: string;
  title?: string;
};

type CatalogResultWire = {
  id: string;
  title?: string;
  private?: boolean;
  repositoryItemId?: string;
  methodVersion?: string;
  commitSha?: string;
  templateKind?: "markdown" | "form";
};

function isRepositoryItem(
  item: WorkspaceItemWire
): item is WorkspaceItemWire & { binding: { repositoryId: number } } {
  return (
    item.kind === "research_repository" &&
    typeof item.binding?.repositoryId === "number"
  );
}

async function listWorkspaceItems(page: Parameters<typeof provision>[0]) {
  const response = await page.request.get(`${baseUrl()}/api/workspace/items`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items?: WorkspaceItemWire[] };
  return body.items ?? [];
}

async function createFromCatalog(
  page: Parameters<typeof provision>[0],
  kind: "method" | "template",
  result: CatalogResultWire,
  ariaLabel: string
): Promise<{ id: string }> {
  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("heading", { name: "Create workspace item" })
  ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  await page
    .getByRole("button", { name: kind === "method" ? "Methods" : "Templates" })
    .click();
  const search = page.getByPlaceholder("Search templates, methods, or ledgers");
  await search.fill(result.id);
  const resultButton = page.getByRole("button", {
    name: ariaLabel,
    exact: true,
  });
  await expect(resultButton).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/workspace/items") &&
      response.request().method() === "POST" &&
      response.status() === 201,
    { timeout: TIMEOUTS.pageLoad }
  );
  await resultButton.click();
  const body = (await (await createResponse).json()) as {
    item?: { id?: string };
  };
  expect(body.item?.id).toBeTruthy();
  return { id: body.item!.id! };
}

test.describe("@beta-release public-beta onboarding journey", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("signup → connect GitHub → bind private repo → create first artifact", async ({
    page,
  }) => {
    // `provision` is the beta harness's env-only signup/session boundary.
    // Keep these auth assertions before every fixture- or flag-gated branch.
    await expect(page).toHaveURL(/\/workspace(?:\/|\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const githubResponse = await page.request.get(
      `${baseUrl()}/api/workspace/github/repositories`
    );
    if (githubResponse.status() === 404) {
      recordGithubFixtureSkipReason(
        test.info(),
        "GitHub research workspaces are disabled (the server endpoint returned 404)"
      );
      return;
    }
    expect(githubResponse.status()).toBe(200);
    const github = (await githubResponse.json()) as GithubRepositoriesResponse;

    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) {
      recordGithubFixtureSkipReason(test.info(), fixtureEnv.reason);
      return;
    }
    const fixtureRepository = await verifyGithubFixtureRepository(
      fixtureEnv.config
    );
    if (!fixtureRepository.exists) {
      recordGithubFixtureSkipReason(test.info(), fixtureRepository.skipReason);
      return;
    }
    if (fixtureRepository.skipReason) {
      recordGithubFixtureSkipReason(test.info(), fixtureRepository.skipReason);
      return;
    }
    expect(fixtureRepository.isPrivate).toBe(true);
    if (github.connected !== true) {
      recordGithubFixtureSkipReason(
        test.info(),
        "The beta account is not connected to the GitHub App; OAuth requires the configured beta account session"
      );
      return;
    }

    const initialItems = await listWorkspaceItems(page);
    const boundRepository = initialItems
      .filter(isRepositoryItem)
      .find(
        (item) => item.binding.repositoryId === fixtureRepository.repository.id
      );
    const anotherBoundRepository = initialItems.find(isRepositoryItem);
    let repositoryItemId: string | undefined;

    if (!boundRepository) {
      if (anotherBoundRepository) {
        recordGithubFixtureSkipReason(
          test.info(),
          `The beta account is already bound to repository #${anotherBoundRepository.binding.repositoryId}, not ${fixtureRepository.repository.nameWithOwner}`
        );
        return;
      }
      const onboarding = page.getByTestId("github-research-onboarding");
      await expect(onboarding).toBeVisible({ timeout: TIMEOUTS.pageLoad });
      const connectLink = onboarding.getByRole("link", {
        name: "Connect GitHub",
      });
      await expect(connectLink).toHaveAttribute(
        "href",
        "/api/workspace/github/authorize"
      );

      await page.goto(`${baseUrl()}/workspace/settings`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      });
      await expect(page.getByTestId("settings-breadcrumb")).toBeVisible({
        timeout: TIMEOUTS.pageLoad,
      });
      const repositoryCard = page.getByTestId("private-repositories-card");
      await expect(repositoryCard).toBeVisible({ timeout: TIMEOUTS.pageLoad });
      await repositoryCard
        .getByRole("button", { name: "Add private research repository" })
        .click();

      const fixtureOption = (github.repositories ?? []).find(
        (repository) => repository.id === fixtureRepository.repository.id
      );
      if (!fixtureOption) {
        recordGithubFixtureSkipReason(
          test.info(),
          `GitHub App installation does not expose fixture repository ${fixtureRepository.repository.nameWithOwner}`
        );
        return;
      }
      const bindButton = repositoryCard.getByRole("button", {
        name: `Bind ${fixtureOption.nameWithOwner}`,
        exact: true,
      });
      if ((await bindButton.count()) === 0) {
        recordGithubFixtureSkipReason(
          test.info(),
          `GitHub App installation did not render fixture repository ${fixtureOption.nameWithOwner}`
        );
        return;
      }
      const bindResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/workspace/items") &&
          response.request().method() === "POST" &&
          response.status() === 201,
        { timeout: TIMEOUTS.pageLoad }
      );
      await bindButton.click();
      const bindBody = (await (await bindResponse).json()) as {
        item?: { id?: string; kind?: string };
      };
      expect(bindBody.item?.kind).toBe("research_repository");
      expect(bindBody.item?.id).toBeTruthy();
      repositoryItemId = bindBody.item!.id!;
      await expect(repositoryCard).toContainText(
        fixtureOption.nameWithOwner.split("/").at(-1) ??
          fixtureOption.nameWithOwner
      );
    } else {
      expect(boundRepository.binding.repositoryId).toBe(
        fixtureRepository.repository.id
      );
      repositoryItemId = boundRepository.id;
    }

    expect(repositoryItemId).toBeTruthy();
    const methodsResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository/methods`
    );
    const methodsBody = methodsResponse.ok()
      ? ((await methodsResponse.json()) as { methods?: MethodWire[] })
      : undefined;
    const method = methodsBody?.methods?.[0];

    let createdItem: { id: string };
    if (method) {
      await page.goto(`${baseUrl()}/workspace/settings`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      });
      const repositoryCard = page.getByTestId("private-repositories-card");
      await expect(repositoryCard).toBeVisible({ timeout: TIMEOUTS.pageLoad });
      const manageButton = repositoryCard.getByRole("button", {
        name: `Manage ${
          github.repositories?.find(
            (repository) => repository.id === fixtureRepository.repository.id
          )?.nameWithOwner ?? fixtureRepository.repository.nameWithOwner
        }`,
      });
      await manageButton.click();
      const methodLabel = `Select ${method.title ?? method.id}`;
      const methodCheckbox = repositoryCard.getByRole("checkbox", {
        name: methodLabel,
        exact: true,
      });
      await expect(methodCheckbox).toBeVisible({ timeout: TIMEOUTS.pageLoad });
      if (!(await methodCheckbox.isChecked())) {
        await methodCheckbox.check();
      }
      await expect(methodCheckbox).toBeChecked();

      await page.goto(`${baseUrl()}/workspace`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      });

      const catalogResponse = await page.request.get(
        `${baseUrl()}/api/workspace/catalog?kind=method&q=${encodeURIComponent(method.id)}`
      );
      expect(catalogResponse.status()).toBe(200);
      const catalogBody = (await catalogResponse.json()) as {
        results?: CatalogResultWire[];
      };
      const privateMethod = catalogBody.results?.find(
        (result) =>
          result.id === method.id &&
          result.private === true &&
          result.repositoryItemId === repositoryItemId
      );
      expect(privateMethod).toBeTruthy();
      expect(privateMethod?.commitSha).toMatch(/^[a-f0-9]{40}$/i);
      createdItem = await createFromCatalog(
        page,
        "method",
        privateMethod!,
        `${method.title ?? method.id} (Private)`
      );
    } else {
      await page.goto(`${baseUrl()}/workspace`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      });
      const templatesResponse = await page.request.get(
        `${baseUrl()}/api/workspace/catalog?kind=template&q=`
      );
      expect(templatesResponse.status()).toBe(200);
      const templatesBody = (await templatesResponse.json()) as {
        results?: CatalogResultWire[];
      };
      const markdownTemplate = templatesBody.results?.find(
        (result) => result.templateKind === "markdown"
      );
      expect(markdownTemplate).toBeTruthy();
      createdItem = await createFromCatalog(
        page,
        "template",
        markdownTemplate!,
        markdownTemplate!.title ?? markdownTemplate!.id
      );
    }

    await page.goto(`${baseUrl()}/workspace/items/${createdItem.id}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("workspace-item-banner")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const itemResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${createdItem.id}`
    );
    expect(itemResponse.status()).toBe(200);
    const itemBody = (await itemResponse.json()) as {
      item?: {
        kind?: string;
        source?: {
          catalogRevision?: string;
          templateVersion?: string;
        };
        templateSnapshot?: {
          initialMarkdown?: string;
          layoutMarkdown?: string;
        };
        methodSource?: {
          version?: string;
          privateRepository?: {
            repositoryItemId?: string;
            repositoryId?: number;
            commitSha?: string;
          };
        };
      };
    };
    expect(itemBody.item?.source?.catalogRevision).toBeTruthy();
    expect(itemBody.item?.source?.templateVersion).toBeTruthy();
    expect(itemBody.item?.templateSnapshot).toBeTruthy();

    if (itemBody.item?.kind === "method") {
      expect(itemBody.item.methodSource?.version).toBeTruthy();
      expect(itemBody.item.methodSource?.privateRepository).toMatchObject({
        repositoryItemId,
        repositoryId: fixtureRepository.repository.id,
        commitSha: expect.stringMatching(/^[a-f0-9]{40}$/i),
      });
    } else {
      expect(itemBody.item?.kind).toBe("markdown_template");
      expect(itemBody.item?.templateSnapshot?.initialMarkdown).toBeDefined();
    }
  });
});
