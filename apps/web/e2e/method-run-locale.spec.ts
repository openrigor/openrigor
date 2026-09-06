import { expect, test } from "@playwright/test";
import { baseUrl, requireEnv, TIMEOUTS } from "./helpers/auth";
import {
  completeAiModeOnboardingIfOpen,
  provision,
  reset,
} from "./helpers/beta-harness";
import { sendLedgerChatMessage } from "./helpers/chat";
import { openWorkspaceItem } from "./helpers/workspace";

const METHOD_ID = "ai-assisted-essay";
const NEUTRAL_MESSAGE = "Explain this idea.";
// The German path must survive every phase of the run, we are asserting language
// provenance: >=2 DISTINCT German markers (a lone "die" can occur in English)
// AND no English markers. The English path asserts plain English markers.
const GER_MARKER_LIST = ["der", "die", "das", "und", "ich", "nicht"] as const;
const EN_MARKER_LIST = ["the", "and", "you", "can", "is"] as const;

function distinctMarkers(text: string, words: readonly string[]): number {
  return new Set(
    words.filter((w) =>
      new RegExp(`\\b${w}\\b`, "i").test(text)
    )
  ).size;
}

function isGerman(delta: string): boolean {
  return (
    distinctMarkers(delta, GER_MARKER_LIST) >= 2 &&
    distinctMarkers(delta, EN_MARKER_LIST) === 0
  );
}

function isEnglish(delta: string): boolean {
  return distinctMarkers(delta, EN_MARKER_LIST) >= 2;
}

async function createAndOpenParticipant(
  page: Parameters<typeof provision>[0],
  locale: "de" | "en"
): Promise<void> {
  const { E2E_BETA_EMAIL } = requireEnv("E2E_BETA_EMAIL");
  const title = `v0120-method-locale-${locale}-${Date.now()}`;
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
  await page.getByTestId("form-field-locale").selectOption(locale);
  await page.getByTestId("form-field-course").fill("World History");
  await page.getByTestId("form-field-due_date").fill("2026-12-15");
  await page.getByTestId("form-field-word_target").fill("400");
  await page
    .getByTestId("form-field-essay_prompt")
    .fill("Discuss how stories show courage.");
  await page
    .getByTestId("form-field-agent_instructions")
    .fill("Ask one short question at a time and provide brief feedback.");
  await page.getByTestId("form-field-group").fill("Research Group");
  await page.getByTestId("form-field-participants").fill(E2E_BETA_EMAIL);

  const startButton = page
    .getByTestId("workspace-item-banner")
    .getByRole("button", { name: "Start assignment" });
  await expect(startButton).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  await startButton.click();

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
}

async function expectNeutralReplyInLocale(
  page: Parameters<typeof provision>[0],
  validator: (delta: string) => boolean
): Promise<void> {
  const panel = page.locator("#chat-panel-main");
  await expect(panel).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  await panel
    .getByRole("button", { name: /^cancel$/i })
    .waitFor({ state: "hidden", timeout: 150_000 });
  const baseline = (await panel.innerText()).trim();

  await sendLedgerChatMessage(page, NEUTRAL_MESSAGE, "#chat-panel-main");
  await expect
    .poll(
      async () => {
        const cancel = panel.getByRole("button", { name: /^cancel$/i });
        const streaming = await cancel.isVisible().catch(() => false);
        const text = ((await panel.innerText()) ?? "").trim();
        const delta = text.slice(baseline.length);
        return !streaming && delta.length > 40 && validator(delta);
      },
      { timeout: 120_000, intervals: [2_000, 4_000, 6_000] }
    )
    .toBe(true);
}

test.describe("method-run-locale", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
    await completeAiModeOnboardingIfOpen(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("neutral English input produces a German coach reply for locale de", async ({
    page,
  }) => {
    await createAndOpenParticipant(page, "de");
    await expectNeutralReplyInLocale(page, isGerman);
  });

  test("neutral English input produces an English coach reply for locale en", async ({
    page,
  }) => {
    await createAndOpenParticipant(page, "en");
    await expectNeutralReplyInLocale(page, isEnglish);
  });
});
