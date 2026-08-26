import { expect, test } from "@playwright/test";
import { baseUrl, ensureAiModeConsent, loginAsTestUser, TIMEOUTS } from "./helpers/auth";

/**
 * Workspace settings page regression tests.
 *
 * Covers: settings page load, profile name card, AI mode card, BYOK card.
 *
 * @regression
 */
test.describe("@regression workspace-settings", () => {
  test("settings page loads with profile name form and AI mode card", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace\/settings/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // Settings breadcrumb is visible.
    await expect(page.getByTestId("settings-breadcrumb")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Profile name form card is visible with first name input.
    const firstNameInput = page.getByRole("textbox", { name: "First name" });
    await expect(firstNameInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    const value = await firstNameInput.inputValue();
    expect(typeof value).toBe("string"); // field renders

    // Last name input is visible.
    const lastNameInput = page.getByRole("textbox", { name: "Last name" });
    await expect(lastNameInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // Save button is present (scoped to the profile name form to avoid
    // matching the AI mode and BYOK save buttons).
    await expect(
      page.locator("form").filter({ hasText: "First name" }).getByRole("button", { name: "Save" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });

  test("AI mode settings card is visible on settings page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace\/settings/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // AI mode settings card renders the heading "OpenRigor AI mode".
    await expect(
      page.getByText("OpenRigor AI mode")
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });

  test("BYOK settings card is visible on settings page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace\/settings/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // BYOK card renders with the "Your own AI provider" heading.
    await expect(
      page.getByText("Your own AI provider")
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });
});
