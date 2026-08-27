import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { baseUrl, requireEnv, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";

type GithubRepositoriesResponse = {
  connected?: boolean;
  installationId?: number;
  repositories?: Array<{ id: number; nameWithOwner: string }>;
};

type WorkspaceItemWire = {
  id: string;
  kind: string;
  binding?: { repositoryId?: number };
  selectedMethodIds?: string[];
};

type MethodWire = {
  id: string;
  title?: string;
};

type EvidenceFieldWire = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required: boolean;
  readOnly?: boolean;
  options?: string[];
};

type EvidenceSnapshotWire = {
  threadId: string;
  fields: Record<string, EvidenceFieldWire>;
  layoutMarkdown?: string;
};

async function jsonResponse<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

async function ensureFixtureRepository(page: Page): Promise<string> {
  const { E2E_BETA_FIXTURE_REPO } = requireEnv("E2E_BETA_FIXTURE_REPO");
  const githubResponse = await page.request.get(
    `${baseUrl()}/api/workspace/github/repositories`
  );
  expect(githubResponse.status()).toBe(200);
  const github = await jsonResponse<GithubRepositoriesResponse>(githubResponse);
  expect(github.connected).toBe(true);
  expect(github.installationId).toEqual(expect.any(Number));
  const fixtureRepository = github.repositories?.find(
    (repository) => repository.nameWithOwner === E2E_BETA_FIXTURE_REPO
  );
  expect(fixtureRepository).toBeTruthy();

  const itemsResponse = await page.request.get(
    `${baseUrl()}/api/workspace/items`
  );
  expect(itemsResponse.status()).toBe(200);
  const items = await jsonResponse<{ items?: WorkspaceItemWire[] }>(
    itemsResponse
  );
  const boundRepository = items.items?.find(
    (item) =>
      item.kind === "research_repository" &&
      item.binding?.repositoryId === fixtureRepository!.id
  );
  if (boundRepository) return boundRepository.id;

  const anotherBoundRepository = items.items?.find(
    (item) => item.kind === "research_repository"
  );
  expect(
    anotherBoundRepository,
    "The beta account is bound to a different repository"
  ).toBeUndefined();

  const bindResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    {
      data: {
        kind: "research_repository",
        repositoryId: fixtureRepository!.id,
        installationId: github.installationId,
      },
    }
  );
  expect(bindResponse.status()).toBe(201);
  const bindBody = await jsonResponse<{ item?: { id?: string } }>(bindResponse);
  expect(bindBody.item?.id).toBeTruthy();
  return bindBody.item!.id!;
}

async function ensureSelectedMethod(
  page: Page,
  repositoryItemId: string
): Promise<string> {
  const methodsResponse = await page.request.get(
    `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository/methods`
  );
  expect(methodsResponse.status()).toBe(200);
  const methods = await jsonResponse<{
    methods?: MethodWire[];
    selectedMethodIds?: string[];
  }>(methodsResponse);
  const method = methods.methods?.[0];
  expect(method).toBeTruthy();
  const selectedMethodIds = [
    ...new Set([...(methods.selectedMethodIds ?? []), method!.id]),
  ];
  if (!methods.selectedMethodIds?.includes(method!.id)) {
    const selectResponse = await page.request.patch(
      `${baseUrl()}/api/workspace/items/${repositoryItemId}/repository/methods`,
      { data: { selectedMethodIds } }
    );
    expect(selectResponse.status()).toBe(200);
  }
  return method!.id;
}

