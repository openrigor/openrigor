import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";

type Publication = NonNullable<LedgerSnapshotWorkspaceItem["publication"]>;

export function publicationStatusText(
  publication?: Publication,
  actual?: { state?: string; merged?: boolean }
): string {
  if (!publication) return "Unpublished";
  return publication.status === "merged"
    ? "Merged"
    : actual?.state === "closed" && actual.merged !== true
      ? "Draft PR closed without merge"
      : "Draft PR — pending human merge";
}

export function canRepublishClosedPullRequest(
  publication?: Publication,
  actual?: { state?: string; merged?: boolean }
): boolean {
  return (
    publication?.status === "draft" &&
    actual?.state === "closed" &&
    actual.merged !== true
  );
}

export function ledgerPublishRequestBody(input: {
  authorised: boolean;
  anonymised: boolean;
  publicData: boolean;
  rePublish?: boolean;
}): {
  rePublish?: boolean;
  values: {
    publication_authorisation: string;
    anonymisation_status: string;
    public_data_declaration: string;
  };
} {
  return {
    ...(input.rePublish ? { rePublish: true } : {}),
    values: {
      publication_authorisation: input.authorised
        ? "confirmed-authorised-to-publish"
        : "not-confirmed-do-not-submit",
      anonymisation_status: input.anonymised
        ? "confirmed-no-student-identifiers-or-raw-student-material"
        : "needs-human-privacy-review",
      public_data_declaration: input.publicData
        ? "confirmed-public-data"
        : "not-confirmed-do-not-submit",
    },
  };
}

export function publicationAccessError(reason?: string): string | undefined {
  if (reason !== "missing_write_access") return undefined;
  return "Your connected GitHub account needs collaborator write access to evaluchat/research. No branch or pull request was created.";
}
