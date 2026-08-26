import { expect, test } from "@playwright/test";
import { baseUrl, ensureAiModeConsent, loginAsTestUser, TIMEOUTS } from "./helpers/auth";
import { openWorkspaceItem } from "./helpers/workspace";

/**
 * Method form canvas regression tests.
 *
 * Creates a method workspace item via the API (using the ai-assisted-essay
 * apparatus), opens the form canvas, and verifies form fields and the
 * submission dialog render correctly.
 *
 * @regression
 */
test.describe("@regression method-form", () => {
  const METHOD_ID = "ai-assisted-essay";

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await ensureAiModeConsent(page);
  });

  test("create method via API and open form canvas with fields visible", async ({
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
    const itemId = createResponse.ok() ? createBody.item.id : null;
    expect(itemId).toBeTruthy();

    // Open the workspace item.
    await openWorkspaceItem(page, itemId!);

    // The banner is visible and shows the workspace link.
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();

    // The form canvas renders form fields with data-testid prefixes.
    // The method canvas has at least one form field (data-testid="form-field-*").
    const formFields = page.locator("[data-testid^='form-field-']");
    await expect(formFields.first()).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    const fieldCount = await formFields.count();
    expect(fieldCount).toBeGreaterThanOrEqual(1);

    // The chat input is available for agent interaction.
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
  });

  test("method canvas shows Start assignment button for ai-assisted-essay", async ({
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
    const itemId = createBody.item.id;

    // Open the workspace item.
    await openWorkspaceItem(page, itemId);

    // The method run canvas renders the "Start assignment" button.
    const startBtn = page.getByRole("button", { name: "Start assignment" });
    await expect(startBtn).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });
});
