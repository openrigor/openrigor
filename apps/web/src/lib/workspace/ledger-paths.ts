import { repositoryLayoutPrefix } from "./research-repository/layout";

/** Return the canonical research-repository path for a rendered evidence ledger. */
export function ledgerEvidenceFilePath(
  ledgerId: string,
  methodId: string,
  layoutVersion = "1.0"
): string {
  return `${repositoryLayoutPrefix(layoutVersion)}methods/${methodId}/evidence/ledgers/${ledgerId}.en.md`;
}
