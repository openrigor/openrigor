"use client";

import { useUserContext } from "@/contexts/UserContext";
import type { WorkspaceItem } from "@/lib/workspace/types";
import {
  createContext,
  ReactNode,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";

type WorkspaceItemContextValue = {
  item: WorkspaceItem | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
};

const WorkspaceItemContext = createContext<
  WorkspaceItemContextValue | undefined
>(undefined);

export function WorkspaceItemProvider({
  itemId,
  children,
}: {
  itemId: string;
  children: ReactNode;
}) {
  const { user, loading: userLoading } = useUserContext();
  const [item, setItem] = useState<WorkspaceItem>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(itemId)}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        setItem(undefined);
        return;
      }
      const body = (await response.json()) as { item?: WorkspaceItem };
      setItem(body.item);
    } catch (error) {
      console.error("Failed to load workspace item", error);
      setItem(undefined);
    } finally {
      setLoading(false);
    }
  }, [itemId, user]);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setItem(undefined);
      setLoading(false);
      return;
    }
    void refresh();
  }, [itemId, refresh, user, userLoading]);

  return (
    <WorkspaceItemContext.Provider value={{ item, loading, refresh }}>
      {children}
    </WorkspaceItemContext.Provider>
  );
}

export function useWorkspaceItemOptional() {
  return useContext(WorkspaceItemContext);
}

export function useWorkspaceItem() {
  const context = useWorkspaceItemOptional();
  if (!context) {
    throw new Error(
      "useWorkspaceItem must be used within a WorkspaceItemProvider"
    );
  }
  return context;
}
