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
  recordGithubFixtureSkipReason,
  verifyGithubFixtureRepository,
} from "../helpers/github-fixture";

test.describe("public-beta E2E harness", () => {
  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  // Keep cleanup in a Playwright hook so it still runs when the journey fails.
  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("@beta-harness login reaches workspace and the GitHub binding entry point is available", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Auth assertions intentionally precede fixture checks: missing fixture
    // secrets may skip the repository portion, never the login journey.
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
      `${baseUrl()}/api/workspace/github/repositories`,
    );
    const repositoryCard = page.getByTestId("private-repositories-card");
    if (repositoriesResponse.status() === 404) {
      // The feature flag is intentionally off in this task. The settings
      // entry point remains reachable and the binding card is disabled.
      await expect(repositoryCard).toHaveCount(0);
    } else {
      expect(repositoriesResponse.status()).toBe(200);
      await expect(repositoryCard).toBeVisible({
        timeout: TIMEOUTS.pageLoad,
      });
      await expect(repositoryCard).toContainText(
        "Private research repositories",
      );
      await repositoryCard
        .getByRole("button", { name: "Add private research repository" })
        .click();
      const bindEntry = page.getByTestId("add-private-repository");
      await expect(bindEntry).toBeVisible({ timeout: TIMEOUTS.pageLoad });
      await expect(
        bindEntry.getByText(
          /Connect GitHub|No installation repositories|Bind repository/,
        ),
      ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    }

    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) {
      recordGithubFixtureSkipReason(test.info(), fixtureEnv.reason);
      test.skip(true, fixtureEnv.reason);
      return;
    }

    const fixtureRepository = await verifyGithubFixtureRepository(
      fixtureEnv.config,
    );
    if (fixtureRepository.skipReason) {
      recordGithubFixtureSkipReason(test.info(), fixtureRepository.skipReason);
      test.skip(true, fixtureRepository.skipReason);
      return;
    }

    expect(fixtureRepository.exists).toBe(true);
    expect(fixtureRepository.isPrivate).toBe(true);
  });
});
