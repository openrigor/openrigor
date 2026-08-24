import { expect, Page, Request } from "@playwright/test";
import { TIMEOUTS } from "./auth";

/**
 * Send a chat message in a workspace canvas chat panel.
 *
 * Two product races make naive `fill + press Enter` unreliable right after a
 * kickoff stream:
 *  1. assistant-ui computes `isRunning` asynchronously; pressing Enter while
 *     it still reports running silently no-ops (keydown handler returns early,
 *     no preventDefault, no error).
 *  2. Even when the composer accepts the message (bubble renders, textarea
 *     clears), GraphContext.streamMessage can bail out before any network
 *     call — so "input cleared" proves nothing.
 *
 * Strategy: wait for the runtime to go idle (Cancel button gone), then send
 * and REQUIRE a `/runs/stream` request to fire; otherwise reset and retry.
 */
export async function sendLedgerChatMessage(
  page: Page,
  text: string,
  panelSelector = "#ledger-chat-panel"
): Promise<void> {
  const panel = page.locator(panelSelector);
  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });

  let streamFired: Promise<boolean> = Promise.resolve(false);
  const armStreamWatcher = () => {
    streamFired = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        page.off("request", onRequest);
        resolve(false);
      }, 15_000);
      const onRequest = (req: Request) => {
        if (/\/runs\/stream/.test(req.url())) {
          clearTimeout(timer);
          page.off("request", onRequest);
          resolve(true);
        }
      };
      page.on("request", onRequest);
    });
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    // Wait out any in-flight run: the Cancel affordance disappears when idle.
    const cancel = panel.getByRole("button", { name: /^cancel$/i });
    await cancel
      .waitFor({ state: "hidden", timeout: 150_000 })
      .catch(() => undefined);

    await chatInput.fill(text);
    armStreamWatcher();
    await chatInput.press("Enter");

    const cleared = await chatInput
      .evaluate((el) => (el as HTMLTextAreaElement).value === "")
      .catch(() => false);
    if (!cleared) {
      // Enter swallowed pre-acceptance — fall back to clicking Send.
      const send = panel.getByRole("button", { name: /^send$/i });
      await expect(send).toBeEnabled({ timeout: 30_000 });
      await send.click();
    }

    if (await streamFired) return;

    // Message was eaten somewhere between composer and network. Reset and
    // retry after a cool-off.
    await chatInput.fill("").catch(() => undefined);
    await page.waitForTimeout(3_000);
  }

  throw new Error(
    "Composer never produced a /runs/stream request after 4 attempts"
  );
}
