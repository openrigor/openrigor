import {
  ALL_MODEL_NAMES,
  ALL_MODELS,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_NAME,
  OPENROUTER_DEFAULT_MODEL_NAME,
  OPENROUTER_MODELS,
} from "@opencanvas/shared/models";
import { CustomModelConfig } from "@opencanvas/shared/types";
import { Thread } from "@langchain/langgraph-sdk";
import { createClient } from "../hooks/utils";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { useUserContext } from "./UserContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryState } from "nuqs";
import {
  emptyKickoffsToAbandon,
  selectActiveThread,
  shouldMintNewAssignmentThread,
  shouldRejectCachedThread,
  type ThreadLike,
} from "@/lib/teaching/select-active-thread";
import { useSharedProviderLabel } from "@/lib/workspace/shared-provider";

type ThreadContentType = {
  threadId: string | null;
  userThreads: Thread[];
  isUserThreadsLoading: boolean;
  modelName: ALL_MODEL_NAMES;
  modelConfig: CustomModelConfig;
  modelConfigs: Record<ALL_MODEL_NAMES, CustomModelConfig>;
  sharedProviderLabel?: string;
  createThreadLoading: boolean;
  getThread: (id: string) => Promise<Thread | undefined>;
  createThread: (
    assignmentId?: string,
    workspaceItemId?: string
  ) => Promise<Thread | undefined>;
  findThreadByAssignment: (assignmentId: string) => Promise<Thread | undefined>;
  getActiveThread: (assignmentId: string) => Promise<Thread | undefined>;
  getAllThreadsForAssignment: (assignmentId: string) => Promise<Thread[]>;
  getUserThreads: () => Promise<void>;
  deleteThread: (id: string, clearMessages: () => void) => Promise<void>;
  setThreadId: (id: string | null) => void;
  setModelName: (name: ALL_MODEL_NAMES) => void;
  setModelConfig: (
    modelName: ALL_MODEL_NAMES,
    config: CustomModelConfig
  ) => void;
};

const ThreadContext = createContext<ThreadContentType | undefined>(undefined);

