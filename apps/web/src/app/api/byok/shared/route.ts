import { NextResponse } from "next/server";
import { shareCoversItem } from "@opencanvas/shared/byok/shares";
import type { UserByokSettingsRow } from "@opencanvas/shared/byok/types";
import { createAdminClient } from "@/lib/teaching/admin-client";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { getWorkspaceItem, listWorkspaceItems } from "@/lib/workspace/store";

export async function GET() {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const participantItems = (
      await listWorkspaceItems(auth.user.id, {
        email: auth.user.email,
      })
    ).filter((item) => item.kind === "method_participant");
    if (participantItems.length === 0) {
      return NextResponse.json([]);
    }
    const admin = createAdminClient();
    const shared = [] as Array<{ itemId: string; providerLabel: string }>;

    for (const participantItem of participantItems) {
      if (participantItem.operatorId === auth.user.id) continue;
      const ownerItem = await getWorkspaceItem(
        participantItem.operatorId,
        participantItem.operatorItemId
      );
      if (
        !ownerItem ||
        ownerItem.kind !== "method" ||
        ownerItem.ownerId !== participantItem.operatorId ||
        !ownerItem.run
      ) {
        continue;
      }

      const participant = ownerItem.run.participants.find(
        (candidate) =>
          candidate.itemId === participantItem.id &&
          (candidate.userId === auth.user.id ||
            (auth.user.email &&
              candidate.email.trim().toLowerCase() ===
                auth.user.email.trim().toLowerCase()))
      );
      if (!participant) continue;

      const { data, error } = await admin
        .from("user_byok_settings")
        .select("*")
        .eq("user_id", ownerItem.ownerId)
        .maybeSingle();
      if (error || !data) continue;

      const row = data as UserByokSettingsRow;
      if (!shareCoversItem(row, ownerItem.id)) continue;

      shared.push({
        itemId: participantItem.id,
        providerLabel: `Provided by instructor — ${row.model}`,
      });
    }

    return NextResponse.json(shared, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to resolve shared BYOK providers", error);
    return NextResponse.json([], {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