async function createConcludedPrivateMethod(
  page: Page,
  repositoryItemId: string,
  methodId: string
): Promise<string> {
  const { E2E_BETA_EMAIL } = requireEnv("E2E_BETA_EMAIL");
  const createResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items`,
    { data: { methodId, repositoryItemId } }
  );
  expect(createResponse.status()).toBe(201);
  const createBody = await jsonResponse<{ item?: { id?: string } }>(
    createResponse
  );
  expect(createBody.item?.id).toBeTruthy();
  const itemId = createBody.item!.id!;

  const startResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items/${itemId}/submit`,
    {
      data: {
        values: {
          title: "Evidence declaration regression",
          course: "Regression course",
          due_date: "2026-12-15",
          word_target: 500,
          essay_prompt: "Write a short factual response.",
          group: "Regression group",
          participants: E2E_BETA_EMAIL,
        },
      },
    }
  );
  expect([200, 201]).toContain(startResponse.status());
  const startBody = await jsonResponse<{ item?: { run?: unknown } }>(
    startResponse
  );
  expect(startBody.item?.run).toBeTruthy();

  const evidenceResponse = await page.request.post(
    `${baseUrl()}/api/workspace/items/${itemId}/evidence`
  );
  expect([200, 201]).toContain(evidenceResponse.status());
  const evidenceBody = await jsonResponse<{ threadId?: string }>(
    evidenceResponse
  );
  expect(evidenceBody.threadId).toBeTruthy();
  return `${itemId}?evidence=${encodeURIComponent(evidenceBody.threadId!)}`;
}

async function seedUnrenderedRequiredFields(
  page: Page,
  itemId: string,
  threadId: string,
  snapshot: EvidenceSnapshotWire
): Promise<void> {
  // Only fields with a {{fieldId}} placeholder in the layout render as
  // inline form controls. Required editable fields without a placeholder
  // (e.g. the narrative/observations textarea) must be persisted through the
  // same draft-values endpoint the canvas itself uses, or the server rejects
  // the submission as missing a required value.
  const placeholders = new Set(
    [
      ...(snapshot.layoutMarkdown ?? "").matchAll(
        /\{\{([a-z][a-z0-9_-]*)\}\}/g
      ),
    ].map((match) => match[1])
  );
  const seed: Record<string, string> = {};
  for (const [fieldId, field] of Object.entries(snapshot.fields)) {
    if (field.readOnly || !field.required || placeholders.has(fieldId)) {
      continue;
    }
    seed[fieldId] = field.type === "number" ? "1" : "Seeded factual evidence.";
  }
  if (Object.keys(seed).length === 0) return;
  const seedResponse = await page.request.patch(
    `${baseUrl()}/api/workspace/items/${itemId}/evidence/${threadId}`,
    { data: { values: seed } }
  );
  expect(
    seedResponse.status(),
    `draft-values seed for ${Object.keys(seed).join(", ")}`
  ).toBe(200);
}

async function fillRequiredEditableFields(
  page: Page,
  snapshot: EvidenceSnapshotWire,
  confirmedValues: Record<string, string>
): Promise<void> {
  const placeholders = new Set(
    [
      ...(snapshot.layoutMarkdown ?? "").matchAll(
        /\{\{([a-z][a-z0-9_-]*)\}\}/g
      ),
    ].map((match) => match[1])
  );
  for (const [fieldId, field] of Object.entries(snapshot.fields)) {
    if (
      field.readOnly ||
      !field.required ||
      fieldId in confirmedValues ||
      fieldId === "data_sharing_limits" ||
      !placeholders.has(fieldId)
    ) {
      continue;
    }
    const control = page.getByTestId(`evidence-field-${fieldId}`);
    await expect(control, `required evidence field ${fieldId}`).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    if (field.type === "select") {
      const option = await control
        .locator("option")
        .evaluateAll((options) =>
          options
            .map((option) => (option as HTMLOptionElement).value)
            .find((value) => value.length > 0)
        );
      expect(option, `select option for ${fieldId}`).toBeTruthy();
      await control.selectOption(option!);
    } else if (field.type === "number") {
      await control.fill("1");
    } else if (field.type === "date") {
      await control.fill("2026-01-15");
    } else {
      await control.fill("Factual regression evidence.");
    }
  }
}

