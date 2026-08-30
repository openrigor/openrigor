import { expect, test } from "@playwright/test";
import {
  baseUrl,
  ensureAiModeConsent,
  loginAsTestUser,
  TIMEOUTS,
} from "./helpers/auth";
import { provision, reset } from "./helpers/beta-harness";
import { ensureFixtureRepository } from "./helpers/evidence-journey";
import {
  getGithubFixtureEnv,
  skipGithubFixture,
  verifyGithubFixtureRepository,
} from "./helpers/github-fixture";

const GITHUB_API = "https://api.github.com";
const V2_BRANCH = "openrigor/workspace";
const V2_CITATION_PATH = "openrigor/CITATION.cff";

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
      const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.[1]).toContain('llm_mode: "shared_model"');
      expect(frontmatter?.[1]).toContain(
        'privacy_notice_version: "2026-08-25"'
      );
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

test.describe("@beta-release @regression v2 citation export", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("exports a citation from the v2 designated directory", async ({
    page,
  }) => {
    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) skipGithubFixture(fixtureEnv.reason);
    const fixtureCheck = await verifyGithubFixtureRepository(fixtureEnv.config);
    if (!fixtureCheck.exists || fixtureCheck.skipReason) {
      skipGithubFixture(
        fixtureCheck.skipReason ??
          "The GitHub fixture repository is unavailable"
      );
    }

    const request = page.context().request;
    const repositoryItemId = await ensureFixtureRepository(page);
    const itemResponse = await request.get(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}`
    );
    expect(itemResponse.status()).toBe(200);
    expect((await itemResponse.json()).item).toMatchObject({
      kind: "research_repository",
      binding: { layoutVersion: "2.0" },
    });

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${fixtureEnv.config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const citationUrl = `${GITHUB_API}/repos/${encodeURIComponent(
      fixtureEnv.config.owner
    )}/${encodeURIComponent(fixtureEnv.config.repository)}/contents/${V2_CITATION_PATH}`;
    const existing = await request.get(
      `${citationUrl}?ref=${encodeURIComponent(V2_BRANCH)}`,
      { headers }
    );
    let sha: string | undefined;
    if (existing.status() === 200) {
      sha = ((await existing.json()) as { sha: string }).sha;
    } else {
      expect(existing.status()).toBe(404);
    }
    const citation = "cff-version: 1.2.0\ntitle: PR5 citation regression\n";
    const write = await request.put(citationUrl, {
      headers,
      data: {
        message: "test: seed PR5 v2 citation",
        content: Buffer.from(citation, "utf8").toString("base64"),
        branch: V2_BRANCH,
        ...(sha ? { sha } : {}),
      },
    });
    expect([200, 201]).toContain(write.status());

    const exportResponse = await request.get(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/export?artifactId=citation&format=markdown`,
      { timeout: TIMEOUTS.pageLoad }
    );
    expect(exportResponse.status()).toBe(200);
    const body = await exportResponse.text();
    expect(body).toContain(citation);
    expect(body).toContain(`repository: "${fixtureEnv.config.nameWithOwner}"`);
    expect(body).toContain(`branch: "${V2_BRANCH}"`);
    expect(body).toMatch(/commit_sha: "[a-f0-9]{40}"/);
  });
});
