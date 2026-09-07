import { Suspense } from "react";
import { WorkspacePageClient } from "@/components/workspace/workspace-home";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const t = await getTranslations("workspace");
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <WorkspacePageClient />
    </Suspense>
  );
}
