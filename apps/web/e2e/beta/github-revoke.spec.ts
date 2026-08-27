import { expect, test } from "@playwright/test";
import { REPOSITORY_DISCONNECTED_COPY } from "../../src/components/research-repository/copy";
import { baseUrl, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  getGithubFixtureEnv,
  skipGithubFixture,
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

type RepositoryStatusWire = {
  status?: {
    state?: string;
    reason?: string;
  };
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

test.describe("@beta-release github revoke journey", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("bind private repo → disconnect GitHub → disconnected recovery is read-only", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await expect(page).toHaveURL(/\/workspace(?:\/|\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });

    const githubResponse = await page.request.get(
      `${baseUrl()}/api/workspace/github/repositories`
    );
    if (githubResponse.status() === 404) {
      skipGithubFixture(
        "GitHub research workspaces are disabled (the server endpoint returned 404)"
      );
    }
    expect(githubResponse.status()).toBe(200);
    const github = (await githubResponse.json()) as GithubRepositoriesResponse;

    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) {
      skipGithubFixture(fixtureEnv.reason);
    }
    const fixtureRepository = await verifyGithubFixtureRepository(
      fixtureEnv.config
    );
    if (!fixtureRepository.exists) {
      skipGithubFixture(fixtureRepository.skipReason);
    }
    if (fixtureRepository.skipReason) {
      skipGithubFixture(fixtureRepository.skipReason);
    }
    expect(fixtureRepository.isPrivate).toBe(true);
    if (github.connected !== true) {
      skipGithubFixture(
        "The beta account is not connected to the GitHub App; OAuth requires the configured beta account session"
      );
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
        skipGithubFixture(
          `The beta account is already bound to repository #${anotherBoundRepository.binding.repositoryId}, not ${fixtureRepository.repository.nameWithOwner}`
        );
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
        skipGithubFixture(
          `GitHub App installation does not expose fixture repository ${fixtureRepository.repository.nameWithOwner}`
        );
      }
      const bindButton = repositoryCard.getByRole("button", {
        name: `Bind ${fixtureOption.nameWithOwner}`,
        exact: true,
      });
      if ((await bindButton.count()) === 0) {
        skipGithubFixture(
          `GitHub App installation did not render fixture repository ${fixtureOption.nameWithOwner}`
        );
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

    const disconnectResponse = await page.request.post(
      `${baseUrl()}/api/workspace/github/disconnect`
    );
    expect(disconnectResponse.ok()).toBe(true);

    const disconnectedGithub = await page.request.get(
      `${baseUrl()}/api/workspace/github/repositories`
    );
    expect(disconnectedGithub.status()).toBe(200);
    expect(
      ((await disconnectedGithub.json()) as GithubRepositoriesResponse)
        .connected
    ).not.toBe(true);

    const statusResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository`
    );
    expect(statusResponse.ok()).toBe(true);
    const statusBody = (await statusResponse.json()) as RepositoryStatusWire;
    expect(statusBody.status).toMatchObject({
      state: "disconnected",
      reason: "disconnected",
    });

    const itemsAfterDisconnect = await listWorkspaceItems(page);
    const repositoryAfterDisconnect = itemsAfterDisconnect.find(
      (item) => item.id === repositoryItemId
    );
    expect(repositoryAfterDisconnect?.kind).toBe("research_repository");
    expect(repositoryAfterDisconnect?.binding?.repositoryId).toBe(
      fixtureRepository.repository.id
    );

    await page.goto(
      `${baseUrl()}/workspace/settings/repositories/${repositoryItemId}`,
      {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      }
    );
    await expect(page.getByText(REPOSITORY_DISCONNECTED_COPY)).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const reconnect = page.getByRole("link", { name: "Reconnect GitHub" });
    await expect(reconnect).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(reconnect).toHaveAttribute(
      "href",
      "/api/workspace/github/authorize"
    );

    const commitButton = page.getByRole("button", { name: "Commit changes" });
    if ((await commitButton.count()) > 0) {
      expect(await commitButton.count()).toBe(1);
      await expect(commitButton).toBeDisabled();
    }
  });
});
