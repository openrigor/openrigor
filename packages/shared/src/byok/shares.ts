import type { UserByokSettingsRow } from "./types.js";

export function shareCoversItem(
  row: UserByokSettingsRow,
  itemId: string
): boolean {
  const mode = row.share_mode ?? "none";
  return (
    row.enabled &&
    (mode === "all_assignments" ||
      (mode === "specific_items" &&
        (row.shared_item_ids ?? []).includes(itemId)))
  );
}
