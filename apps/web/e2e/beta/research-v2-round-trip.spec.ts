import { expect, test, type APIRequestContext } from "@playwright/test";
import { baseUrl, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import { ensureFixtureRepository } from "../helpers/evidence-journey";
import {
  getGithubFixtureEnv,
  skipGithubFixture,
  verifyGithubFixtureRepository,
  type GithubFixtureConfig,
} from "../helpers/github-fixture";

const GITHUB_API = "https://api.github.com";
const MANAGED_BRANCH = "openrigor/workspace";
const ARTIFACT_ID = "theory.pr5-round-trip";
const ARTIFACT_PATH = "openrigor/theory/pr5-round-trip.en.md";

function githubHeaders(fixture: GithubFixtureConfig) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${fixture.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function seedRoundTripArtifact(
  request: APIRequestContext,
  fixture: GithubFixtureConfig,
  content: string
): Promise<void> {
  const headers = githubHeaders(fixture);
  const artifactUrl = `${GITHUB_API}/repos/${encodeURIComponent(
    fixture.owner
  )}/${encodeURIComponent(fixture.repository)}/contents/${ARTIFACT_PATH}`;
  const existing = await request.get(
    `${artifactUrl}?ref=${encodeURIComponent(MANAGED_BRANCH)}`,
    { headers }
  );
  let sha: string | undefined;
  if (existing.status() === 200) {
    const body = (await existing.json()) as { sha?: unknown };
    if (typeof body.sha !== "string") {
      throw new Error("Fixture artifact response did not include its blob SHA");
    }
    sha = body.sha;
  } else if (existing.status() !== 404) {
    throw new Error(
      `Fixture artifact lookup failed with HTTP ${existing.status()}`
    );
  }

  const response = await request.put(artifactUrl, {
    headers,
    data: {
      message: "test: seed PR5 v2 round-trip artifact",
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: MANAGED_BRANCH,
      ...(sha ? { sha } : {}),
    },
  });
  expect([200, 201]).toContain(response.status());
}

async function readRoundTripArtifact(
  request: APIRequestContext,
  fixture: GithubFixtureConfig
): Promise<string> {
  const response = await request.get(
    `${GITHUB_API}/repos/${encodeURIComponent(
      fixture.owner
    )}/${encodeURIComponent(fixture.repository)}/contents/${ARTIFACT_PATH}?ref=${encodeURIComponent(
      MANAGED_BRANCH
    )}`,
    { headers: githubHeaders(fixture) }
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { path?: unknown; content?: unknown };
  expect(body.path).toBe(ARTIFACT_PATH);
  expect(typeof body.content).toBe("string");
  return Buffer.from(
    (body.content as string).replace(/\s/g, ""),
    "base64"
  ).toString("utf8");
}

test.describe("@beta-release designated-directory v2 round trip", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("binds a v2 workspace item, commits under openrigor/, and re-reads it", async ({
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
    const itemBody = (await itemResponse.json()) as {
      item?: {
        kind?: string;
        binding?: { layoutVersion?: string; repositoryFullName?: string };
      };
    };
    expect(itemBody.item).toMatchObject({
      kind: "research_repository",
      binding: {
        layoutVersion: "2.0",
        repositoryFullName: fixtureEnv.config.nameWithOwner,
      },
    });

    const initialContent = `# PR5 v2 round trip\n\nSeeded at ${Date.now()}\n`;
    await seedRoundTripArtifact(request, fixtureEnv.config, initialContent);

    await page.goto(
      `${baseUrl()}/workspace/settings/repositories/${repositoryItemId}?artifactId=${encodeURIComponent(ARTIFACT_ID)}`,
      { waitUntil: "domcontentloaded", timeout: TIMEOUTS.pageLoad }
    );
    const editor = page.getByLabel(`Edit ${ARTIFACT_PATH}`);
    await expect(editor).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(editor).toHaveValue(initialContent);

    const editedContent = `${initialContent}\nEdited through the PR5 repository editor.\n`;
    await editor.fill(editedContent);
    const commitResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/workspace/items/${repositoryItemId}/repository/commit`
          ) && response.request().method() === "POST",
      { timeout: TIMEOUTS.pageLoad }
    );
    await page
      .getByRole("button", { name: "Commit changes", exact: true })
      .click();
    const commitResponse = await commitResponsePromise;
    expect(commitResponse.status()).toBe(200);
    const commitBody = (await commitResponse.json()) as {
      commitSha?: string;
      provenance?: { path?: string; revision?: string };
    };
    expect(commitBody.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(commitBody.provenance).toEqual({
      path: ARTIFACT_PATH,
      revision: commitBody.commitSha,
      repository: fixtureEnv.config.nameWithOwner,
      branch: MANAGED_BRANCH,
    });
    await expect(page.getByText("Changes committed")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const statusResponse = await request.get(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository`
    );
    expect(statusResponse.status()).toBe(200);
    expect((await statusResponse.json()).status).toMatchObject({
      state: "ready",
      layoutVersion: "2.0",
      headCommitSha: commitBody.commitSha,
    });
    await expect(
      readRoundTripArtifact(request, fixtureEnv.config)
    ).resolves.toBe(editedContent);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(editor).toHaveValue(editedContent, {
      timeout: TIMEOUTS.pageLoad,
    });
  });
});
