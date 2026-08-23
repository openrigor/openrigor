/**
 * Workspace helpers for the @regression E2E suite.
 *
 * Repo convention: pre-create test data via the real API (no manual clicking)
 * where the surface supports it, and drive the UI create flow only when the
 * dialog itself is the feature under test. All helpers require a real
 * authenticated session (played against the LIVE dev deployment).
 */
import { expect, Page } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "./auth";

/** Create an Evidence Ledger workspace item via the API for the logged-in user. */
export async function createLedgerItemViaApi(
  page: Page,
  methodId: string
): Promise<string> {
  const response = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    {
      data: { kind: "ledger", methodId },
    }
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { item: { id: string } };
  return body.item.id;
}

/** Open a workspace item by id and wait for the given canvas to render. */
export async function openWorkspaceItem(
  page: Page,
  itemId: string
): Promise<void> {
  await page.goto(`${baseUrl()}/workspace/items/${itemId}`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUTS.pageLoad,
  });
}

/**
 * Set a single-select-in-a-multi `select[multiple]` filter to exactly the
 * given values. The ledger multi-select controls are keyed by `aria-label`
 * equal to the dimension id (e.g. `education_level`, `country_code`).
 */
export async function setMultiSelectFilter(
  page: Page,
  dimensionId: string,
  values: string[]
): Promise<void> {
  const select = page.locator(`select[aria-label="${dimensionId}"]`);
  await expect(select).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  // selectOption(values) is the source of truth: it both clears any current
  // selection AND dispatches the input/change events React's onChange needs.
  // Passing an empty array is the supported way to unselect all options.
  await select.selectOption(values);
}

/** Set a range filter (date/number) min/max input for a dimension. */
export async function setRangeFilter(
  page: Page,
  dimensionId: string,
  min: string | undefined,
  max: string | undefined
): Promise<void> {
  if (min !== undefined) {
    const minInput = page.locator(
      `input[aria-label="${dimensionId} minimum"]`
    );
    await expect(minInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await minInput.fill(min);
  }
  if (max !== undefined) {
    const maxInput = page.locator(
      `input[aria-label="${dimensionId} maximum"]`
    );
    await expect(maxInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await maxInput.fill(max);
  }
}
