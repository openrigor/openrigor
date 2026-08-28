import { expect, test } from "@playwright/test";
import { baseUrl, loginAsTestUser, TIMEOUTS } from "./helpers/auth";
import { openWorkspaceItem } from "./helpers/workspace";

/**
 * Markdown template workspace item regression tests.
 *
 * Creates a markdown template workspace item via the API, opens it,
 * and verifies the markdown canvas renders content and the editor
 * is available.
 *
 * @regression
 */
test.describe("@regression template-crud", () => {
  const TEMPLATE_ID = "evaluchat-getting-started";

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("create markdown template via API and open with content visible", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Create a markdown template workspace item via the API.
    const createResponse = await page.request.post(
      `${baseUrl()}/api/workspace/items`,
      { data: { templateId: TEMPLATE_ID } }
    );
    expect(createResponse.ok()).toBeTruthy();
    const createBody = (await createResponse.json()) as {
      item: { id: string; kind: string };
    };
    const itemId = createBody.item.id;

    // Open the workspace item.
    await openWorkspaceItem(page, itemId);

    // The banner is visible.
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();

    // The markdown content renders the Getting Started template content.
    await expect(page.getByText("Welcome to OpenRigor")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // The chat input is available.
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
  });

  test("markdown template appears in workspace item list after creation", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Create a markdown template workspace item via the API.
    const createResponse = await page.request.post(
      `${baseUrl()}/api/workspace/items`,
      { data: { templateId: TEMPLATE_ID } }
    );
    expect(createResponse.ok()).toBeTruthy();
    const createBody = (await createResponse.json()) as {
      item: { id: string; kind: string };
    };
    const itemId = createBody.item.id;

    // Navigate to workspace home.
    await page.goto(`${baseUrl()}/workspace`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // The item list loads (either empty state or the list with our item).
    // Verify the workspace page renders its main shell.
    await expect(
      page.getByRole("button", { name: "Create" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // Fetch the API to confirm the item exists.
    const listResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items`
    );
    expect(listResponse.ok()).toBeTruthy();
    const listBody = (await listResponse.json()) as {
      items: Array<{ id: string; kind: string }>;
    };
    const found = listBody.items.find((i) => i.id === itemId);
    expect(found).toBeTruthy();
    expect(found!.kind).toBe("markdown_template");
  });
});