export function ThreadProvider({
  children,
  workspaceItemId,
}: {
  children: ReactNode;
  workspaceItemId?: string;
}) {
  const { user, getUser, loading: userLoading } = useUserContext();
  const { toast } = useToast();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [userThreads, setUserThreads] = useState<Thread[]>([]);
  const [isUserThreadsLoading, setIsUserThreadsLoading] = useState(false);
  const defaultModelName =
    process.env.NEXT_PUBLIC_OPENROUTER_ENABLED === "true"
      ? OPENROUTER_DEFAULT_MODEL_NAME
      : DEFAULT_MODEL_NAME;
  const [modelName, setModelName] = useState<ALL_MODEL_NAMES>(defaultModelName);
  const sharedProviderLabel = useSharedProviderLabel(workspaceItemId);
  const [createThreadLoading, setCreateThreadLoading] = useState(false);

  const [modelConfigs, setModelConfigs] = useState<
    Record<ALL_MODEL_NAMES, CustomModelConfig>
  >(() => {
    // Initialize with default configs for all models
    const initialConfigs: Record<ALL_MODEL_NAMES, CustomModelConfig> =
      {} as Record<ALL_MODEL_NAMES, CustomModelConfig>;

    const modelsForConfig =
      process.env.NEXT_PUBLIC_OPENROUTER_ENABLED === "true"
        ? OPENROUTER_MODELS
        : ALL_MODELS;
    modelsForConfig.forEach((model) => {
      const modelKey = model.modelName || model.name;

      initialConfigs[modelKey] = {
        ...model.config,
        provider: model.config.provider,
        temperatureRange: {
          ...(model.config.temperatureRange ||
            DEFAULT_MODEL_CONFIG.temperatureRange),
        },
        maxTokens: {
          ...(model.config.maxTokens || DEFAULT_MODEL_CONFIG.maxTokens),
        },
        ...(model.config.provider === "azure_openai" && {
          azureConfig: {
            azureOpenAIApiKey: process.env._AZURE_OPENAI_API_KEY || "",
            azureOpenAIApiInstanceName:
              process.env._AZURE_OPENAI_API_INSTANCE_NAME || "",
            azureOpenAIApiDeploymentName:
              process.env._AZURE_OPENAI_API_DEPLOYMENT_NAME || "",
            azureOpenAIApiVersion:
              process.env._AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
            azureOpenAIBasePath: process.env._AZURE_OPENAI_API_BASE_PATH,
          },
        }),
      };
    });
    return initialConfigs;
  });

  const modelConfig = useMemo(() => {
    // Try exact match first, then try without "azure/" or "groq/" prefixes
    return (
      modelConfigs[modelName] || modelConfigs[modelName.replace("azure/", "")]
    );
  }, [modelName, modelConfigs]);

  const setModelConfig = (
    modelName: ALL_MODEL_NAMES,
    config: CustomModelConfig
  ) => {
    setModelConfigs((prevConfigs) => {
      if (!config || !modelName) {
        return prevConfigs;
      }
      return {
        ...prevConfigs,
        [modelName]: {
          ...config,
          provider: config.provider,
          temperatureRange: {
            ...(config.temperatureRange ||
              DEFAULT_MODEL_CONFIG.temperatureRange),
          },
          maxTokens: {
            ...(config.maxTokens || DEFAULT_MODEL_CONFIG.maxTokens),
          },
          ...(config.provider === "azure_openai" && {
            azureConfig: {
              ...config.azureConfig,
              azureOpenAIApiKey:
                config.azureConfig?.azureOpenAIApiKey ||
                process.env._AZURE_OPENAI_API_KEY ||
                "",
              azureOpenAIApiInstanceName:
                config.azureConfig?.azureOpenAIApiInstanceName ||
                process.env._AZURE_OPENAI_API_INSTANCE_NAME ||
                "",
              azureOpenAIApiDeploymentName:
                config.azureConfig?.azureOpenAIApiDeploymentName ||
                process.env._AZURE_OPENAI_API_DEPLOYMENT_NAME ||
                "",
              azureOpenAIApiVersion:
                config.azureConfig?.azureOpenAIApiVersion ||
                "2024-08-01-preview",
              azureOpenAIBasePath:
                config.azureConfig?.azureOpenAIBasePath ||
                process.env._AZURE_OPENAI_API_BASE_PATH,
            },
          }),
        },
      };
    });
  };

  const createThread = async (
    assignmentId?: string,
    workspaceItemIdOverride?: string
  ): Promise<Thread | undefined> => {
    // Wait for auth to resolve instead of relying on stale closure
    let currentUser = user;
    if (!currentUser && userLoading) {
      // Auth still loading — wait up to 3s for it
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        currentUser = await getUser();
        if (currentUser) break;
      }
    }
    if (!currentUser) {
      currentUser = await getUser();
    }
    if (!currentUser) {
      toast({
        title: "Failed to create thread",
        description: "User not found",
        duration: 5000,
        variant: "destructive",
      });
      return;
    }
    const client = createClient();
    setCreateThreadLoading(true);
    const ownedWorkspaceItemId = workspaceItemIdOverride ?? workspaceItemId;

    try {
      // Reuse an incomplete active thread; allow minting when only submitted
      // (or nothing) exists so students can start a fresh attempt.
      if (assignmentId) {
        const existing = await getActiveThread(assignmentId);
        if (
          existing &&
          !shouldMintNewAssignmentThread(existing as ThreadLike, {
            workspaceBound: Boolean(ownedWorkspaceItemId),
          })
        ) {
          setThreadId(existing.thread_id);
          try {
            const cache = JSON.parse(
              localStorage.getItem("oc_thread_cache") || "{}"
            );
            cache[`${currentUser.id}:${assignmentId}`] = existing.thread_id;
            localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
          } catch (_) {}
          return existing;
        }
      }

      const thread = await client.threads.create({
        metadata: {
          supabase_user_id: currentUser.id,
          ...(assignmentId ? { assignment_id: assignmentId } : {}),
          ...(ownedWorkspaceItemId
            ? { workspace_item_id: ownedWorkspaceItemId }
            : {}),
          customModelName: modelName,
          modelConfig: {
            ...modelConfig,
            // Ensure Azure config is included if needed
            ...(modelConfig.provider === "azure_openai" && {
              azureConfig: modelConfig.azureConfig,
            }),
          },
        },
      });

      setThreadId(thread.thread_id);
      if (ownedWorkspaceItemId) {
        try {
          await fetch(
            `/api/workspace/items/${encodeURIComponent(ownedWorkspaceItemId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ threadId: thread.thread_id }),
            }
          );
        } catch (error) {
          console.error("Failed to attach workspace thread", error);
        }
      }
      if (assignmentId) {
        try {
          const cache = JSON.parse(
            localStorage.getItem("oc_thread_cache") || "{}"
          );
          cache[`${currentUser.id}:${assignmentId}`] = thread.thread_id;
          localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
        } catch (_) {}
      }
      // Fetch updated threads so the new thread is included.
      // Do not await since we do not want to block the UI.
      getUserThreads().catch(console.error);
      return thread;
    } catch (e) {
      console.error("Failed to create thread", e);
      toast({
        title: "Failed to create thread",
        description:
          "An error occurred while trying to create a new thread. Please try again.",
        duration: 5000,
        variant: "destructive",
      });
    } finally {
      setCreateThreadLoading(false);
    }
  };

  const findThreadByAssignment = async (
    assignmentId: string
  ): Promise<Thread | undefined> => {
    const currentUser = await getUser();
    if (!currentUser) return undefined;
    try {
      const client = createClient();
      const results = await client.threads.search({
        metadata: {
          supabase_user_id: currentUser.id,
          assignment_id: assignmentId,
        },
        limit: 100,
      });
      return results[0] || undefined;
    } catch (e) {
      console.error("Failed to find thread by assignment", e);
      return undefined;
    }
  };

  const enrichThreadValues = async (
    client: ReturnType<typeof createClient>,
    thread: Thread
  ): Promise<Thread> => {
    const values = thread.values as Record<string, unknown> | undefined;
    const hasValues =
      values &&
      ((Array.isArray(values.messages) && values.messages.length > 0) ||
        values.artifact);
    if (hasValues) return thread;
    try {
      const state = await client.threads.getState(thread.thread_id);
      if (state?.values) {
        return { ...thread, values: state.values };
      }
    } catch (_) {
      // Keep registry-only thread; scorer treats missing values as empty.
    }
    return thread;
  };

  const writeThreadCache = (
    userId: string,
    assignmentId: string,
    threadIdValue: string
  ) => {
    try {
      const cache = JSON.parse(localStorage.getItem("oc_thread_cache") || "{}");
      cache[`${userId}:${assignmentId}`] = threadIdValue;
      localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
    } catch (_) {}
  };

  const clearThreadCacheEntry = (userId: string, assignmentId: string) => {
    try {
      const cache = JSON.parse(localStorage.getItem("oc_thread_cache") || "{}");
      delete cache[`${userId}:${assignmentId}`];
      localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
    } catch (_) {}
  };

  const abandonEmptyKickoffs = async (
    client: ReturnType<typeof createClient>,
    threads: Thread[],
    selected: Thread
  ) => {
    const toAbandon = emptyKickoffsToAbandon(
      threads as ThreadLike[],
      selected as ThreadLike
    );
    for (const t of toAbandon) {
      try {
        const meta = (t.metadata || {}) as Record<string, unknown>;
        await client.threads.update(t.thread_id, {
          metadata: { ...meta, abandoned: true },
        });
      } catch (e) {
        console.error("Failed to abandon empty kickoff thread", t.thread_id, e);
      }
    }
  };

  const getActiveThread = async (
    assignmentId: string
  ): Promise<Thread | undefined> => {
    const currentUser = await getUser();
    if (!currentUser) return undefined;

    const client = createClient();
    let cachedThread: Thread | undefined;

    try {
      const cache = JSON.parse(localStorage.getItem("oc_thread_cache") || "{}");
      const cachedThreadId = cache[`${currentUser.id}:${assignmentId}`];
      if (cachedThreadId) {
        try {
          const thread = await client.threads.get(cachedThreadId);
          if (thread) {
            cachedThread = await enrichThreadValues(client, thread);
          }
        } catch (_) {
          clearThreadCacheEntry(currentUser.id, assignmentId);
        }
      }
    } catch (_) {}

    try {
      const results = await client.threads.search({
        metadata: {
          supabase_user_id: currentUser.id,
          ...(workspaceItemId
            ? { workspace_item_id: workspaceItemId }
            : { assignment_id: assignmentId }),
        },
        limit: 100,
      });

      const enriched: Thread[] = [];
      for (const t of results) {
        enriched.push(await enrichThreadValues(client, t));
      }

      if (
        cachedThread &&
        !shouldRejectCachedThread(
          cachedThread as ThreadLike,
          enriched as ThreadLike[]
        )
      ) {
        writeThreadCache(currentUser.id, assignmentId, cachedThread.thread_id);
        return cachedThread;
      }

      if (cachedThread) {
        clearThreadCacheEntry(currentUser.id, assignmentId);
      }

      const active = selectActiveThread(enriched as ThreadLike[]) as
        | Thread
        | undefined;
      if (!active) return undefined;

      writeThreadCache(currentUser.id, assignmentId, active.thread_id);
      void abandonEmptyKickoffs(client, enriched, active);
      return active;
    } catch (e) {
      console.error("Failed to get active thread", e);
      if (
        cachedThread &&
        !shouldRejectCachedThread(cachedThread as ThreadLike, [
          cachedThread as ThreadLike,
        ])
      ) {
        return cachedThread;
      }
      return undefined;
    }
  };

  const getAllThreadsForAssignment = async (
    assignmentId: string
  ): Promise<Thread[]> => {
    try {
      const client = createClient();
      const results = await client.threads.search({
        metadata: {
          assignment_id: assignmentId,
        },
        limit: 100,
      });
      return results;
    } catch (e) {
      console.error("Failed to get all threads for assignment", e);
      return [];
    }
  };

  const getUserThreads = async () => {
    const currentUser = await getUser();
    if (!currentUser) {
      toast({
        title: "Failed to create thread",
        description: "User not found",
        duration: 5000,
        variant: "destructive",
      });
      return;
    }

    setIsUserThreadsLoading(true);
    try {
      const client = createClient();

      const userThreads = await client.threads.search({
        metadata: {
          supabase_user_id: currentUser.id,
        },
        limit: 100,
      });

      if (userThreads.length > 0) {
        const lastInArray = userThreads[0];
        const allButLast = userThreads.slice(1, userThreads.length);
        const filteredThreads = allButLast.filter(
          (thread) => thread.values && Object.keys(thread.values).length > 0
        );
        setUserThreads([...filteredThreads, lastInArray]);
      }
    } finally {
      setIsUserThreadsLoading(false);
    }
  };

  const deleteThread = async (id: string, clearMessages: () => void) => {
    setUserThreads((prevThreads) => {
      const newThreads = prevThreads.filter(
        (thread) => thread.thread_id !== id
      );
      return newThreads;
    });
    if (id === threadId) {
      clearMessages();
      // Create a new thread. Use .then to avoid blocking the UI.
      // Once completed, `createThread` will re-fetch all user
      // threads to update UI.
      void createThread();
    }
    const client = createClient();
    try {
      await client.threads.delete(id);
    } catch (e) {
      console.error(`Failed to delete thread with ID ${id}`, e);
    }
    try {
      const cache = JSON.parse(localStorage.getItem("oc_thread_cache") || "{}");
      for (const key of Object.keys(cache)) {
        if (cache[key] === id) {
          delete cache[key];
        }
      }
      localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
    } catch (_) {}
  };

  const getThread = async (id: string): Promise<Thread | undefined> => {
    try {
      const client = createClient();
      return client.threads.get(id);
    } catch (e) {
      console.error("Failed to get thread by ID.", id, e);
      toast({
        title: "Failed to get thread",
        description: "An error occurred while trying to get a thread.",
        duration: 5000,
        variant: "destructive",
      });
    }

    return undefined;
  };

  const contextValue: ThreadContentType = {
    threadId,
    userThreads,
    isUserThreadsLoading,
    modelName,
    modelConfig,
    modelConfigs,
    sharedProviderLabel,
    createThreadLoading,
    getThread,
    createThread,
    findThreadByAssignment,
    getActiveThread,
    getAllThreadsForAssignment,
    getUserThreads,
    deleteThread,
    setThreadId,
    setModelName,
    setModelConfig,
  };

  return (
    <ThreadContext.Provider value={contextValue}>
      {children}
    </ThreadContext.Provider>
  );
}

export function useThreadContext() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreadContext must be used within a ThreadProvider");
  }
  return context;
}
