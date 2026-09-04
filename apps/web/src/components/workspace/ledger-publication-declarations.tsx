"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

export type LedgerDeclarationValues = {
  publicationAuthorisation: string;
  anonymisationStatus: string;
  publicDataDeclaration: string;
};

export const EMPTY_LEDGER_DECLARATIONS: LedgerDeclarationValues = {
  publicationAuthorisation: "",
  anonymisationStatus: "",
  publicDataDeclaration: "",
};

export const CONFIRMED_LEDGER_DECLARATIONS: LedgerDeclarationValues = {
  publicationAuthorisation: "confirmed-authorised-to-publish",
  anonymisationStatus:
    "confirmed-no-student-identifiers-or-raw-student-material",
  publicDataDeclaration: "confirmed-public-data",
};

const DECLARATION_OPTIONS = {
  publicationAuthorisation: [
    { value: "", labelKey: "selectAuthorisation" },
    {
      value: "confirmed-authorised-to-publish",
      labelKey: "confirmedAuthorisedToPublish",
    },
    {
      value: "not-confirmed-do-not-submit",
      labelKey: "notConfirmedDoNotSubmit",
    },
  ],
  anonymisationStatus: [
    { value: "", labelKey: "selectAnonymisation" },
    {
      value: "confirmed-no-student-identifiers-or-raw-student-material",
      labelKey: "confirmedNoStudentIdentifiers",
    },
    {
      value: "needs-human-privacy-review",
      labelKey: "needsHumanPrivacyReview",
    },
  ],
  publicDataDeclaration: [
    { value: "", labelKey: "selectPublicData" },
    { value: "confirmed-public-data", labelKey: "confirmedPublicData" },
    {
      value: "not-confirmed-do-not-submit",
      labelKey: "notConfirmedDoNotSubmit",
    },
  ],
} as const;

type DeclarationKey = keyof LedgerDeclarationValues;

export function ledgerDeclarationsConfirmed(
  values: LedgerDeclarationValues
): boolean {
  return (Object.keys(CONFIRMED_LEDGER_DECLARATIONS) as DeclarationKey[]).every(
    (key) => values[key] === CONFIRMED_LEDGER_DECLARATIONS[key]
  );
}

export function ledgerDeclarationRequestValues(
  values: LedgerDeclarationValues
) {
  return {
    publication_authorisation: values.publicationAuthorisation,
    anonymisation_status: values.anonymisationStatus,
    public_data_declaration: values.publicDataDeclaration,
  };
}

export function useLedgerPublicationDeclarations() {
  const [declarations, setDeclarations] = useState<LedgerDeclarationValues>({
    ...EMPTY_LEDGER_DECLARATIONS,
  });
  const resetDeclarations = useCallback(
    () => setDeclarations({ ...EMPTY_LEDGER_DECLARATIONS }),
    []
  );
  return {
    declarations,
    setDeclarations,
    declarationsConfirmed: ledgerDeclarationsConfirmed(declarations),
    resetDeclarations,
  };
}

export function LedgerPublicationDeclarations({
  values,
  onChange,
  variant,
  legend,
}: {
  values: LedgerDeclarationValues;
  onChange: (values: LedgerDeclarationValues) => void;
  variant: "checkbox" | "select";
  legend: string;
}) {
  const t = useTranslations("workspace");
  const keys = Object.keys(DECLARATION_OPTIONS) as DeclarationKey[];
  return (
    <fieldset
      className={
        variant === "select"
          ? "grid gap-x-6 gap-y-2 rounded border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3"
          : "min-w-0 space-y-3 rounded-md border p-3"
      }
    >
      <legend
        className={
          variant === "select"
            ? "px-1 text-xs font-medium text-slate-600"
            : "px-1 text-sm font-medium"
        }
      >
        {legend}
      </legend>
      {keys.map((key) => {
        if (variant === "checkbox") {
          const checked = values[key] === CONFIRMED_LEDGER_DECLARATIONS[key];
          const label =
            key === "publicationAuthorisation"
              ? t("authorisedToPublishLedger")
              : key === "anonymisationStatus"
                ? t("noStudentIdentifiers")
                : t("approvedDataDeclaration");
          return (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange({
                    ...values,
                    [key]: event.target.checked
                      ? CONFIRMED_LEDGER_DECLARATIONS[key]
                      : key === "anonymisationStatus"
                        ? "needs-human-privacy-review"
                        : "not-confirmed-do-not-submit",
                  })
                }
                data-testid={
                  key === "publicationAuthorisation"
                    ? "ledger-publication-authorisation"
                    : key === "anonymisationStatus"
                      ? "ledger-anonymisation-status"
                      : "ledger-public-data-declaration"
                }
              />
              {label}
            </label>
          );
        }
        return (
          <label
            key={key}
            className="flex flex-col gap-1 text-xs font-medium text-slate-700"
          >
            {key.charAt(0).toUpperCase() +
              key.replace(/([a-z])([A-Z])/g, "$1 $2").slice(1)}
            <select
              value={values[key]}
              onChange={(event) =>
                onChange({ ...values, [key]: event.target.value })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm font-normal text-slate-900"
            >
              {DECLARATION_OPTIONS[key].map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {!ledgerDeclarationsConfirmed(values) && (
        <p
          className={
            variant === "select"
              ? "text-xs text-amber-700 sm:col-span-3"
              : "text-xs text-amber-700"
          }
        >
          {t("confirmAllDeclarations")}
        </p>
      )}
    </fieldset>
  );
}
