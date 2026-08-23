/**
 * Real-auth helpers for the @regression Playwright suite in the OSS repo.
 * The suite runs headless against the LIVE dev deployment by default
 * (E2E_BASE_URL=https://dev.evaluchat.org). Creds must be EXPORTED IN THE
 * SHELL — never read from .env.local. We fail hard when required env is
 * missing; never silent-skip.
 */
import { expect, Page, test } from "@playwright/test";

export const TIMEOUTS = {
  pageLoad: 60_000,
  loginRedirect: 45_000,
};

export function baseUrl(): string {
  return (
    process.env.E2E_BASE_URL ||
    test.info().project.use.baseURL ||
    "https://dev.evaluchat.org"
  );
}

/** Throw if any env key is missing/empty. */
export function requireEnv(...keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) missing.push(key);
    else out[key] = value;
  }
  if (missing.length) {
    throw new Error(
      `Missing required env for regression: ${missing.join(", ")}`
    );
  }
  return out;
}

/**
 * Log in with the canonical test user. The OSS app routes every authenticated
 * user to the unified `/workspace` home (issue #96: the legacy role-home
 * redirects `/student | /teacher | /owner` no longer exist).
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // The live deploy sits behind Cloudflare; a first nav can abort (ERR_ABORTED)
  // on a challenge/redirect race. Retry the initial goto once before failing.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(`${baseUrl()}/auth/login`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.pageLoad,
      });
      break;
    } catch (error) {
      if (attempt === 2 || !/ERR_ABORTED/i.test(String(error))) throw error;
      await page.waitForTimeout(1500);
    }
  }
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  await expect(emailInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  await expect(passwordInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator("button[type='submit']").first().click();
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/auth/login"),
    { timeout: TIMEOUTS.loginRedirect }
  );
}

export async function loginAsTestUser(page: Page): Promise<void> {
  const { TEST_USER_EMAIL, TEST_USER_PASSWORD } = requireEnv(
    "TEST_USER_EMAIL",
    "TEST_USER_PASSWORD"
  );
  await page.context().clearCookies();
  await loginWithCredentials(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  // Unified workspace home is the canonical post-login destination.
  await expect(page).toHaveURL(/\/workspace/, { timeout: TIMEOUTS.pageLoad });
}

export async function logout(page: Page): Promise<void> {
  await page.goto(`${baseUrl()}/auth/signout`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUTS.pageLoad,
  });
  await expect(page).toHaveURL(/\/auth\/login(\?|$)/, {
    timeout: TIMEOUTS.loginRedirect,
  });
}
