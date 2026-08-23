/** Return the canonical research-repository path for a rendered evidence ledger. */
export function ledgerEvidenceFilePath(
  ledgerId: string,
  methodId: string
): string {
  return `methods/${methodId}/evidence/ledgers/${ledgerId}.en.md`;
}
