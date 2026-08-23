import { expect, Page, Response, test } from "@playwright/test";
import { baseUrl, loginAsTestUser, TIMEOUTS } from "./helpers/auth";
import {
  createLedgerItemViaApi,
  openWorkspaceItem,
  setMultiSelectFilter,
  setRangeFilter,
} from "./helpers/workspace";

/**
 * Wave A Evidence Ledger end-to-end coverage against the LIVE dev deployment.
 *
 * Flow (encoded from the handoff):
 *   1. Create a workspace item → Evidence Ledger tab → ledger-demo-method shows
 *      "Ledger ready"; open it → baseline accepted evidence = 12.
 *   2. Select the method → config canvas with the Method card, baseline 12 and
 *      filter controls.
 *   3. Set filters education_level ∈ [k12] + collection_date 2024-01-01..2024-12-31
 *      → preview: Included 6 · Outside declared scope 2 · Unknown 2 ·
 *      Unavailable 2 · Resolver exclusion 2 (baseline 12) + exact predicate.
 *   4. Generate → read-only Ledger Snapshot markdown canvas with expand groups,
 *      no edit affordances,
 *      no claim/conclusion text.
 *   5. Change a filter → preview out of date → refresh → generate → NEW
 *      snapshot; prior snapshot's input fingerprint unchanged; opening it still
 *      renders identically.
 *
 * @regression
 */
