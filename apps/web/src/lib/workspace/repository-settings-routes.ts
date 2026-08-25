import type { WorkspaceItem } from "./types";

export function repositorySettingsHref(itemId: string): string {
  return `/workspace/settings/repositories/${encodeURIComponent(itemId)}`;
}

export function legacyRepositoryRedirectPath(
  item: WorkspaceItem | undefined
): string | undefined {
  return item?.kind === "research_repository"
    ? repositorySettingsHref(item.id)
    : undefined;
}
