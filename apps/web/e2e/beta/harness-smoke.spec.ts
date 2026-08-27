/**
 * Public-beta E2E harness smoke journey. This deliberately remains separate
 * from the regression suite until the deployed fixture account and repository
 * gate is enabled.
 */
import { expect, test } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  getGithubFixtureEnv,
  skipGithubFixture,
  verifyGithubFixtureRepository,
} from "../helpers/github-fixture";

test.describe("@beta-release @beta-harness public-beta E2E harness", () => {
  // Applies to every test in this suite including the provisioning
  // beforeEach hook, which runs before any body-level setTimeout would.
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  // Keep cleanup in a Playwright hook so it still runs when the journey fails.
  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("login reaches workspace and the GitHub binding entry point is available", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Auth assertions intentionally precede fixture checks: missing fixture
    // secrets skip the repository portion, never the login journey.
    await expect(page).toHaveURL(/\/workspace(?:\/|\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace\/settings(?:\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("settings-breadcrumb")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const repositoriesResponse = await page.request.get(
      `${baseUrl()}/api/workspace/github/repositories`
    );
    if (repositoriesResponse.status() === 404) {
      skipGithubFixture(
        "GitHub research workspaces are disabled (the server endpoint returned 404)"
      );
    }
    expect(repositoriesResponse.status()).toBe(200);
    const repositoryCard = page.getByTestId("private-repositories-card");
    await expect(repositoryCard).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(repositoryCard).toContainText("Private research repositories");
    await repositoryCard
      .getByRole("button", { name: "Add private research repository" })
      .click();
    const bindEntry = page.getByTestId("add-private-repository");
    await expect(bindEntry).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(
      bindEntry.getByText(
        /Connect GitHub|No installation repositories|Bind repository/
      )
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) {
      skipGithubFixture(fixtureEnv.reason);
    }

    const fixtureRepository = await verifyGithubFixtureRepository(
      fixtureEnv.config
    );
    if (fixtureRepository.skipReason) {
      skipGithubFixture(fixtureRepository.skipReason);
    }

    expect(fixtureRepository.exists).toBe(true);
    expect(fixtureRepository.isPrivate).toBe(true);
  });
});
