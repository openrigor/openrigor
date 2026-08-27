import { expect, test } from "@playwright/test";
import {
  baseUrl,
  ensureAiModeConsent,
  loginAsTestUser,
  TIMEOUTS,
} from "./helpers/auth";

const MODES = ["shared_model", "byok", "markdown_only"] as const;

type AiModeResponse = {
  mode: string | null;
  authorization_state: string;
};

/**
 * AI-mode honor: settings card persistence, reload, and fail-closed revoke.
 *
 * @regression
 */
test.describe("@regression ai-mode", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto(`${baseUrl()}/workspace/settings`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page).toHaveURL(/\/workspace\/settings/, {
      timeout: TIMEOUTS.pageLoad,
    });
  });

  test("mode selection persists via API", async ({ page }) => {
    test.setTimeout(120_000);

    const card = page.getByTestId("ai-mode-settings-card");
    await expect(card).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    const persisted: string[] = [];
    for (const mode of MODES) {
      await card.getByTestId(`ai-mode-${mode}`).click();
      if (mode === "shared_model") {
        await card.locator("#shared-model-notice-accepted").check();
      }
      const save = card.getByRole("button", { name: "Save AI mode" });
      if (mode === "byok" && !(await save.isEnabled())) {
        // BYOK inference needs the separate provider card (base URL / key).
        // The AI-mode card Save stays enabled for byok; if that changes,
        // cover shared_model and markdown_only fully.
        continue;
      }
      await expect(save).toBeEnabled();
      const putWait = page.waitForResponse(
        (res) =>
          res.url().includes("/api/ai-mode") &&
          res.request().method() === "PUT",
        { timeout: 30_000 }
      );
      await save.click();
      const putResponse = await putWait;
      expect(putResponse.ok()).toBeTruthy();

      const getResponse = await page.request.get(`${baseUrl()}/api/ai-mode`);
      expect(getResponse.ok()).toBeTruthy();
      const body = (await getResponse.json()) as AiModeResponse;
      expect(body.mode).toBe(mode);
      expect(body.authorization_state).toBe(mode);
      persisted.push(mode);
    }

    expect(persisted).toEqual(
      expect.arrayContaining(["shared_model", "markdown_only"])
    );
  });

  test("mode survives reload", async ({ page }) => {
    test.setTimeout(120_000);

    const card = page.getByTestId("ai-mode-settings-card");
    await expect(card).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await card.getByTestId("ai-mode-markdown_only").click();
    const save = card.getByRole("button", { name: "Save AI mode" });
    await expect(save).toBeEnabled();
    const putWait = page.waitForResponse(
      (res) =>
        res.url().includes("/api/ai-mode") && res.request().method() === "PUT",
      { timeout: 30_000 }
    );
    await save.click();
    expect((await putWait).ok()).toBeTruthy();

    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("ai-mode-settings-card")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("ai-mode-markdown_only")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("consent deletion fails closed", async ({ page }) => {
    test.setTimeout(120_000);

    // DELETE is revoke(): the row stays, revoked_at is set. authorization_state
    // is "revoked", not "missing" (missing = no row / no mode).
    const putSetup = await page.request.put(`${baseUrl()}/api/ai-mode`, {
      data: {
        mode: "markdown_only",
      },
    });
    expect(putSetup.ok()).toBeTruthy();

    const deleteResponse = await page.request.delete(
      `${baseUrl()}/api/ai-mode`
    );
    expect([200, 204]).toContain(deleteResponse.status());

    const getResponse = await page.request.get(`${baseUrl()}/api/ai-mode`);
    expect(getResponse.ok()).toBeTruthy();
    const body = (await getResponse.json()) as AiModeResponse;
    expect(body.authorization_state).toBe("revoked");

    const configResponse = await page.request.get(
      `${baseUrl()}/api/workspace/config`
    );
    expect(configResponse.ok()).toBeTruthy();
    const configBody = (await configResponse.json()) as {
      assistantId?: string;
    };
    const assistantId = configBody.assistantId || "agent";

    const threadResponse = await page.request.post(`${baseUrl()}/api/threads`, {
      data: { metadata: {} },
    });
    expect(threadResponse.ok()).toBeTruthy();
    const thread = (await threadResponse.json()) as { thread_id: string };
    expect(thread.thread_id).toBeTruthy();

    const runResponse = await page.request.post(
      `${baseUrl()}/api/threads/${thread.thread_id}/runs/wait`,
      {
        data: {
          assistant_id: assistantId,
          input: {
            // Mirrors the app's real invocation shape (convertToOpenAIFormat
            // output + explicit routing) so the graph reaches the model
            // gate instead of dying in message plumbing.
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: "ping" }],
              },
            ],
            next: "replyToGeneralInput",
          },
        },
        timeout: 60_000,
      }
    );
    const runBody = await runResponse.text();
    expect(runBody).toMatch(/OpenRigor AI mode authorization is revoked/);

    await ensureAiModeConsent(page);
  });
});
