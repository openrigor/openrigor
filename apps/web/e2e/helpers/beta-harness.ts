/**
 * Provision and reset helpers for the dedicated public-beta E2E account.
 * Credentials are read only from exported E2E_BETA_* environment variables;
 * this helper never loads .env.local or any other dotenv file.
 */
import { expect, Page } from "@playwright/test";
import { baseUrl, loginWithCredentials, requireEnv, TIMEOUTS } from "./auth";

/** Optional dialog attach wait. Delayed mount; do not use pageLoad. */
const AI_MODE_DIALOG_ATTACH_TIMEOUT = 15_000;

/** Log in the dedicated beta account and leave the page at the workspace home. */
export async function provision(page: Page): Promise<void> {
  const { E2E_BETA_EMAIL, E2E_BETA_PASSWORD } = requireEnv(
    "E2E_BETA_EMAIL",
    "E2E_BETA_PASSWORD"
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

/**
 * Complete the AI-mode onboarding dialog if it appears on the workspace home.
 * Fixture accounts created via the admin API have no `user_ai_consent` row,
 * so workspace home mounts the modal (`mode === null`) and its fixed overlay
 * blocks the Create button.
 *
 * The dialog container has zero height (its children are position:fixed), so
 * `isVisible()` never reports true — mounted means open. Wait for ATTACHMENT,
 * then drive the real flow: BYOK (recommended default; saving the mode choice
 * does not require a provider key) → Continue. No-op when the dialog never
 * mounts (consent already saved), so it is safe to call on every journey.
 */
export async function completeAiModeOnboardingIfOpen(
  page: Page
): Promise<void> {
  const dialog = page.getByTestId("ai-mode-onboarding");
  await dialog
    .waitFor({ state: "attached", timeout: AI_MODE_DIALOG_ATTACH_TIMEOUT })
    .catch(() => undefined);
  if ((await dialog.count().catch(() => 0)) === 0) return;
  await dialog.getByTestId("ai-mode-byok").click();
  await dialog
    .getByRole("button", { name: "Continue with this mode", exact: true })
    .click();
  await dialog.waitFor({ state: "detached", timeout: TIMEOUTS.pageLoad });
}
