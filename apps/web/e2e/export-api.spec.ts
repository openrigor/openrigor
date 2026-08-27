import { expect, test } from "@playwright/test";
import { baseUrl, ensureAiModeConsent, loginAsTestUser } from "./helpers/auth";

/**
 * Server-boundary export coverage (issue #25). The UI ExportButton is only
 * on repo-bound artifacts, so this suite hits the export API directly.
 *
 * @regression
 */
test.describe("@regression export-api", () => {
  test.setTimeout(120_000);

  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTestUser(page);
      await ensureAiModeConsent(page);
    });

    test("markdown export includes artifact content and AI-use disclosure", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const createResponse = await page.request.post(
        `${baseUrl()}/api/workspace/items`,
        { data: { templateId: "evaluchat-getting-started" } }
      );
      expect(createResponse.status()).toBe(201);
      const createBody = (await createResponse.json()) as {
        item: { id: string };
      };
      const itemId = createBody.item.id;
      expect(itemId).toBeTruthy();

      const exportResponse = await page.request.get(
        `${baseUrl()}/api/workspace/items/${itemId}/export?format=markdown`
      );
      expect(exportResponse.status()).toBe(200);
      const body = await exportResponse.text();
      expect(body).toContain("Welcome to OpenRigor");
      // exportAsMarkdown records disclosure in YAML provenance, not the
      // generateDisclosureAppendix heading (that heading is evidence-packet).
      expect(body).toContain('llm_mode: "shared_model"');
      expect(body).toContain('privacy_notice_version: "2026-08-25"');
    });

    test("evidence-packet export returns provenance and disclosure appendix", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const createResponse = await page.request.post(
        `${baseUrl()}/api/workspace/items`,
        { data: { methodId: "ai-assisted-essay" } }
      );
      expect(createResponse.status()).toBe(201);
      const createBody = (await createResponse.json()) as {
        item: { id: string };
      };
      const itemId = createBody.item.id;
      expect(itemId).toBeTruthy();

      const exportResponse = await page.request.get(
        `${baseUrl()}/api/workspace/items/${itemId}/export?format=evidence-packet`
      );
      expect(exportResponse.status()).toBe(200);
      const packet = (await exportResponse.json()) as Record<string, unknown>;
      const keys = Object.keys(packet);
      // Observed shape from the live export route (exportAsEvidencePacket).
      console.log("evidence-packet keys:", keys);

      expect(keys).toEqual(
        expect.arrayContaining(["artifact", "provenance", "disclosureAppendix"])
      );
      expect(typeof packet.artifact).toBe("string");
      expect(packet.provenance).toEqual(expect.any(Object));
      expect(typeof packet.disclosureAppendix).toBe("string");
      expect(packet.disclosureAppendix as string).toContain(
        "## AI-use disclosure"
      );
      expect(packet.disclosureAppendix as string).toMatch(
        /shared_model|Shared model/i
      );
    });
  });

  test.describe("unauthenticated", () => {
    test("export requires authentication", async ({ request }) => {
      test.setTimeout(120_000);

      const exportResponse = await request.get(
        `${baseUrl()}/api/workspace/items/wi_unauthenticated/export?format=markdown`
      );
      expect(exportResponse.status()).toBe(401);
    });
  });
});
