import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  LedgerPickerUnavailableError,
  listMergedLedgers,
} from "@/lib/workspace/ledger-picker";

export async function GET() {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ledgers = await listMergedLedgers();
    return NextResponse.json({ ledgers });
  } catch (error) {
    if (error instanceof LedgerPickerUnavailableError) {
      return NextResponse.json(
        { error: "Ledger picker unavailable" },
        { status: 503 }
      );
    }
    console.error("[workspace] failed to list published ledgers", error);
    return NextResponse.json(
      { error: "Ledger picker unavailable" },
      { status: 503 }
    );
  }
}
