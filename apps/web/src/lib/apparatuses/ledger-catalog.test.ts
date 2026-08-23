import { describe, expect, it } from "vitest";
import {
  deriveLedgerCatalogStatus,
  toLedgerCatalogResult,
} from "./ledger-catalog";

const method = {
  id: "method-a",
  version: "1.0.0",
  title: "Method A",
  evidenceTemplate: { id: "evidence-template", version: "1.0.0" },
};

describe("ledger catalog", () => {
  it("marks a sourced method with accepted evidence as ready", () => {
    expect(deriveLedgerCatalogStatus(method, 1)).toEqual({
      status: "Ledger ready",
    });
  });

  it("reports mechanical unavailability reasons", () => {
    expect(deriveLedgerCatalogStatus(undefined, 1)).toEqual({
      status: "Unavailable",
      reason: "Missing method metadata",
    });
    expect(
      deriveLedgerCatalogStatus({ ...method, evidenceTemplate: undefined }, 1)
    ).toEqual({
      status: "Unavailable",
      reason: "No evidence template",
    });
    expect(deriveLedgerCatalogStatus(method, 0)).toEqual({
      status: "Unavailable",
      reason: "No accepted evidence",
    });
  });

  it("maps catalog rows without making unavailable methods selectable", () => {
    expect(toLedgerCatalogResult(method, 0)).toMatchObject({
      kind: "ledger",
      disabled: true,
      reason: "No accepted evidence",
    });
  });
});
