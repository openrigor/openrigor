import type { User } from "@supabase/supabase-js";
import { getAllInvitations } from "@/lib/teaching/invitation-store";
import { readAllStoreItems } from "./store-reader";

type PendingMethodInvite = { operatorId?: unknown };

export async function listInvitationCounts(
  users: Pick<User, "id">[]
): Promise<Record<string, number>> {
  const counts = Object.fromEntries(users.map((user) => [user.id, 0]));
  const invitations = await getAllInvitations();
  for (const invitation of invitations) {
    if (Object.prototype.hasOwnProperty.call(counts, invitation.created_by)) {
      counts[invitation.created_by] += 1;
    }
  }

  const methodInviteItems = await readAllStoreItems([
    "workspace_method_invites",
  ]);
  for (const item of methodInviteItems) {
    const value = item.value as { invites?: unknown } | undefined;
    if (!Array.isArray(value?.invites)) continue;
    for (const invite of value.invites as PendingMethodInvite[]) {
      if (
        typeof invite.operatorId === "string" &&
        Object.prototype.hasOwnProperty.call(counts, invite.operatorId)
      ) {
        counts[invite.operatorId] += 1;
      }
    }
  }

  return counts;
}
