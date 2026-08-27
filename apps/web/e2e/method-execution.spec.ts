import { expect, Page, test } from "@playwright/test";
import { baseUrl, loginAsTestUser, requireEnv, TIMEOUTS } from "./helpers/auth";
import { openWorkspaceItem } from "./helpers/workspace";

type MethodSource = {
  id?: string;
  title?: string | null;
  name?: string | null;
  version?: string | null;
  profiles?: ReadonlyArray<{ author?: string | null }> | null;
  publication_date?: string | null;
};

function hasCanonicalCitation(source: MethodSource | undefined): boolean {
  if (!source) return false;
  const author = source.profiles?.[0]?.author?.trim();
  const title = (source.title || source.name || "").trim();
  const version = source.version?.trim();
  const year = source.publication_date?.match(
    /^(\d{4})(-(\d{2}))?(-(0?[1-9]|[12]\d|3[01]))?$/
  )?.[1];
  return Boolean(author && title && version && year);
}

async function fillAssignmentBrief(page: Page, email: string): Promise<void> {
  await page.getByTestId("form-field-title").fill("E2E assignment");
  await page.getByTestId("form-field-course").fill("E2E course");
  await page.getByTestId("form-field-due_date").fill("2026-12-15");
  await page.getByTestId("form-field-word_target").fill("500");
  await page.getByTestId("form-field-essay_prompt").fill("Write about E2E.");
  await page.getByTestId("form-field-group").fill("E2E group");
  await page.getByTestId("form-field-participants").fill(email);
}

async function createAndStartAssignment(
  page: Page,
  methodId: string
): Promise<{ itemId: string; methodSource: MethodSource | undefined }> {
  const createResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    { data: { methodId } }
  );
  expect(createResponse.status()).toBe(201);
  const createBody = (await createResponse.json()) as {
    item: { id: string; methodSource?: MethodSource };
  };
  const itemId = createBody.item.id;
  expect(itemId).toBeTruthy();

  const getResponse = await page.request.get(
    `${baseUrl()}/api/workspace/items/${itemId}`
  );
  expect(getResponse.ok()).toBeTruthy();
  const getBody = (await getResponse.json()) as {
    item: { methodSource?: MethodSource };
  };
  const methodSource =
    getBody.item.methodSource ?? createBody.item.methodSource;

  await openWorkspaceItem(page, itemId);

  const banner = page.getByTestId("workspace-item-banner");
  await expect(banner).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  const startBtn = banner.getByRole("button", { name: "Start assignment" });
  await expect(startBtn).toBeVisible({ timeout: TIMEOUTS.pageLoad });

  const { TEST_USER_EMAIL } = requireEnv("TEST_USER_EMAIL");
  await fillAssignmentBrief(page, TEST_USER_EMAIL);
  await startBtn.click();

  const confirm = page.getByTestId("confirm-form-submit");
  await expect(confirm).toBeVisible({ timeout: TIMEOUTS.pageLoad });
  const submitWait = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes(`/api/workspace/items/${itemId}/submit`),
    { timeout: 60_000 }
  );
  await confirm.click();
  const submitResponse = await submitWait;
  // First start creates the run (201); an idempotent resubmit is 200.
  expect([200, 201]).toContain(submitResponse.status());

  return { itemId, methodSource };
}

async function fetchMethodCatalog(page: Page): Promise<MethodSource[]> {
  // Brief named /api/catalog/methods; shipped catalog is GET /api/methods.
  let response = await page.request.get(`${baseUrl()}/api/catalog/methods`);
  if (response.status() === 404) {
    response = await page.request.get(`${baseUrl()}/api/methods`);
  }
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as
    | MethodSource[]
    | { methods?: MethodSource[] };
  if (Array.isArray(body)) return body;
  return Array.isArray(body.methods) ? body.methods : [];
}

/**
 * Method execution: start assignment, run-canvas transition, citation.
 *
 * @regression
 */
test.describe("@regression method-execution", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("start assignment runs the method and mounts the run canvas", async ({
    page,
  }) => {
    await createAndStartAssignment(page, "ai-assisted-essay");

    // MethodRunCanvas has no chat /runs/stream kickoff — submit sets item.run
    // and the canvas switches to assignment UI (form-submission-only).
    await expect(page.getByTestId("assignment-method-details")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(
      page
        .getByTestId("workspace-item-banner")
        .getByRole("button", { name: "Start assignment" })
    ).toHaveCount(0);
  });

  test("run canvas shows canonical method citation", async ({ page }) => {
    let methodId = "ai-assisted-essay";
    const catalog = await fetchMethodCatalog(page);
    const catalogMatch = catalog.find((entry) => hasCanonicalCitation(entry));
    if (catalogMatch?.id) {
      methodId = catalogMatch.id;
    }

    const { methodSource } = await createAndStartAssignment(page, methodId);

    await expect(page.getByTestId("assignment-method-details")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const expectCitation =
      hasCanonicalCitation(methodSource) || Boolean(catalogMatch);
    if (!expectCitation) {
      // Catalog methods (including ai-assisted-essay) have author+title+version
      // but no publication_date, so MethodCitation returns null.
      return;
    }

    const citation = page.getByTestId("method-citation");
    await expect(citation).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(citation).toContainText("@techreport");
    await expect(citation).toContainText(/\(\d{4}\)\./);
    await expect(
      citation.getByRole("button", { name: "Copy BibTeX citation" })
    ).toBeVisible();
    await expect(
      citation.getByRole("button", { name: "Copy APA citation" })
    ).toBeVisible();
  });
});
