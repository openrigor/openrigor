import { expect, test } from "@playwright/test";
import { baseUrl, requireEnv, TIMEOUTS } from "./helpers/auth";
import {
  completeAiModeOnboardingIfOpen,
  provision,
  reset,
} from "./helpers/beta-harness";
import { openWorkspaceItem } from "./helpers/workspace";

const METHOD_ID = "ai-assisted-essay";
const GERMAN_MARKERS = /\b(der|die|das|und|ich|nicht|ein|eine|ist|du|Sie)\b/i;

async function waitForGermanCoach(page: Parameters<typeof provision>[0]) {
  const panel = page.locator("#chat-panel-main");
  await expect(panel).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  const baseline = ((await panel.innerText()) ?? "").trim().length;

  await expect
    .poll(
      async () => {
        const cancel = panel.getByRole("button", { name: /^cancel$/i });
        const streaming = await cancel.isVisible().catch(() => false);
        const text = ((await panel.innerText()) ?? "").trim();
        const grown = text.length > baseline + 40;
        return !streaming && grown && GERMAN_MARKERS.test(text);
      },
      { timeout: 120_000, intervals: [2_000, 4_000, 6_000] }
    )
    .toBe(true);
}

test.describe("assignment-locale", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
    await completeAiModeOnboardingIfOpen(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("DE method-run coach kickoff is German (language-sanity)", async ({
    page,
  }) => {
    const { E2E_BETA_EMAIL } = requireEnv("E2E_BETA_EMAIL");
    const title = `v0120-locale-${Date.now()}`;

    const createResponse = await page.request.post(
      `${baseUrl()}/api/workspace/items`,
      { data: { methodId: METHOD_ID } }
    );
    expect(createResponse.status()).toBe(201);
    const createBody = (await createResponse.json()) as {
      item: { id: string };
    };
    const itemId = createBody.item.id;
    await openWorkspaceItem(page, itemId);

    await page.getByTestId("form-field-title").fill(title);
    await page.getByTestId("form-field-course").fill("Deutschkurs");
    await page.getByTestId("form-field-due_date").fill("2026-12-15");
    await page.getByTestId("form-field-word_target").fill("400");
    await page
      .getByTestId("form-field-essay_prompt")
      .fill("Schreibe einen kurzen Aufsatz über deine Stadt.");
    await page
      .getByTestId("form-field-agent_instructions")
      .fill(
        "Respond in German. Conduct all Socratic phases in German, including questions, feedback, and guidance."
      );
    await page.getByTestId("form-field-group").fill("E2E DE");
    await page.getByTestId("form-field-participants").fill(E2E_BETA_EMAIL);

    const startBtn = page
      .getByTestId("workspace-item-banner")
      .getByRole("button", { name: "Start assignment" });
    await expect(startBtn).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await startBtn.click();

    const confirm = page.getByTestId("confirm-form-submit");
    await expect(confirm).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await confirm.click();
    await expect(confirm).toBeHidden({ timeout: TIMEOUTS.pageLoad });

    if (/\/auth\/login/.test(page.url())) {
      await provision(page);
      await completeAiModeOnboardingIfOpen(page);
      await openWorkspaceItem(page, itemId);
    }

    await expect(page.getByTestId("assignment-method-details")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const openOwn = page.getByTestId("open-own-assignment");
    await expect(openOwn).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await openOwn.click();

    await waitForGermanCoach(page);

    const abandon = page.getByRole("button", { name: /^abandon$/i });
    if ((await abandon.count()) > 0 && (await abandon.isVisible())) {
      await abandon.click();
      const confirmAbandon = page.getByRole("button", {
        name: /abandon|delete|confirm/i,
      });
      if (await confirmAbandon.first().isVisible().catch(() => false)) {
        await confirmAbandon.first().click();
      }
    } else {
      test.info().annotations.push({
        type: "leftover",
        description: `method run "${title}" (${itemId}) — no abandon control`,
      });
    }
  });
});
