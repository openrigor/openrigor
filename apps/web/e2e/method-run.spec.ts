import { expect, test } from "@playwright/test";
import {
  baseUrl,
  ensureAiModeConsent,
  loginAsTestUser,
  TIMEOUTS,
} from "./helpers/auth";
import { openWorkspaceItem } from "./helpers/workspace";

/**
 * Method run canvas regression tests.
 *
 * Creates a method workspace item via the API (using the ai-assisted-essay
 * apparatus), opens the run canvas, and verifies the method banner,
 * Start assignment button, and chat panel render.
 *
 * @regression
 */
test.describe("@regression method-run", () => {
  const METHOD_ID = "ai-assisted-essay";

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await ensureAiModeConsent(page);
  });

  test("create method via API and open run canvas with method banner", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Create a method workspace item via the API.
    const createResponse = await page.request.post(
      `${baseUrl()}/api/workspace/items`,
      { data: { methodId: METHOD_ID } }
    );
    expect(createResponse.ok()).toBeTruthy();
    const createBody = (await createResponse.json()) as {
      item: { id: string; kind: string };
    };
    const itemId = createResponse.ok()
      ? (createBody as { item: { id: string } }).item.id
      : "";

    // Open the workspace item.
    await openWorkspaceItem(page, itemId);

    // The banner is visible with a Workspace link.
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();

    // The method title is shown in the banner area.
    await expect(banner.getByText("AI-assisted essay").first()).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Start assignment button is visible (method run canvas).
    await expect(
      page.getByRole("button", { name: "Start assignment" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // Chat panel is visible.
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
  });

  test("method run canvas shows Abandon and Collapse Chat buttons", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Create a method workspace item via the API.
    const createResponse = await page.request.post(
      `${baseUrl()}/api/workspace/items`,
      { data: { methodId: METHOD_ID } }
    );
    expect(createResponse.ok()).toBeTruthy();
    const createBody = (await createResponse.json()) as {
      item: { id: string; kind: string };
    };
    const itemId = createResponse.ok()
      ? (createBody as { item: { id: string } }).item.id
      : "";

    // Open the workspace item.
    await openWorkspaceItem(page, itemId);

    // Abandon button is visible.
    await expect(
      page.getByRole("button", { name: "Abandon" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // Collapse Chat button is visible.
    await expect(
      page.getByRole("button", { name: "Collapse Chat" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });
});