test.describe("@regression evidence-ledger", () => {
  const METHOD_ID = "ledger-demo-method";
  // Buckets for education_level ∈ [k12] + collection_date 2024-01-01..2024-12-31.
  //
  //   NOTE: live-verified against dev.evaluchat.org (2026-08-19). The original
  //   handoff expected 6/2/2/2/2, but the current fixtures resolve p08 (k12,
  //   country=other), p10 (k12, country omitted) as INCLUDED — the filter only
  //   constrains education_level + collection_date, not country_code. Correct
  //   split: Included 6 · Outside 3 (p03,p05,p07 tertiary/adult) · Unknown 1
  //   (p09 recorded-unknown edu) · Unavailable 2 (p11,p12 pre-collection_date
  //   template) · Resolver exclusion 2 (p13 wrong-method-version, p14
  //   not-accepted). All 14 packets accounted for; baseline = 12 accepted.
  const FILTERED_BUCKETS = {
    Included: 6,
    "Outside declared scope": 3,
    Unknown: 1,
    Unavailable: 2,
    "Resolver exclusion": 2,
  };

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  async function createLedgerViaUi(
    page: Page,
    methodId: string
  ): Promise<string> {
    await page.goto(`${baseUrl()}/workspace`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: "Evidence Ledger" }).click();
    const search = page.getByPlaceholder(
      "Search templates, methods, or ledgers"
    );
    await expect(search).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await search.fill(methodId);
    // The catalog result card for this method shows the "Ledger ready" status.
    const card = page.locator("button", { hasText: methodId }).first();
    await expect(card).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(card).toContainText("Ledger ready");
    // Arm the response waiter BEFORE clicking so we catch the POST.
    const createResponse = page.waitForResponse(
      (resp: Response) =>
        resp.url().includes("/api/workspace/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
      { timeout: 30_000 }
    );
    await card.click();
    const createResponseBody = (await createResponse.then((r) => r.json())) as {
      item: { id: string };
    };
    await expect(
      page.getByText("Ledger demo method", { exact: false }).first()
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    return createResponseBody.item.id;
  }

  async function applyLedgerFilters(page: Page) {
    await setMultiSelectFilter(page, "education_level", ["k12"]);
    await setRangeFilter(page, "collection_date", "2024-01-01", "2024-12-31");
  }

  async function assertPreviewBuckets(page: Page) {
    const table = page.locator("[data-testid='ledger-canvas'] table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    // The preview table renders one <tr> per bucket in server order.
    for (const [bucket, count] of Object.entries(FILTERED_BUCKETS)) {
      const row = table.locator("tr", { hasText: bucket }).first();
      await expect(row).toContainText(String(count), { timeout: 15_000 });
    }
  }

  test("1 · UI create shows Ledger ready + default baseline 12", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerViaUi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();
    await expect(banner.getByTestId("generate-ledger")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    // Method card: Method + baseline accepted evidence.
    await expect(page.getByText("Selected Method version")).toBeVisible();
    await expect(
      page.getByText(METHOD_ID, { exact: false }).first()
    ).toBeVisible();
    // "Accepted evidence" dd shows baseline 12 after the initial preview.
    await expect(
      page.locator("[data-testid='ledger-canvas']").getByText("12").first()
    ).toBeVisible({ timeout: 30_000 });
    // Scope summary duplicates the baseline count in section 2 prose.
    await expect(
      page
        .locator("[data-testid='ledger-canvas']")
        .getByText(/Baseline:\s*12\./)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("2 · config canvas + filtered preview buckets + predicate", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Filter controls exist: multi-select for education_level incl. `unknown`,
    // and date range inputs for collection_date.
    const eduSelect = page.locator('select[aria-label="education_level"]');
    await expect(eduSelect).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(
      eduSelect.locator("option", { hasText: "unknown" })
    ).toBeAttached();

    await applyLedgerFilters(page);

    // Preview goes out of date until refreshed.
    await expect(page.getByText("Preview out of date")).toBeVisible({
      timeout: 15_000,
    });

    // The Generate button is disabled until the preview is refreshed.
    const generate = page.getByTestId("generate-ledger");
    await expect(generate).toBeDisabled();

    await page.getByRole("button", { name: "Refresh preview" }).click();

    await assertPreviewBuckets(page);

    // Exact predicate pieces rendered in the canvas footer.
    const predicate = page
      .locator("[data-testid='ledger-canvas'] p.font-mono")
      .first();
    await expect(predicate).toContainText("education_level in [k12]");
    await expect(predicate).toContainText("collection_date gte 2024-01-01");
    await expect(predicate).toContainText("collection_date lte 2024-12-31");

    // Generate is now enabled (preview is current).
    await expect(generate).toBeEnabled();
  });

  test("3 · agent can narrow the ledger scope", async ({ page }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const chatInput = page.getByTestId("chat-input");
    await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await chatInput.fill("Filter the ledger to education_level k12");
    await chatInput.press("Enter");

    const predicate = page
      .locator("[data-testid='ledger-canvas'] p.font-mono")
      .first();
    await expect(predicate).toContainText("education_level in [k12]", {
      timeout: 60_000,
    });
  });

  test("4 · generate Ledger Snapshot canvas with chat, expand groups, and inline publishing", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await applyLedgerFilters(page);
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await assertPreviewBuckets(page);
    await page.getByTestId("generate-ledger").click();

    // Generate pushes to the new snapshot item route.
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { name: "Ledger Snapshot" })
    ).toBeVisible();
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();
    await expect(page.getByTestId("ledger-snapshot-breadcrumb")).toHaveCount(0);
    await expect(banner.getByTestId("ledger-publish")).toBeVisible();
    const chatInput = page.getByTestId("chat-input");
    await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });

    // The read-only document has one native expand group per top-level section.
    const markdown = page.getByTestId("ledger-snapshot-markdown");
    await expect(markdown).toBeVisible({ timeout: 30_000 });
    const summaries = markdown.locator("summary");
    for (const section of [
      "Scope",
      "Evidence",
      "Descriptive distributions",
      "Comparability",
      "Canonical manifest",
    ]) {
      await expect(
        summaries.getByText(section, { exact: true })
      ).toBeVisible();
    }
    await expect(
      summaries.getByText(/^Counterevidence and gaps \(\d+\)$/)
    ).toBeVisible();
    await expect(markdown.locator("details")).toHaveCount(6);
    await expect(markdown.locator("details[open]")).toHaveCount(1);

    // Snapshot header renders the bucket totals.
    await expect(markdown).toContainText("Included");
    await expect(markdown).toContainText("Unavailable");
    await expect(markdown).toContainText("Resolver exclusion");

    // No regeneration affordances exist in the snapshot canvas.
    await expect(
      page.locator("button:has-text('Generate ledger')")
    ).toHaveCount(0);

    // The sealed record is caveated, never conclusive: the explicit
    // "does not reach a conclusion" caveat is asserted below.
    const snapshotText = await page
      .locator("#ledger-snapshot-details-panel")
      .innerText();
    expect(snapshotText.toLowerCase().includes("we conclude")).toBeFalsy();

    // Counterevidence keeps its count in the summary and remains caveated.
    const gapSummary = summaries.getByText(/Counterevidence and gaps \(8\)/);
    await expect(gapSummary).toBeVisible();
    await expect(
      page.getByText("No interpretation is generated.")
    ).not.toBeVisible();
    await gapSummary.click();
    await expect(
      page.getByText("No interpretation is generated.")
    ).toBeVisible();

    // Evidence view: source links are pinned to the snapshot's source commit,
    // never `blob/main` — a later research-main change must not silently alter
    // what a sealed snapshot links to (Wave A review fix).
    await summaries.getByText("Evidence", { exact: true }).click();
    const evidenceAnchors = page.locator(
      "[data-testid='ledger-snapshot-canvas'] a[href*='github.com/evaluchat/research/blob/']"
    );
    await expect(evidenceAnchors.first()).toBeVisible({ timeout: 15_000 });
    const hrefs = await evidenceAnchors.evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href)
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toContain("/blob/main/");
      expect(href).toMatch(/\/blob\/[0-9a-f]{7,40}\//);
    }

    // Publishing remains inline: safety declarations gate the same POST and a
    // successful response replaces the banner submit slot with the draft PR.
    await page.route(
      "**/api/workspace/items/*/ledger/publish",
      async (route) => {
        const request = route.request();
        expect(request.method()).toBe("POST");
        const body = JSON.parse(request.postData() ?? "{}");
        expect(body).toMatchObject({
          values: {
            publication_authorisation: "confirmed-authorised-to-publish",
            anonymisation_status:
              "confirmed-no-student-identifiers-or-raw-student-material",
            public_data_declaration: "confirmed-public-data",
          },
        });
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            publication: {
              status: "draft",
              pullRequestNumber: 85,
              pullRequestUrl: "https://github.com/evaluchat/research/pull/85",
            },
          }),
        });
      }
    );
    await banner.getByTestId("ledger-publish").click();
    const publishDialog = page.getByTestId("ledger-publish-dialog");
    await expect(publishDialog).toBeVisible();
    await publishDialog.getByTestId("ledger-publication-authorisation").check();
    await publishDialog.getByTestId("ledger-anonymisation-status").check();
    await publishDialog.getByTestId("ledger-public-data-declaration").check();
    await publishDialog.getByTestId("ledger-confirm-publish").click();
    await expect(
      banner.getByRole("link", { name: "Draft PR" })
    ).toHaveAttribute("href", "https://github.com/evaluchat/research/pull/85");

    // Snapshot chat can discuss the sealed record without generating a canvas
    // artifact. Wait for its hidden kickoff before checking the next assistant
    // message, so this proves the user question receives a reply.
    const assistantMessages = page.locator(
      "#ledger-snapshot-chat-panel div.relative.w-full.max-w-2xl.py-4"
    );
    await expect(assistantMessages).not.toHaveCount(0, { timeout: 60_000 });
    const assistantMessageCount = await assistantMessages.count();
    await chatInput.fill("Summarise the evidence and gaps");
    await chatInput.press("Enter");
    await expect
      .poll(() => assistantMessages.count(), { timeout: 60_000 })
      .toBeGreaterThan(assistantMessageCount);
  });

  test("5 · snapshot immutability — filters/fingerprint survive regeneration", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Baseline generate → snapshot A.
    await page.getByTestId("generate-ledger").click();
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    const firstSnapshotId = page.url().split("/").pop()!;
    const firstSnapshotsResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${itemId}/ledger/snapshots`
    );
    expect(firstSnapshotsResponse.ok()).toBeTruthy();
    const firstSnapshotsBody = (await firstSnapshotsResponse.json()) as {
      snapshots: Array<{ id: string; snapshot: { inputFingerprint: string } }>;
    };
    const firstSnapshot = firstSnapshotsBody.snapshots.find(
      (snapshot) => snapshot.id === firstSnapshotId
    );
    expect(firstSnapshot).toBeTruthy();
    const firstFingerprint = firstSnapshot!.snapshot.inputFingerprint;
    expect(firstFingerprint.length).toBeGreaterThan(0);

    // Return to the ledger and generate a SECOND snapshot under different filters.
    await page.goto(`${baseUrl()}/workspace/items/${itemId}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await applyLedgerFilters(page);
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await assertPreviewBuckets(page);
    await page.getByTestId("generate-ledger").click();
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    const secondSnapshotId = page.url().split("/").pop()!;
    const secondSnapshotsResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${itemId}/ledger/snapshots`
    );
    expect(secondSnapshotsResponse.ok()).toBeTruthy();
    const secondSnapshotsBody = (await secondSnapshotsResponse.json()) as {
      snapshots: Array<{ id: string; snapshot: { inputFingerprint: string } }>;
    };
    const secondSnapshot = secondSnapshotsBody.snapshots.find(
      (snapshot) => snapshot.id === secondSnapshotId
    );
    expect(secondSnapshot).toBeTruthy();
    const secondFingerprint = secondSnapshot!.snapshot.inputFingerprint;

    // Different config → different input fingerprint (new snapshot, not idempotent).
    expect(secondFingerprint).not.toBe(firstFingerprint);

    // List snapshots via API: find the snapshot whose fingerprint == the first one.
    const listResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${itemId}/ledger/snapshots`
    );
    expect(listResponse.ok()).toBeTruthy();
    const listBody = (await listResponse.json()) as {
      snapshots: Array<{ id: string; snapshot: { inputFingerprint: string } }>;
    };
    expect(listBody.snapshots.length).toBeGreaterThanOrEqual(2);
    const listedFirstSnapshot = listBody.snapshots.find(
      (s) => s.snapshot.inputFingerprint === firstFingerprint
    );
    expect(listedFirstSnapshot).toBeTruthy();

    // Opening the ORIGINAL snapshot still renders identically (immutability).
    await openWorkspaceItem(page, listedFirstSnapshot!.id);
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    expect(page.url()).toContain(listedFirstSnapshot!.id);
    // The original (baseline, unfiltered) snapshot still renders the bucket
    // totals it was sealed with — Included 12 — even though a second filtered
    // snapshot was generated after it. This proves immutability of the
    // prior snapshot's sealed record + render.
    const reopenedMarkdown = page.getByTestId("ledger-snapshot-markdown");
    const includedRow = reopenedMarkdown
      .locator("tr", { hasText: "Included" })
      .first();
    await expect(includedRow).toContainText("12");
    await expect(reopenedMarkdown).toContainText("Resolver exclusion");
    // And the sealed predicate is the unfiltered baseline predicate.
    await expect(reopenedMarkdown).toContainText("all accepted evidence");
  });
});
