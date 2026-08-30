import { expect, test } from "@playwright/test";
import { baseUrl, requireEnv } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  createConcludedPrivateMethod,
  ensureSelectedMethod,
} from "../helpers/evidence-journey";
import {
  getGithubFixtureEnv,
  skipGithubFixture,
  verifyGithubFixtureRepository,
} from "../helpers/github-fixture";

type RepositoryArtifact = {
  artifactId: string;
  path: string;
  commitSha?: string;
  supported?: boolean;
};

type EvidenceField = {
  type?: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
};

function submissionValues(
  fields: Record<string, EvidenceField>
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [fieldId, field] of Object.entries(fields)) {
    if (!field.required || field.readOnly) continue;
    if (
      fieldId === "publication_authorisation" ||
      fieldId === "anonymisation_status"
    ) {
      const confirmed = field.options?.find((option) =>
        option.startsWith("confirmed-")
      );
      if (!confirmed) {
        throw new Error(
          `Legacy fixture has no confirmed declaration option for ${fieldId}`
        );
      }
      values[fieldId] = confirmed;
    } else if (fieldId === "data_sharing_limits") {
      values[fieldId] =
        "No student identifiers or raw student material; aggregate limits only.";
    } else if (field.type === "select") {
      const option = field.options?.find((value) => value.length > 0);
      if (!option) {
        throw new Error(`Legacy fixture has no option for ${fieldId}`);
      }
      values[fieldId] = option;
    } else if (field.type === "number") {
      values[fieldId] = "1";
    } else if (field.type === "date") {
      values[fieldId] = "2026-01-15";
    } else {
      values[fieldId] = "Legacy read-only regression evidence.";
    }
  }
  return values;
}

