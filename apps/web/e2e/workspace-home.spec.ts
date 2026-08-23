import { expect, test } from "@playwright/test";
import {
  loginAsTestUser,
  logout,
  TIMEOUTS,
} from "./helpers/auth";

/**
 * Lean current-surface smoke for the unified `/workspace` home (the OSS
 * replacement for the retired teacher/student role homes; issue #96).
 *
 * Covers: post-login routing, workspace home render, the create dialog
 * (open + the three catalog kinds incl. Evidence Ledger), and sign-out.
 *
 * @regression
 */
test.describe("@regression workspace-home", () => {
  test("login routes to /workspace and the home renders", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    // Post-login land on the unified workspace home.
    await expect(page).toHaveURL(/\/workspace(\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    // The home shell renders a Create entry point.
    await expect(
      page.getByRole("button", { name: "Create" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });

  test("create dialog opens with the Evidence Ledger catalog kind", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace(\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    await page.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("heading", { name: "Create workspace item" })
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    for (const tab of ["Templates", "Evidence Ledger", "Methods"]) {
      await expect(
        page.getByRole("button", { name: tab })
      ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    }
    await page
      .getByRole("button", { name: "Evidence Ledger" })
      .click();
    await expect(
      page.getByPlaceholder("Search templates, methods, or ledgers")
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  });

  test("sign out returns to /auth/login", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace(\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
    await logout(page);
    await expect(page).toHaveURL(/\/auth\/login(\?|$)/, {
      timeout: TIMEOUTS.pageLoad,
    });
  });
});
