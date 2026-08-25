/**
 * Provision and reset helpers for the dedicated public-beta E2E account.
 * Credentials are read only from exported E2E_BETA_* environment variables;
 * this helper never loads .env.local or any other dotenv file.
 */
import { expect, Page } from "@playwright/test";
import { baseUrl, loginWithCredentials, requireEnv, TIMEOUTS } from "./auth";

/** Log in the dedicated beta account and leave the page at the workspace home. */
export async function provision(page: Page): Promise<void> {
  const { E2E_BETA_EMAIL, E2E_BETA_PASSWORD } = requireEnv(
    "E2E_BETA_EMAIL",
    "E2E_BETA_PASSWORD",
  );

  await page.context().clearCookies();
  await loginWithCredentials(page, E2E_BETA_EMAIL, E2E_BETA_PASSWORD);
  await expect(page).toHaveURL(/\/workspace(?:\/|\?|$)/, {
    timeout: TIMEOUTS.pageLoad,
  });
}

/** Sign out through the application route and clear the beta session cookies. */
export async function reset(page: Page): Promise<void> {
  try {
    await page.goto(`${baseUrl()}/auth/signout`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/auth\/login(?:\?|$)/, {
      timeout: TIMEOUTS.loginRedirect,
    });
  } finally {
    await page.context().clearCookies();
  }
}
