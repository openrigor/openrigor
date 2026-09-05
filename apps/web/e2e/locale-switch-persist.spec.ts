import { expect, test } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "./helpers/auth";
import {
  completeAiModeOnboardingIfOpen,
  provision,
  reset,
} from "./helpers/beta-harness";

const LOCALE_COOKIE = "NEXT_LOCALE";

async function cookieValue(
  page: Parameters<typeof provision>[0],
  name: string
): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === name)?.value;
}

test.describe("locale-switch-persist", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
    await completeAiModeOnboardingIfOpen(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("switcher to de persists NEXT_LOCALE and German settings copy; restore en", async ({
    page,
  }) => {
    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    const switcher = page.locator("#language-switcher");
    await expect(switcher).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    await switcher.selectOption("de");
    await expect
      .poll(async () => cookieValue(page, LOCALE_COOKIE), {
        timeout: TIMEOUTS.pageLoad,
      })
      .toBe("de");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(switcher).toHaveValue("de", { timeout: TIMEOUTS.pageLoad });
    expect(await cookieValue(page, LOCALE_COOKIE)).toBe("de");
    await expect(page.getByText("Oberflächensprache")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(
      page.getByText("Wählen Sie die Sprache für den gesamten Arbeitsbereich.")
    ).toBeVisible();

    await switcher.selectOption("en");
    await expect
      .poll(async () => cookieValue(page, LOCALE_COOKIE), {
        timeout: TIMEOUTS.pageLoad,
      })
      .toBe("en");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(switcher).toHaveValue("en", { timeout: TIMEOUTS.pageLoad });
    expect(await cookieValue(page, LOCALE_COOKIE)).toBe("en");
    await expect(page.getByText("Interface language")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
  });
});
