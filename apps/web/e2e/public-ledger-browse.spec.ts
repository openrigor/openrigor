import { expect, test } from "@playwright/test";
import { baseUrl, loginAsTestUser, TIMEOUTS } from "./helpers/auth";

/**
 * Published ledgers browse regression tests.
 *
 * Verifies that the published ledgers API endpoint is reachable and returns
 * a well-formed response for an authenticated user. This covers the
 * "browse published ledgers" journey that feeds the finding-starter template's
 * ledger picker.
 *
 * @regression
 */
test.describe("@regression public-ledger-browse", () => {
  test("published ledgers API returns valid response for authenticated user", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // Call the published ledgers endpoint directly via the API.
    const response = await page.request.get(
      `${baseUrl()}/api/workspace/published-ledgers`
    );
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      ledgers: Array<Record<string, unknown>>;
      error?: string;
    };
    // The response must have a `ledgers` array (may be empty).
    expect(body).toHaveProperty("ledgers");
    expect(Array.isArray(body.ledgers)).toBe(true);
  });

  test("catalog API returns template results for authenticated user", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // Call the catalog endpoint for templates (default kind).
    const response = await page.request.get(
      `${baseUrl()}/api/workspace/catalog?q=`
    );
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      kind: string;
      results: Array<Record<string, unknown>>;
    };
    expect(body.kind).toBe("template");
    expect(Array.isArray(body.results)).toBe(true);
    // The built-in catalog has at least 1 template.
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  test("catalog API returns method results for authenticated user", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/workspace/, {
      timeout: TIMEOUTS.pageLoad,
    });

    // Call the catalog endpoint for methods.
    const response = await page.request.get(
      `${baseUrl()}/api/workspace/catalog?kind=method&q=`
    );
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      kind: string;
      results: Array<Record<string, unknown>>;
    };
    expect(body.kind).toBe("method");
    expect(Array.isArray(body.results)).toBe(true);
    // The built-in catalog has at least 1 method (ai-assisted-essay).
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });
});
