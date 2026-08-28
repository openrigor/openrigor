import { expect, test } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  createConcludedPrivateMethod,
  ensureFixtureRepository,
  ensureSelectedMethod,
} from "../helpers/evidence-journey";

/**
 * Regression coverage for openrigor/openrigor #56 (multi-line fields lose
 * focus after one character) and #57 (multi-line fields render narrower than
 * the page text column).
 *
 * Uses pressSequentially so every character is a real keystroke — a remount
 * on any keystroke (react-markdown components recreated per value change)
 * drops focus and truncates the value to one character.
 */
test.describe("@beta-release multi-line evidence fields", () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("multi-line fields keep focus and accept sequential typing", async ({
    page,
  }) => {
    const repositoryItemId = await ensureFixtureRepository(page);
    const methodId = await ensureSelectedMethod(page, repositoryItemId);
    const evidenceUrl = await createConcludedPrivateMethod(
      page,
      repositoryItemId,
      methodId
    );

    await page.goto(`${baseUrl()}/workspace/items/${evidenceUrl}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });

    const dataSharingLimits = page.getByTestId(
      "evidence-field-data_sharing_limits"
    );
    await expect(dataSharingLimits).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    const text = "aggregate limits only; no student identifiers";
    await dataSharingLimits.pressSequentially(text, { delay: 50 });

    // #56: focus must survive every keystroke; the full string must land.
    await expect(dataSharingLimits).toBeFocused();
    await expect(dataSharingLimits).toHaveValue(text);
  });

  test("multi-line fields span the page text column width", async ({
    page,
  }) => {
    const repositoryItemId = await ensureFixtureRepository(page);
    const methodId = await ensureSelectedMethod(page, repositoryItemId);
    const evidenceUrl = await createConcludedPrivateMethod(
      page,
      repositoryItemId,
      methodId
    );

    await page.goto(`${baseUrl()}/workspace/items/${evidenceUrl}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });

    const dataSharingLimits = page.getByTestId(
      "evidence-field-data_sharing_limits"
    );
    await expect(dataSharingLimits).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // #57: the textarea must span the prose column, not shrink to label width.
    const textareaBox = await dataSharingLimits.boundingBox();
    const proseBox = await page.locator(".prose").first().boundingBox();
    expect(textareaBox).toBeTruthy();
    expect(proseBox).toBeTruthy();
    expect(Math.abs(textareaBox!.x - proseBox!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(textareaBox!.width - proseBox!.width)).toBeLessThanOrEqual(
      2
    );
  });
});