test.describe("@beta-release legacy v1 read-only repository", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("reads root-level content byte-for-byte and rejects commit, seal, and write-back", async ({
    page,
  }) => {
    const { E2E_BETA_LEGACY_REPOSITORY_ITEM_ID } = requireEnv(
      "E2E_BETA_LEGACY_REPOSITORY_ITEM_ID"
    );
    const request = page.context().request;
    const itemUrl = `${baseUrl()}/api/workspace/items/${E2E_BETA_LEGACY_REPOSITORY_ITEM_ID}`;
    const repositoryUrl = `${itemUrl}/repository`;

    const itemResponse = await request.get(itemUrl);
    expect(itemResponse.status()).toBe(200);
    const itemBody = (await itemResponse.json()) as {
      item?: {
        kind?: string;
        binding?: { layoutVersion?: string; branch?: string };
      };
    };
    if (itemBody.item?.binding?.layoutVersion === "2.0") {
      // The legacy v1 fixture shares the single fixture repository with the
      // v2 round-trip spec. Once that spec has migrated the binding to 2.0
      // (a one-way, by-design operation), the v1 read-only proof was already
      // captured earlier in the sequence — skip rather than fail.
      test.skip(true, "Fixture item is no longer layout 1.0 (migrated to 2.0 by the round-trip spec); v1 read-only proof requires a pre-migration run.");
      return;
    }
    expect(itemBody.item).toMatchObject({
      kind: "research_repository",
      binding: { layoutVersion: "1.0" },
    });

    const statusResponse = await request.get(repositoryUrl);
    expect(statusResponse.status()).toBe(200);
    expect((await statusResponse.json()).status).toMatchObject({
      state: "read_only",
      reason: "unsupported_layout_major",
      layoutVersion: "1.0",
    });

    const artifactsResponse = await request.get(`${repositoryUrl}/artifacts`);
    expect(artifactsResponse.status()).toBe(200);
    const artifactsBody = (await artifactsResponse.json()) as {
      artifacts?: RepositoryArtifact[];
      headCommitSha?: string;
    };
    expect(artifactsBody.headCommitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(artifactsBody.artifacts?.length).toBeGreaterThan(0);
    expect(
      artifactsBody.artifacts?.every((artifact) =>
        artifact.path.startsWith("openrigor/")
      )
    ).toBe(false);
    const index = artifactsBody.artifacts?.find(
      (artifact) =>
        artifact.artifactId === "index" && artifact.path === "index.md"
    );
    expect(index).toBeTruthy();

    const artifactUrl = `${repositoryUrl}/artifacts?artifactId=${encodeURIComponent(index!.artifactId)}`;
    const firstRead = await request.get(artifactUrl);
    const secondRead = await request.get(artifactUrl);
    expect(firstRead.status()).toBe(200);
    expect(secondRead.status()).toBe(200);
    const firstBody = (await firstRead.json()) as {
      artifact?: RepositoryArtifact;
      content?: string;
    };
    const secondBody = (await secondRead.json()) as {
      artifact?: RepositoryArtifact;
      content?: string;
    };
    expect(firstBody).toEqual(secondBody);
    expect(firstBody.artifact).toMatchObject({
      artifactId: "index",
      path: "index.md",
      supported: true,
    });
    expect(firstBody.artifact?.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof firstBody.content).toBe("string");

    // Byte-for-byte fidelity needs an external source of truth: compare the
    // served content against the raw GitHub blob for the same path/revision.
    const fixtureEnv = getGithubFixtureEnv();
    if (!fixtureEnv.available) {
      skipGithubFixture(fixtureEnv.reason);
    }
    const fixtureCheck = await verifyGithubFixtureRepository(fixtureEnv.config);
    if (!fixtureCheck.exists || fixtureCheck.skipReason) {
      skipGithubFixture(
        fixtureCheck.skipReason ?? "The GitHub fixture repository is unavailable"
      );
    }
    const ghHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${fixtureEnv.config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const legacyBranch = itemBody.item?.binding?.branch ?? "main";
    const ghResponse = await request.get(
      `https://api.github.com/repos/${fixtureEnv.config.owner}/${fixtureEnv.config.repository}/contents/index.md?ref=${encodeURIComponent(legacyBranch)}`,
      { headers: ghHeaders }
    );
    expect(ghResponse.status()).toBe(200);
    const ghBody = (await ghResponse.json()) as { content?: string };
    expect(typeof ghBody.content).toBe("string");
    expect(firstBody.content).toBe(
      Buffer.from(
        (ghBody.content as string).replace(/\s/g, ""),
        "base64"
      ).toString("utf8")
    );

    const commitResponse = await request.post(`${repositoryUrl}/commit`, {
      data: {
        artifactId: index!.artifactId,
        baseCommitSha: firstBody.artifact!.commitSha,
        content: `${firstBody.content}\nThis write must be rejected.\n`,
        commitMessage: "Attempt legacy write",
        idempotencyKey: `legacy-v1-${Date.now()}`,
      },
    });
    expect(commitResponse.status()).toBe(403);
    expect(await commitResponse.json()).toMatchObject({
      error: "REPOSITORY_READ_ONLY",
      message: expect.stringMatching(
        /previous layout; it is readable but no longer writable/i
      ),
    });

    const sealResponse = await request.post(`${repositoryUrl}/seal`, {
      data: { action: "preview" },
    });
    expect(sealResponse.status()).toBe(403);
    expect(await sealResponse.json()).toMatchObject({
      error: "REPOSITORY_READ_ONLY",
      message: expect.stringMatching(
        /previous layout; it is readable but no longer writable/i
      ),
    });

    const methodId = await ensureSelectedMethod(
      page,
      E2E_BETA_LEGACY_REPOSITORY_ITEM_ID
    );
    const evidenceUrl = await createConcludedPrivateMethod(
      page,
      E2E_BETA_LEGACY_REPOSITORY_ITEM_ID,
      methodId
    );
    const [methodItemId, query = ""] = evidenceUrl.split("?");
    const threadId = new URLSearchParams(query).get("evidence");
    expect(threadId).toBeTruthy();

    const snapshotResponse = await request.get(
      `${baseUrl()}/api/workspace/items/${methodItemId}/evidence/${threadId}`
    );
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = (await snapshotResponse.json()) as {
      fields?: Record<string, EvidenceField>;
    };
    expect(snapshot.fields).toBeTruthy();
    const writeBackResponse = await request.post(
      `${baseUrl()}/api/workspace/items/${methodItemId}/evidence/${threadId}/submit`,
      { data: { values: submissionValues(snapshot.fields!) } }
    );
    expect(writeBackResponse.status()).toBe(403);
    expect(await writeBackResponse.json()).toMatchObject({
      error: "REPOSITORY_READ_ONLY",
      message: expect.stringMatching(
        /previous layout; it is readable but no longer writable/i
      ),
    });
  });
});
