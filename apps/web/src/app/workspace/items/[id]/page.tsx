"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AssistantProvider } from "@/contexts/AssistantContext";
import { GraphProvider } from "@/contexts/GraphContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import {
  WorkspaceItemProvider,
  useWorkspaceItem,
} from "@/contexts/WorkspaceItemContext";
import { WorkspaceCanvas } from "@/components/workspace/workspace-canvas";
import { legacyRepositoryRedirectPath } from "@/lib/workspace/repository-settings-routes";
import { useTranslations } from "next-intl";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUserContext();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);
  if (loading || !user) return null;
  return <>{children}</>;
}

function WorkspaceItemRoute() {
  const { item, loading } = useWorkspaceItem();
  const router = useRouter();
  const repositoryRedirect = legacyRepositoryRedirectPath(item);

  useEffect(() => {
    if (loading) return;
    if (!item) {
      router.replace("/workspace");
      return;
    }
    if (repositoryRedirect) router.replace(repositoryRedirect);
  }, [loading, item, repositoryRedirect, router]);

  const content =
    !item || repositoryRedirect ? null : (
      <ThreadProvider workspaceItemId={item.id}>
        <AssistantProvider workspaceMode>
          <GraphProvider>
            <WorkspaceCanvas />
          </GraphProvider>
        </AssistantProvider>
      </ThreadProvider>
    );

  return <AuthGate>{content}</AuthGate>;
}

export default function WorkspaceItemPage() {
  const t = useTranslations("workspace");
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <UserProvider>
        <WorkspaceItemProvider itemId={id}>
          <WorkspaceItemRoute />
        </WorkspaceItemProvider>
      </UserProvider>
    </Suspense>
  );
}