test.describe("@beta-release private evidence declarations", () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await provision(page);
  });

  test.afterEach(async ({ page }) => {
    await reset(page);
  });

  test("submits the selected private-repository confirmations", async ({
    page,
  }) => {
    const repositoryItemId = await ensureFixtureRepository(page);
    const methodId = await ensureSelectedMethod(page, repositoryItemId);
    const evidenceUrl = await createConcludedPrivateMethod(
      page,
      repositoryItemId,
      methodId
    );
    const [itemId, query = ""] = evidenceUrl.split("?");
    const threadId = new URLSearchParams(query).get("evidence");
    expect(threadId).toBeTruthy();

    const snapshotResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${itemId}/evidence/${threadId}`
    );
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = await jsonResponse<EvidenceSnapshotWire>(snapshotResponse);
    await seedUnrenderedRequiredFields(page, itemId, threadId!, snapshot);
    const renderedFieldDefinitions = Object.fromEntries(
      Object.entries(snapshot.fields).map(([fieldId, field]) => [
        fieldId,
        {
          label: field.label,
          type: field.type,
          required: field.required,
          readOnly: field.readOnly === true,
          options: field.options,
        },
      ])
    );
    console.log(
      "live evidence snapshot fields",
      JSON.stringify(renderedFieldDefinitions)
    );

    await page.goto(`${baseUrl()}/workspace/items/${evidenceUrl}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    const publication = page.getByTestId(
      "evidence-field-publication_authorisation"
    );
    const anonymisation = page.getByTestId(
      "evidence-field-anonymisation_status"
    );
    await expect(publication).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(anonymisation).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    expect(snapshot.fields.publication_authorisation?.options).toBeDefined();
    expect(snapshot.fields.anonymisation_status?.options).toBeDefined();
    await expect(publication.locator("option")).toHaveText([
      "Select…",
      ...(snapshot.fields.publication_authorisation?.options ?? []),
    ]);
    await expect(anonymisation.locator("option")).toHaveText([
      "Select…",
      ...(snapshot.fields.anonymisation_status?.options ?? []),
    ]);

    const confirmedPublication = await publication
      .locator("option")
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value.startsWith("confirmed-"))
      );
    const confirmedAnonymisation = await anonymisation
      .locator("option")
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value.startsWith("confirmed-"))
      );
    if (!confirmedPublication || !confirmedAnonymisation) {
      throw new Error(
        "Live evidence template has no confirmed declaration options"
      );
    }
    const confirmedValues: Record<string, string> = {
      publication_authorisation: confirmedPublication,
      anonymisation_status: confirmedAnonymisation,
    };
    await publication.selectOption(confirmedPublication);
    await anonymisation.selectOption(confirmedAnonymisation);

    const dataSharingLimits = page.getByTestId(
      "evidence-field-data_sharing_limits"
    );
    await expect(dataSharingLimits).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await dataSharingLimits.fill(
      "No student identifiers or raw student material; aggregate limits only."
    );
    await fillRequiredEditableFields(page, snapshot, confirmedValues);

    const submitRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes(`/evidence/${threadId}/submit`),
      { timeout: TIMEOUTS.pageLoad }
    );
    const submitResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/evidence/${threadId}/submit`),
      { timeout: TIMEOUTS.pageLoad }
    );
    await page.getByTestId("evidence-submit").click();
    const submitRequest = await submitRequestPromise;
    const submitResponse = await submitResponsePromise;
    const submittedValues = submitRequest.postDataJSON() as {
      values?: Record<string, unknown>;
    };
    let responseBody: unknown;
    try {
      responseBody = await submitResponse.json();
    } catch {
      responseBody = await submitResponse.text();
    }
    console.log(
      "live evidence submit request",
      JSON.stringify({ url: submitRequest.url(), body: submittedValues })
    );
    console.log(
      "live evidence submit response",
      JSON.stringify({ status: submitResponse.status(), body: responseBody })
    );
    expect(submittedValues.values).toMatchObject({
      publication_authorisation: confirmedPublication,
      anonymisation_status: confirmedAnonymisation,
      data_sharing_limits:
        "No student identifiers or raw student material; aggregate limits only.",
    });

    await expect(
      page.getByText(
        "Public authorisation must be confirmed before submission.",
        {
          exact: true,
        }
      )
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "A confirmed declaration with no student identifiers or raw student material is required.",
        { exact: true }
      )
    ).toHaveCount(0);
    expect(submitResponse.ok()).toBeTruthy();
    expect(responseBody).toMatchObject({
      status: expect.stringMatching(/^(submitted|filed)$/),
    });
  });
});
