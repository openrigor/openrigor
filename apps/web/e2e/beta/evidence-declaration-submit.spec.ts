import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { baseUrl, requireEnv, TIMEOUTS } from "../helpers/auth";
import { provision, reset } from "../helpers/beta-harness";
import {
  createConcludedPrivateMethod,
  ensureFixtureRepository,
  ensureSelectedMethod,
} from "../helpers/evidence-journey";

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

async function fillRequiredEditableFields(
  page: Page,
  snapshot: EvidenceSnapshotWire,
  confirmedValues: Record<string, string>
): Promise<void> {
  for (const [fieldId, field] of Object.entries(snapshot.fields)) {
    if (
      field.readOnly ||
      !field.required ||
      fieldId in confirmedValues ||
      fieldId === "data_sharing_limits"
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
    await expect(page.getByTestId("evidence-field-observations")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
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
