import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { listApparatuses } from "@/lib/apparatuses/registry";
import { toLedgerCatalogResult } from "@/lib/apparatuses/ledger-catalog";
import { listResearchedMethods } from "@/lib/workspace/ledger-source";
import { searchTemplates } from "@/lib/workspace/template-catalog";

export async function GET(request: NextRequest) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q") || "";
  const kind = request.nextUrl.searchParams.get("kind") || "template";

  if (kind === "ledger") {
    const needle = query.trim().toLowerCase();
    const methods = await listResearchedMethods();
    const results = methods
      .filter((method) => {
        if (!needle) return true;
        return [method.id, method.title, method.description || ""].some(
          (value) => value.toLowerCase().includes(needle)
        );
      })
      .map((method) =>
        toLedgerCatalogResult(method, method.acceptedEvidenceCount)
      );
    return NextResponse.json({ kind, results });
  }

  if (kind === "method") {
    const needle = query.trim().toLowerCase();
    const methods = listApparatuses()
      .filter((method) => {
        if (!needle) return true;
        return [method.id, method.name, method.description].some((value) =>
          value.toLowerCase().includes(needle)
        );
      })
      .slice(0, 5)
      .map((method) => ({
        id: method.id,
        title: method.name,
        description: method.description,
        disabled: false,
      }));
    return NextResponse.json({ kind, results: methods });
  }

  return NextResponse.json({
    kind: "template",
    results: searchTemplates(query).map((template) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      templateKind: template.templateKind,
      disabled: false,
    })),
  });
}
