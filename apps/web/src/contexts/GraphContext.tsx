import { v4 as uuidv4 } from "uuid";
import { useUserContext } from "@/contexts/UserContext";
import {
  isArtifactCodeContent,
  isArtifactMarkdownContent,
  isDeprecatedArtifactType,
} from "@opencanvas/shared/utils/artifacts";
import { reverseCleanContent } from "@/lib/normalize_string";
import {
  ArtifactType,
  ArtifactV3,
  ArtifactMarkdownV3,
  CustomModelConfig,
  EditorCursorPosition,
  FormAgentContext,
  GraphInput,
  LedgerAgentContext,
  LedgerSnapshotAgentContext,
  ProgrammingLanguageOptions,
  RewriteArtifactMetaToolResponse,
  SearchResult,
  TextHighlight,
} from "@opencanvas/shared/types";
import { type DiffRange } from "@/lib/diffing";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { createClient } from "@/hooks/utils";
import { WEB_SEARCH_RESULTS_QUERY_PARAM } from "@/constants";
import {
  DEFAULT_INPUTS,
  OC_WEB_SEARCH_RESULTS_MESSAGE_KEY,
} from "@opencanvas/shared/constants";
import {
  ALL_MODEL_NAMES,
  NON_STREAMING_TEXT_MODELS,
  NON_STREAMING_TOOL_CALLING_MODELS,
} from "@opencanvas/shared/models";
import {
  getActiveDefaultModelConfig,
  getActiveDefaultModelName,
} from "@/lib/active-model";
import { Thread } from "@langchain/langgraph-sdk";
import { useToast } from "@/hooks/use-toast";
import {
  isEmptyKickoffThread,
  isSubmittedThread,
  threadContentScore,
  type ThreadLike,
} from "@/lib/teaching/select-active-thread";
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  convertToArtifactV3,
  extractChunkFields,
  handleGenerateArtifactToolCallChunk,
  removeCodeBlockFormatting,
  replaceOrInsertMessageChunk,
  updateHighlightedCode,
  updateHighlightedMarkdown,
  updateRewrittenArtifact,
} from "./utils";
import {
  handleRewriteArtifactThinkingModel,
  isThinkingModel,
} from "@opencanvas/shared/utils/thinking";
import { debounce } from "lodash";
import { useThreadContext } from "./ThreadProvider";
import { useAssistantContext } from "./AssistantContext";
import { useTeachingAssignmentOptional } from "./TeachingAssignmentContext";
import { useWorkspaceItemOptional } from "./WorkspaceItemContext";
import { useQueryState } from "nuqs";
import {
  findBlockInMarkdown,
  reconcileTextHighlight,
} from "@opencanvas/shared/utils/markdown-canvas";

function resolveHighlightBlockBounds(highlight: TextHighlight): {
  start: number;
  end: number;
} | null {
  const block = findBlockInMarkdown(
    highlight.fullMarkdown,
    highlight.markdownBlock
  );
  if (!block) {
    return null;
  }
  const start = highlight.fullMarkdown.indexOf(block);
  if (start === -1) {
    return null;
  }
  return { start, end: start + block.length };
}

export interface PendingEditState {
  isActive: boolean;
  preEditMarkdown: string;
  preEditText: string;
  diffRanges: DiffRange[];
}

interface GraphData {
  runId: string | undefined;
  isStreaming: boolean;
  error: boolean;
  selectedBlocks: TextHighlight | undefined;
  messages: BaseMessage[];
  artifact: ArtifactV3 | undefined;
  formContext: FormAgentContext | undefined;
  ledgerContext: LedgerAgentContext | undefined;
  ledgerSnapshotContext: LedgerSnapshotAgentContext | undefined;
  updateRenderedArtifactRequired: boolean;
  artifactSyncGeneration: number;
  isArtifactSaved: boolean;
  firstTokenReceived: boolean;
  feedbackSubmitted: boolean;
  artifactUpdateFailed: boolean;
  chatStarted: boolean;
  searchEnabled: boolean;
  setSearchEnabled: Dispatch<SetStateAction<boolean>>;
  setChatStarted: Dispatch<SetStateAction<boolean>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setFeedbackSubmitted: Dispatch<SetStateAction<boolean>>;
  setArtifact: Dispatch<SetStateAction<ArtifactV3 | undefined>>;
  setFormContext: Dispatch<SetStateAction<FormAgentContext | undefined>>;
  setLedgerContext: Dispatch<SetStateAction<LedgerAgentContext | undefined>>;
  setLedgerSnapshotContext: Dispatch<
    SetStateAction<LedgerSnapshotAgentContext | undefined>
  >;
  setSelectedBlocks: Dispatch<SetStateAction<TextHighlight | undefined>>;
  setSelectedArtifact: (index: number) => void;
  setMessages: Dispatch<SetStateAction<BaseMessage[]>>;
  streamMessage: (params: GraphInput) => Promise<void>;
  setArtifactContent: (index: number, content: string) => void;
  clearState: () => void;
  switchSelectedThread: (thread: Thread) => void;
  setUpdateRenderedArtifactRequired: Dispatch<SetStateAction<boolean>>;
  phaseState: string | undefined;
  setPhaseState: Dispatch<SetStateAction<string | undefined>>;
  submitAssignment: () => Promise<{ wordCount: number; messageCount: number }>;
  setCursorPosition: (pos: EditorCursorPosition | undefined) => void;
  setEditorHasFocus: (focused: boolean) => void;
  pendingEdit: PendingEditState | null;
  setPendingEdit: Dispatch<SetStateAction<PendingEditState | null>>;
  setEditorTextContent: (text: string) => void;
}

type GraphContentType = {
  graphData: GraphData;
};

const GraphContext = createContext<GraphContentType | undefined>(undefined);

const WORKSPACE_DRAFT_AUTOSAVE_MS = 5_000;

/**
 * A submitted assignment thread is locked: the artifact is frozen for review.
 * Post-submit drafts (debounced autosave / canvas onChange with a stale or
 * not-yet-hydrated editor) must never overwrite the drafted content in the
 * thread state (issue #75).
 */
export function isSubmittedThreadLock(opts: {
  phaseState?: string;
  submitted?: boolean;
}): boolean {
  return opts.phaseState === "submitted" || opts.submitted === true;
}

// Shim for recent LangGraph bugfix
function extractStreamDataChunk(chunk: any) {
  if (Array.isArray(chunk)) {
    return chunk[1];
  }
  return chunk;
}

function extractStreamDataOutput(output: any) {
  if (Array.isArray(output)) {
    return output[1];
  }
  return output;
}

export function GraphProvider({ children }: { children: ReactNode }) {
  const userData = useUserContext();
  const assistantsData = useAssistantContext();
  const teachingAssignmentContext = useTeachingAssignmentOptional();
  const workspaceItem = useWorkspaceItemOptional();
  const teachingAssignment = teachingAssignmentContext?.assignment;
  const assignmentIdParam = teachingAssignmentContext?.assignmentId ?? null;
  const workspaceItemThreadId =
    workspaceItem?.item?.kind === "markdown_template" ||
    workspaceItem?.item?.kind === "form_template" ||
    workspaceItem?.item?.kind === "method" ||
    workspaceItem?.item?.kind === "method_participant"
      ? workspaceItem.item.threadId
      : undefined;
  const assignmentSystemPrompt =
    teachingAssignmentContext?.systemPrompt ??
    (workspaceItem?.item?.kind === "markdown_template" ||
    workspaceItem?.item?.kind === "form_template" ||
    workspaceItem?.item?.kind === "method"
      ? workspaceItem.item.templateSnapshot.assistantGuidance
      : undefined);
  const apparatusConfiguration =
    teachingAssignmentContext?.apparatusConfiguration;
  const threadData = useThreadContext();
  const { toast } = useToast();
  const [chatStarted, setChatStarted] = useState(false);
  const [messages, setMessages] = useState<BaseMessage[]>([]);
  const [artifact, setArtifact] = useState<ArtifactV3>();
  const [formContext, setFormContext] = useState<FormAgentContext>();
  const [ledgerContext, setLedgerContext] = useState<LedgerAgentContext>();
  const [ledgerSnapshotContext, setLedgerSnapshotContext] =
    useState<LedgerSnapshotAgentContext>();
  const artifactRef = useRef<ArtifactV3 | undefined>(undefined);
  const formContextRef = useRef<FormAgentContext | undefined>(undefined);
  const ledgerContextRef = useRef<LedgerAgentContext | undefined>(undefined);
  const ledgerSnapshotContextRef = useRef<
    LedgerSnapshotAgentContext | undefined
  >(undefined);
  const [selectedBlocks, setSelectedBlocks] = useState<TextHighlight>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [updateRenderedArtifactRequired, setUpdateRenderedArtifactRequired] =
    useState(false);
  const [artifactSyncGeneration, setArtifactSyncGeneration] = useState(0);
  const lastSavedArtifact = useRef<ArtifactV3 | undefined>(undefined);
  const lastSavedFormContext = useRef<FormAgentContext | undefined>(undefined);
  const debouncedAPIUpdate = useRef(
    debounce(
      (artifact: ArtifactV3, threadId: string) =>
        updateArtifact(artifact, threadId),
      WORKSPACE_DRAFT_AUTOSAVE_MS
    )
  ).current;
  const [isArtifactSaved, setIsArtifactSaved] = useState(true);
  const [threadSwitched, setThreadSwitched] = useState(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [runId, setRunId] = useState<string>();
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [artifactUpdateFailed, setArtifactUpdateFailed] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [phaseState, setPhaseState] = useState<string | undefined>(undefined);
  const phaseStateRef = useRef<string | undefined>(undefined);
  // Authoritative "submitted" lock from the workspace item (method_participant
  // submissions), mirrored to a ref so the once-created debounced autosave
  // closure always reads the current value (issue #75).
  const workspaceItemSubmittedRef = useRef(false);
  const editorTextContentRef = useRef<string>("");
  const [pendingEdit, setPendingEdit] = useState<PendingEditState | null>(null);

  // Expose setPendingEdit for E2E testing
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__setPendingEdit = setPendingEdit;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__setPendingEdit;
      }
    };
  }, [setPendingEdit]);
  // Keep ref in sync with state so the debounced closure always reads current value
  useEffect(() => {
    phaseStateRef.current = phaseState;
  }, [phaseState]);
  useEffect(() => {
    workspaceItemSubmittedRef.current =
      workspaceItem?.item?.kind === "method_participant" &&
      workspaceItem.item.submission?.status === "submitted";
  });

  // A gate-off profile starts in drafting. The canonical Essays profile keeps
  // the Socratic phase and its four-message escape hatch.
  useEffect(() => {
    if (!teachingAssignment || threadData.threadId) return;
    const nextPhase =
      apparatusConfiguration?.drafting_gate === "none"
        ? "drafting"
        : "socratic";
    setPhaseState(nextPhase);
    phaseStateRef.current = nextPhase;
  }, [
    teachingAssignment,
    apparatusConfiguration?.drafting_gate,
    threadData.threadId,
  ]);

  // Keep artifactRef in sync so async closures (streamMessageV2) can
  // read the latest artifact value instead of the stale render snapshot.
  useEffect(() => {
    artifactRef.current = artifact;
  }, [artifact]);

  useEffect(() => {
    formContextRef.current = formContext;
  }, [formContext]);

  useEffect(() => {
    ledgerContextRef.current = ledgerContext;
  }, [ledgerContext]);

  useEffect(() => {
    ledgerSnapshotContextRef.current = ledgerSnapshotContext;
  }, [ledgerSnapshotContext]);

  // Cursor position — updated by TextRenderer, read by streamMessageV2.
  // Only updates when the Workspace has focus, so the position persists
  // when the user clicks into the chat input to type.
  const cursorPositionRef = useRef<EditorCursorPosition | undefined>(undefined);
  const editorHasFocusRef = useRef(false);
  const setCursorPosition = useCallback(
    (pos: EditorCursorPosition | undefined) => {
      if (editorHasFocusRef.current) {
        cursorPositionRef.current = pos;
      }
    },
    []
  );
  const setEditorHasFocus = useCallback((focused: boolean) => {
    editorHasFocusRef.current = focused;
  }, []);

  const setEditorTextContent = useCallback((text: string) => {
    editorTextContentRef.current = text;
  }, []);

  const [_, setWebSearchResultsId] = useQueryState(
    WEB_SEARCH_RESULTS_QUERY_PARAM
  );

  useEffect(() => {
    if (typeof window === "undefined" || !userData.user) return;

    // Get or create a new assistant if there isn't one set in state, and we're not
    // loading all assistants already.
    if (
      !assistantsData.selectedAssistant &&
      !assistantsData.isLoadingAllAssistants
    ) {
      assistantsData.getOrCreateAssistant(userData.user.id);
    }
  }, [userData.user]);

  // Very hacky way of ensuring updateState is not called when a thread is switched
  useEffect(() => {
    if (threadSwitched) {
      const timer = setTimeout(() => {
        setThreadSwitched(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [threadSwitched]);

  useEffect(() => {
    return () => {
      debouncedAPIUpdate.flush();
    };
  }, [debouncedAPIUpdate]);

  // Flush artifact save when the page is closed/navigated away
  useEffect(() => {
    const handleBeforeUnload = () => {
      debouncedAPIUpdate.flush();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [debouncedAPIUpdate]);

  const isFormWorkspace =
    workspaceItem?.item?.kind === "form_template" ||
    (workspaceItem?.item?.kind === "method" && !workspaceItem?.item?.run);
  useEffect(() => {
    if (!threadData.threadId) return;
    if (!artifact) return;
    // Never autosave an artifact for a submitted thread (issue #75): the
    // canvas read-only transition can fire onChange with an empty editor and
    // clobber the drafted content.
    if (
      isSubmittedThreadLock({
        phaseState: phaseStateRef.current,
        submitted: workspaceItemSubmittedRef.current,
      })
    )
      return;
    if (
      (updateRenderedArtifactRequired && !isFormWorkspace) ||
      threadSwitched ||
      isStreaming
    )
      return;
    const currentIndex = artifact.currentIndex;
    const currentContent = artifact.contents.find(
      (c) => c.index === currentIndex
    );
    if (!currentContent) return;
    if (
      (artifact.contents.length === 1 &&
        artifact.contents[0].type === "text" &&
        !artifact.contents[0].fullMarkdown) ||
      (artifact.contents[0].type === "code" && !artifact.contents[0].code)
    ) {
      // If the artifact has only one content and it's empty, we shouldn't update the state
      return;
    }

    const artifactChanged =
      !lastSavedArtifact.current ||
      lastSavedArtifact.current.contents !== artifact.contents;
    const formContextChanged = formContext !== lastSavedFormContext.current;
    if (artifactChanged || formContextChanged) {
      setIsArtifactSaved(false);
      // This means the artifact in state does not match the last saved artifact
      // We need to update
      debouncedAPIUpdate(artifact, threadData.threadId);
    }
  }, [
    artifact,
    formContext,
    threadData.threadId,
    threadSwitched,
    isStreaming,
    updateRenderedArtifactRequired,
    isFormWorkspace,
  ]);

  const lastLoadedThreadIdFromQuery = useRef<string | null>(null);
  const threadLoadRetries = useRef<number>(0);
  const MAX_THREAD_RETRIES = 3;

  // Attempt to load the thread if an ID is present in query params.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      threadData.createThreadLoading ||
      !threadData.threadId
    ) {
      return;
    }

    // Active streams own the thread (assignment kickoff / chat). Loading or
    // resetting here clears React messages while assistant-ui still holds
    // message indices → "Entry not available in the store".
    if (isStreaming) {
      return;
    }

    if (lastLoadedThreadIdFromQuery.current === threadData.threadId) {
      return;
    }

    // Reset retry counter when threadId changes
    if (
      threadLoadRetries.current > 0 &&
      lastLoadedThreadIdFromQuery.current !== threadData.threadId
    ) {
      threadLoadRetries.current = 0;
    }

    // Don't set the ref yet — set it inside .then() after confirming content.
    // This allows the effect to retry if the thread loads with empty values
    // (e.g., cold LangGraph server on first request after rebuild).

    const currentThreadId = threadData.threadId as string;
    const tryLoadThread = async () => {
      for (let attempt = 0; attempt <= MAX_THREAD_RETRIES; attempt++) {
        const thread = await threadData.getThread(currentThreadId);
        if (thread) {
          // Thread found — process it
          let threadValues = thread.values as
            | Record<string, unknown>
            | undefined;
          // Registry rehydrate can leave values null while checkpointer has state.
          if (
            !threadValues ||
            (!(threadValues.messages as unknown[] | undefined)?.length &&
              !threadValues.artifact)
          ) {
            try {
              const client = createClient();
              const state = await client.threads.getState(currentThreadId);
              if (state?.values) {
                threadValues = state.values as Record<string, unknown>;
                (thread as Thread).values = state.values;
              }
            } catch (_) {
              /* keep empty values */
            }
          }

          const scored = {
            thread_id: thread.thread_id,
            metadata: thread.metadata as Record<string, unknown>,
            values: threadValues,
          };
          const emptyKickoff = isEmptyKickoffThread(scored);
          const workspaceItemId = workspaceItem?.item?.id;
          const isWorkspaceThread = Boolean(
            workspaceItemId &&
              (thread.metadata as Record<string, unknown> | undefined)
                ?.workspace_item_id === workspaceItemId
          );
          // A workspace item intentionally starts with a short starter
          // document, so its hidden kickoff must not be mistaken for an
          // empty teaching thread. The workspace ownership marker is added
          // server-side and keeps this exception scoped to the current item.
          const treatAsEmptyKickoff = emptyKickoff && !isWorkspaceThread;

          const hasContent =
            threadValues &&
            ((threadValues.messages &&
              (threadValues.messages as unknown[]).length > 0) ||
              threadValues.artifact);

          if (hasContent && !treatAsEmptyKickoff) {
            lastLoadedThreadIdFromQuery.current = threadData.threadId;
            threadLoadRetries.current = 0;
          } else if (treatAsEmptyKickoff && assignmentIdParam && !isStreaming) {
            // URL/cache pointed at an empty kickoff — resume richer *incomplete*
            // sibling if any. Never jump to a submitted thread (read-only, no Send).
            try {
              const richer =
                await threadData.getActiveThread(assignmentIdParam);
              if (
                richer &&
                richer.thread_id !== currentThreadId &&
                !isSubmittedThread(richer as ThreadLike) &&
                threadContentScore(richer as ThreadLike) >
                  threadContentScore(scored)
              ) {
                lastLoadedThreadIdFromQuery.current = null;
                threadData.setThreadId(richer.thread_id);
                return;
              }
            } catch (_) {
              /* continue with empty handling */
            }
            if (hasContent) {
              lastLoadedThreadIdFromQuery.current = threadData.threadId;
              threadLoadRetries.current = 0;
            } else if (attempt < MAX_THREAD_RETRIES) {
              lastLoadedThreadIdFromQuery.current = null;
              threadLoadRetries.current = attempt + 1;
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            } else {
              lastLoadedThreadIdFromQuery.current = threadData.threadId;
              threadLoadRetries.current = 0;
              threadData.setThreadId(null);
              return;
            }
          } else if (attempt < MAX_THREAD_RETRIES) {
            // Thread exists but empty — allow retry on next attempt
            lastLoadedThreadIdFromQuery.current = null;
            threadLoadRetries.current = attempt + 1;
            if (attempt < MAX_THREAD_RETRIES) {
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
          } else {
            // Thread exists but empty after all retries — prefer a richer
            // sibling for this assignment before treating as fresh kickoff.
            lastLoadedThreadIdFromQuery.current = threadData.threadId;
            threadLoadRetries.current = 0;
            if (!isStreaming) {
              if (assignmentIdParam) {
                try {
                  const richer =
                    await threadData.getActiveThread(assignmentIdParam);
                  if (
                    richer &&
                    richer.thread_id !== currentThreadId &&
                    !isSubmittedThread(richer as ThreadLike)
                  ) {
                    lastLoadedThreadIdFromQuery.current = null;
                    threadData.setThreadId(richer.thread_id);
                    return;
                  }
                } catch (_) {
                  // fall through to clear threadId
                }
              }
              threadData.setThreadId(null);
            }
            return;
          }

          if (!isStreaming) {
            switchSelectedThread(thread);
          }
          return;
        }

        // Thread not found. Prefer a richer *incomplete* sibling before clearing URL.
        if (assignmentIdParam && !isStreaming) {
          try {
            const richer = await threadData.getActiveThread(assignmentIdParam);
            if (
              richer &&
              richer.thread_id !== currentThreadId &&
              !isSubmittedThread(richer as ThreadLike)
            ) {
              lastLoadedThreadIdFromQuery.current = null;
              threadData.setThreadId(richer.thread_id);
              return;
            }
          } catch (_) {
            /* retry / clear below */
          }
        }

        // Thread not found. This can happen if the proxy auth check hasn't
        // settled yet. Wait and retry.
        threadLoadRetries.current = attempt + 1;
        if (attempt < MAX_THREAD_RETRIES) {
          lastLoadedThreadIdFromQuery.current = null;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      // All retries exhausted — thread not found
      lastLoadedThreadIdFromQuery.current = null;
      threadData.setThreadId(null);
    };

    tryLoadThread();
  }, [
    threadData.threadId,
    userData.user,
    isStreaming,
    workspaceItem?.item?.id,
    workspaceItemThreadId,
    workspaceItem?.loading,
  ]);

  const updateArtifact = async (
    artifactToUpdate: ArtifactV3,
    threadId: string
  ) => {
    setArtifactUpdateFailed(false);
    if (isStreaming) return;
    if (
      isSubmittedThreadLock({
        phaseState: phaseStateRef.current,
        submitted: workspaceItemSubmittedRef.current,
      })
    )
      return;

    try {
      const client = createClient();
      const values: Record<string, unknown> = {
        artifact: artifactToUpdate,
      };
      if (formContextRef.current) {
        values.formContext = formContextRef.current;
      }
      // Always carry phase_state so a debounced save never clobbers it
      if (phaseStateRef.current) {
        values.phase_state = phaseStateRef.current;
      }
      await client.threads.updateState(threadId, { values });
      setIsArtifactSaved(true);
      lastSavedArtifact.current = artifactToUpdate;
      lastSavedFormContext.current = formContextRef.current;
      // Backup to localStorage as safety net against container restarts
      try {
        localStorage.setItem(
          `canvas_backup_${threadId}`,
          JSON.stringify({ artifact: artifactToUpdate, timestamp: Date.now() })
        );
      } catch (_) {}
    } catch (_) {
      setArtifactUpdateFailed(true);
    }
  };

  const clearState = () => {
    setMessages([]);
    setArtifact(undefined);
    setFormContext(undefined);
    ledgerContextRef.current = undefined;
    setLedgerContext(undefined);
    ledgerSnapshotContextRef.current = undefined;
    setLedgerSnapshotContext(undefined);
    lastSavedFormContext.current = undefined;
    setFirstTokenReceived(true);
  };

  /**
   * Calculate teaching completion percent and persist to thread metadata.
   * Called after each graph run completes.
   */
  const updateTeachingProgress = async (
    threadId: string,
    currentPhaseState: string | undefined,
    currentArtifact: ArtifactV3 | undefined,
    currentMessages: BaseMessage[]
  ) => {
    try {
      let completionPercent = 0;
      const ESCAPE_HATCH_THRESHOLD = 4;

      if (currentPhaseState === "submitted") {
        completionPercent = 100;
      } else if (currentPhaseState === "socratic") {
        // Count human messages (user inputs) to estimate socratic progress
        const humanMsgCount = currentMessages.filter(
          (m: any) => m.type === "human"
        ).length;
        completionPercent = Math.min(
          30,
          Math.round(10 + (humanMsgCount / ESCAPE_HATCH_THRESHOLD) * 20)
        );
      } else if (currentPhaseState === "drafting") {
        // Estimate word count from artifact content
        let wordCount = 0;
        if (currentArtifact) {
          const content = currentArtifact.contents.find(
            (c) => c.index === currentArtifact.currentIndex
          );
          if (content?.type === "text" && content.fullMarkdown) {
            wordCount = content.fullMarkdown
              .split(/\s+/)
              .filter(Boolean).length;
          }
        }
        const wordTarget = 500; // default word target
        completionPercent = Math.min(
          80,
          Math.round(30 + (wordCount / wordTarget) * 50)
        );
      }

      const client = createClient();
      // Get current thread to merge metadata
      const thread = await client.threads.get(threadId);
      const existingMetadata =
        (thread?.metadata as Record<string, unknown>) || {};

      await client.threads.update(threadId, {
        metadata: {
          ...existingMetadata,
          completionPercent,
        },
      });
    } catch (e) {
      console.error("Failed to update teaching progress", e);
    }
  };

  const streamMessageV2 = async (params: GraphInput) => {
    setFirstTokenReceived(false);
    setError(false);
    if (!assistantsData.selectedAssistant) {
      toast({
        title: "Error",
        description: "No assistant ID found",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    if (teachingAssignment && apparatusConfiguration?.ai_assistance === false) {
      toast({
        title: "AI assistance is disabled",
        description:
          "This assignment provides a local authoring surface and submission without agent calls.",
        variant: "destructive",
      });
      return;
    }

    const canvasActionRequested = Boolean(
      params.highlightedCode ||
        params.highlightedText ||
        params.language ||
        params.artifactLength ||
        params.regenerateWithEmojis ||
        params.readingLevel ||
        params.addComments ||
        params.addLogs ||
        params.portLanguage ||
        params.fixBugs ||
        params.customQuickActionId
    );
    if (
      teachingAssignment &&
      apparatusConfiguration?.ai_canvas_actions === false &&
      canvasActionRequested
    ) {
      toast({
        title: "AI editing actions are disabled",
        description:
          "Edit the document directly or continue the assignment conversation.",
        variant: "destructive",
      });
      return;
    }

    // Mark streaming BEFORE createThread. createThread writes threadId into the
    // URL, which triggers the resume/load effect — that effect must see
    // isStreaming so it does not clear messages mid-kickoff (assistant-ui
    // "Entry not available in the store").
    setIsStreaming(true);
    setRunId(undefined);
    setFeedbackSubmitted(false);

    let currentThreadId = threadData.threadId;
    if (!currentThreadId) {
      const newThread = await threadData.createThread(
        assignmentIdParam ?? undefined,
        workspaceItem?.item?.id
      );
      if (!newThread) {
        setIsStreaming(false);
        toast({
          title: "Error",
          description: "Failed to create thread",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      currentThreadId = newThread.thread_id;
    }

    const messagesInput = {
      // `messages` contains the full, unfiltered list of messages
      messages: params.messages,
      // `_messages` contains the list of messages which are included
      // in the LLMs context, including summarization messages.
      _messages: params.messages,
    };

    // TODO: update to properly pass the highlight data back
    // one field for highlighted text, and one for code
    let highlightedTextForInput = selectedBlocks;
    const latestArtifact = artifactRef.current ?? artifact;
    if (highlightedTextForInput && latestArtifact) {
      const currentContent = latestArtifact.contents.find(
        (c) => c.index === latestArtifact.currentIndex && c.type === "text"
      );
      if (currentContent?.type === "text" && currentContent.fullMarkdown) {
        const reconciled = reconcileTextHighlight(
          highlightedTextForInput,
          currentContent.fullMarkdown
        );
        if (reconciled.ok) {
          highlightedTextForInput = reconciled.highlight;
        } else {
          toast({
            title: "Selection out of sync",
            description:
              "Could not match your selection to the current document. Try selecting again.",
            variant: "destructive",
            duration: 5000,
          });
          highlightedTextForInput = undefined;
        }
      }
    }

    const input = {
      ...DEFAULT_INPUTS,
      artifact,
      ...(cursorPositionRef.current && {
        cursorPosition: cursorPositionRef.current,
      }),
      ...params,
      ...messagesInput,
      ledgerContext: params.ledgerContext ?? ledgerContextRef.current,
      ledgerSnapshotContext:
        params.ledgerSnapshotContext ?? ledgerSnapshotContextRef.current,
      ...(apparatusConfiguration ? { apparatusConfiguration } : {}),
      ...(highlightedTextForInput && {
        highlightedText: highlightedTextForInput,
      }),
      webSearchEnabled: searchEnabled,
    };
    // Add check for multiple defined fields
    const fieldsToCheck = [
      input.highlightedCode,
      input.highlightedText,
      input.language,
      input.artifactLength,
      input.regenerateWithEmojis,
      input.readingLevel,
      input.addComments,
      input.addLogs,
      input.fixBugs,
      input.portLanguage,
      input.customQuickActionId,
    ];

    if (fieldsToCheck.filter((field) => field !== undefined).length >= 2) {
      setIsStreaming(false);
      toast({
        title: "Error",
        description:
          "Can not use multiple fields (quick actions, highlights, etc.) at once. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    // Snapshot pre-edit state for track changes
    const preEditMarkdown =
      artifact?.contents.find((c) => c.index === artifact.currentIndex)
        ?.type === "text"
        ? (
            artifact.contents.find(
              (c) => c.index === artifact.currentIndex
            ) as ArtifactMarkdownV3
          ).fullMarkdown
        : "";
    const preEditText = editorTextContentRef.current;

    // isStreaming already set before createThread above
    // The root level run ID of this stream
    let runId = "";
    let followupMessageId = "";
    // The ID of the message containing the thinking content.
    let thinkingMessageId = "";
    // When streaming handlers apply an artifact version, skip duplicate on_chain_end.
    let artifactAppliedFromStreamIndex: number | undefined;

    const applyAgentArtifactUpdate = (nextArtifact: ArtifactV3) => {
      setFirstTokenReceived(true);
      setArtifact(nextArtifact);
      setUpdateRenderedArtifactRequired(true);
      setArtifactSyncGeneration((g) => g + 1);
      artifactAppliedFromStreamIndex = nextArtifact.currentIndex;
    };

    try {
      const client = createClient();
      const stream = client.runs.stream(
        currentThreadId,
        assistantsData.selectedAssistant.assistant_id,
        {
          input: input as Record<string, unknown>,
          streamMode: "events",
          config: {
            configurable: {
              customModelName: threadData.modelName,
              modelConfig: threadData.modelConfig,
              ...(assignmentSystemPrompt
                ? { systemPrompt: assignmentSystemPrompt }
                : {}),
              ...(apparatusConfiguration ? { apparatusConfiguration } : {}),
            },
          },
        }
      );

      // Variables to keep track of content specific to this stream
      const prevCurrentContent = artifact
        ? artifact.contents.find((a) => a.index === artifact.currentIndex)
        : undefined;

      // The new index of the artifact that is generating
      let newArtifactIndex = 1;
      if (artifact) {
        newArtifactIndex = artifact.contents.length + 1;
      }

      // The metadata generated when re-writing an artifact
      let rewriteArtifactMeta: RewriteArtifactMetaToolResponse | undefined =
        undefined;

      // For generating an artifact
      let generateArtifactToolCallStr = "";

      // For updating code artifacts
      // All the text up until the startCharIndex
      let updatedArtifactStartContent: string | undefined = undefined;
      // All the text after the endCharIndex
      let updatedArtifactRestContent: string | undefined = undefined;
      // Whether or not the first update has been made when updating highlighted code.
      let isFirstUpdate = true;

      // The full text content of an artifact that is being rewritten.
      // This may include thinking tokens if the model generates them.
      let fullNewArtifactContent = "";
      // The response text ONLY of the artifact that is being rewritten.
      let newArtifactContent = "";

      // The updated full markdown text when using the highlight update tool
      let highlightedText: TextHighlight | undefined = undefined;

      // The ID of the message for the web search operation during this turn
      let webSearchMessageId = "";

      for await (const chunk of stream) {
        if (chunk.event === "error") {
          const errorMessage =
            chunk?.data?.message || "Unknown error. Please try again.";
          toast({
            title: "Error generating content",
            description: errorMessage,
            variant: "destructive",
            duration: 5000,
          });
          setError(true);
          setIsStreaming(false);
          break;
        }

        try {
          const {
            runId: runId_,
            event,
            langgraphNode,
            nodeInput,
            nodeChunk,
            nodeOutput,
            taskName,
          } = extractChunkFields(chunk);

          if (!runId && runId_) {
            runId = runId_;
            setRunId(runId);
          }

          if (event === "on_chain_start") {
            if (langgraphNode === "updateHighlightedText") {
              highlightedText = nodeInput?.highlightedText;
            }

            if (langgraphNode === "queryGenerator" && !webSearchMessageId) {
              webSearchMessageId = `web-search-results-${uuidv4()}`;
              // The web search is starting. Add a new message.
              setMessages((prev) => {
                return [
                  ...prev,
                  new AIMessage({
                    id: webSearchMessageId,
                    content: "",
                    additional_kwargs: {
                      [OC_WEB_SEARCH_RESULTS_MESSAGE_KEY]: true,
                      webSearchResults: [],
                      webSearchStatus: "searching",
                    },
                  }),
                ];
              });
              // Set the query param to trigger the UI
              setWebSearchResultsId(webSearchMessageId);
            }
          }

          if (event === "on_chat_model_stream") {
            // These are generating new messages to insert to the chat window.
            if (
              ["generateFollowup", "replyToGeneralInput"].includes(
                langgraphNode
              )
            ) {
              const message = extractStreamDataChunk(nodeChunk);
              if (!followupMessageId) {
                followupMessageId = message.id;
              }
              setMessages((prevMessages) =>
                replaceOrInsertMessageChunk(prevMessages, message)
              );
            }

            if (langgraphNode === "generateArtifact") {
              const message = extractStreamDataChunk(nodeChunk);

              // Accumulate content
              if (
                message?.tool_call_chunks?.length > 0 &&
                typeof message?.tool_call_chunks?.[0]?.args === "string"
              ) {
                generateArtifactToolCallStr += message.tool_call_chunks[0].args;
              } else if (
                message?.content &&
                typeof message?.content === "string"
              ) {
                generateArtifactToolCallStr += message.content;
              }

              // Process accumulated content with rate limiting
              const result = handleGenerateArtifactToolCallChunk(
                generateArtifactToolCallStr,
                artifact
              );

              if (result) {
                if (result === "continue") {
                  continue;
                } else if (typeof result === "object") {
                  if (!firstTokenReceived) {
                    setFirstTokenReceived(true);
                  }
                  // Use debounced setter to prevent too frequent updates
                  setArtifact(result);
                }
              }
            }

            if (langgraphNode === "updateHighlightedText") {
              const message = extractStreamDataChunk(nodeChunk);
              if (!message) {
                continue;
              }
              if (!artifact) {
                console.error(
                  "No artifacts found when updating highlighted markdown..."
                );
                continue;
              }
              if (!highlightedText) {
                toast({
                  title: "Error",
                  description: "No highlighted text found",
                  variant: "destructive",
                  duration: 5000,
                });
                continue;
              }
              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!isArtifactMarkdownContent(prevCurrentContent)) {
                toast({
                  title: "Error",
                  description: "Received non markdown block update",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              const partialUpdatedContent = message.content || "";
              const blockBounds = resolveHighlightBlockBounds(highlightedText);
              if (!blockBounds) {
                console.error(
                  "[updateHighlightedText] markdown block not found in fullMarkdown"
                );
                continue;
              }

              if (
                updatedArtifactStartContent === undefined &&
                updatedArtifactRestContent === undefined
              ) {
                // Initialize the start and rest content on first chunk
                updatedArtifactStartContent =
                  highlightedText.fullMarkdown.slice(0, blockBounds.start);
                updatedArtifactRestContent = highlightedText.fullMarkdown.slice(
                  blockBounds.end
                );
              }

              if (
                updatedArtifactStartContent !== undefined &&
                updatedArtifactRestContent !== undefined
              ) {
                updatedArtifactStartContent += partialUpdatedContent;
              }

              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }
                return updateHighlightedMarkdown(
                  prev,
                  `${updatedArtifactStartContent}${updatedArtifactRestContent}`,
                  newArtifactIndex,
                  prevCurrentContent,
                  firstUpdateCopy
                );
              });
              artifactAppliedFromStreamIndex = newArtifactIndex;

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (langgraphNode === "updateArtifact") {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!params.highlightedCode) {
                toast({
                  title: "Error",
                  description: "No highlighted code found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              const partialUpdatedContent =
                extractStreamDataChunk(nodeChunk)?.content || "";
              const { startCharIndex, endCharIndex } = params.highlightedCode;

              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (prevCurrentContent.type !== "code") {
                toast({
                  title: "Error",
                  description: "Received non code block update",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              if (
                updatedArtifactStartContent === undefined &&
                updatedArtifactRestContent === undefined
              ) {
                updatedArtifactStartContent = prevCurrentContent.code.slice(
                  0,
                  startCharIndex
                );
                updatedArtifactRestContent =
                  prevCurrentContent.code.slice(endCharIndex);
              } else {
                // One of the above have been populated, now we can update the start to contain the new text.
                updatedArtifactStartContent += partialUpdatedContent;
              }
              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }
                const content = removeCodeBlockFormatting(
                  `${updatedArtifactStartContent}${updatedArtifactRestContent}`
                );
                return updateHighlightedCode(
                  prev,
                  content,
                  newArtifactIndex,
                  prevCurrentContent,
                  firstUpdateCopy
                );
              });

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (
              langgraphNode === "rewriteArtifact" &&
              taskName === "rewrite_artifact_model_call" &&
              rewriteArtifactMeta
            ) {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              fullNewArtifactContent +=
                extractStreamDataChunk(nodeChunk)?.content || "";

              if (isThinkingModel(threadData.modelName)) {
                if (!thinkingMessageId) {
                  thinkingMessageId = `thinking-${uuidv4()}`;
                }
                newArtifactContent =
                  handleRewriteArtifactThinkingModel<BaseMessage>({
                    newArtifactContent: fullNewArtifactContent,
                    setMessages,
                    thinkingMessageId,
                    createMessage: (id, content) =>
                      new AIMessage({ id, content }),
                  });
              } else {
                newArtifactContent = fullNewArtifactContent;
              }

              // Ensure we have the language to update the artifact with
              let artifactLanguage = params.portLanguage || undefined;
              if (
                !artifactLanguage &&
                rewriteArtifactMeta.type === "code" &&
                rewriteArtifactMeta.language
              ) {
                // If the type is `code` we should have a programming language populated
                // in the rewriteArtifactMeta and can use that.
                artifactLanguage =
                  rewriteArtifactMeta.language as ProgrammingLanguageOptions;
              } else if (!artifactLanguage) {
                artifactLanguage =
                  (prevCurrentContent?.title as ProgrammingLanguageOptions) ??
                  "other";
              }

              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }

                let content = newArtifactContent;
                if (!rewriteArtifactMeta) {
                  console.error(
                    "No rewrite artifact meta found when updating artifact"
                  );
                  return prev;
                }
                if (rewriteArtifactMeta.type === "code") {
                  content = removeCodeBlockFormatting(content);
                }

                return updateRewrittenArtifact({
                  prevArtifact: prev,
                  newArtifactContent: content,
                  rewriteArtifactMeta: rewriteArtifactMeta,
                  prevCurrentContent,
                  newArtifactIndex,
                  isFirstUpdate: firstUpdateCopy,
                  artifactLanguage,
                });
              });

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (
              [
                "rewriteArtifactTheme",
                "rewriteCodeArtifactTheme",
                "customAction",
              ].includes(langgraphNode)
            ) {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              fullNewArtifactContent +=
                extractStreamDataChunk(nodeChunk)?.content || "";

              if (isThinkingModel(threadData.modelName)) {
                if (!thinkingMessageId) {
                  thinkingMessageId = `thinking-${uuidv4()}`;
                }
                newArtifactContent =
                  handleRewriteArtifactThinkingModel<BaseMessage>({
                    newArtifactContent: fullNewArtifactContent,
                    setMessages,
                    thinkingMessageId,
                    createMessage: (id, content) =>
                      new AIMessage({ id, content }),
                  });
              } else {
                newArtifactContent = fullNewArtifactContent;
              }

              // Ensure we have the language to update the artifact with
              const artifactLanguage =
                params.portLanguage ||
                (isArtifactCodeContent(prevCurrentContent)
                  ? prevCurrentContent.language
                  : "other");

              const langGraphNode = langgraphNode;
              let artifactType: ArtifactType;
              if (langGraphNode === "rewriteCodeArtifactTheme") {
                artifactType = "code";
              } else if (langGraphNode === "rewriteArtifactTheme") {
                artifactType = "text";
              } else {
                artifactType = prevCurrentContent.type;
              }
              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }

                let content = newArtifactContent;
                if (artifactType === "code") {
                  content = removeCodeBlockFormatting(content);
                }

                return updateRewrittenArtifact({
                  prevArtifact: prev ?? artifact,
                  newArtifactContent: content,
                  rewriteArtifactMeta: {
                    type: artifactType,
                    title: prevCurrentContent.title,
                    language: artifactLanguage,
                  },
                  prevCurrentContent,
                  newArtifactIndex,
                  isFirstUpdate: firstUpdateCopy,
                  artifactLanguage,
                });
              });

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }
          }

          if (event === "on_chat_model_end") {
            if (
              langgraphNode === "rewriteArtifact" &&
              taskName === "rewrite_artifact_model_call" &&
              rewriteArtifactMeta &&
              NON_STREAMING_TEXT_MODELS.some((m) => m === threadData.modelName)
            ) {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              const message = extractStreamDataOutput(nodeOutput);

              fullNewArtifactContent += message.content || "";

              // Ensure we have the language to update the artifact with
              let artifactLanguage = params.portLanguage || undefined;
              if (
                !artifactLanguage &&
                rewriteArtifactMeta.type === "code" &&
                rewriteArtifactMeta.language
              ) {
                // If the type is `code` we should have a programming language populated
                // in the rewriteArtifactMeta and can use that.
                artifactLanguage =
                  rewriteArtifactMeta.language as ProgrammingLanguageOptions;
              } else if (!artifactLanguage) {
                artifactLanguage =
                  (prevCurrentContent?.title as ProgrammingLanguageOptions) ??
                  "other";
              }

              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }

                let content = fullNewArtifactContent;
                if (!rewriteArtifactMeta) {
                  console.error(
                    "No rewrite artifact meta found when updating artifact"
                  );
                  return prev;
                }
                if (rewriteArtifactMeta.type === "code") {
                  content = removeCodeBlockFormatting(content);
                }

                return updateRewrittenArtifact({
                  prevArtifact: prev,
                  newArtifactContent: content,
                  rewriteArtifactMeta: rewriteArtifactMeta,
                  prevCurrentContent,
                  newArtifactIndex,
                  isFirstUpdate: firstUpdateCopy,
                  artifactLanguage,
                });
              });

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (
              langgraphNode === "updateHighlightedText" &&
              NON_STREAMING_TEXT_MODELS.some((m) => m === threadData.modelName)
            ) {
              const message = extractStreamDataOutput(nodeOutput);
              if (!message) {
                continue;
              }
              if (!artifact) {
                console.error(
                  "No artifacts found when updating highlighted markdown..."
                );
                continue;
              }
              if (!highlightedText) {
                toast({
                  title: "Error",
                  description: "No highlighted text found",
                  variant: "destructive",
                  duration: 5000,
                });
                continue;
              }
              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!isArtifactMarkdownContent(prevCurrentContent)) {
                toast({
                  title: "Error",
                  description: "Received non markdown block update",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              const partialUpdatedContent = message.content || "";
              const blockBounds = resolveHighlightBlockBounds(highlightedText);
              if (!blockBounds) {
                console.error(
                  "[updateHighlightedText] markdown block not found in fullMarkdown"
                );
                continue;
              }

              if (
                updatedArtifactStartContent === undefined &&
                updatedArtifactRestContent === undefined
              ) {
                // Initialize the start and rest content on first chunk
                updatedArtifactStartContent =
                  highlightedText.fullMarkdown.slice(0, blockBounds.start);
                updatedArtifactRestContent = highlightedText.fullMarkdown.slice(
                  blockBounds.end
                );
              }

              if (
                updatedArtifactStartContent !== undefined &&
                updatedArtifactRestContent !== undefined
              ) {
                updatedArtifactStartContent += partialUpdatedContent;
              }

              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }
                return updateHighlightedMarkdown(
                  prev,
                  `${updatedArtifactStartContent}${updatedArtifactRestContent}`,
                  newArtifactIndex,
                  prevCurrentContent,
                  firstUpdateCopy
                );
              });
              artifactAppliedFromStreamIndex = newArtifactIndex;

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (
              langgraphNode === "updateArtifact" &&
              NON_STREAMING_TEXT_MODELS.some((m) => m === threadData.modelName)
            ) {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!params.highlightedCode) {
                toast({
                  title: "Error",
                  description: "No highlighted code found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              const message = extractStreamDataOutput(nodeOutput);
              if (!message) {
                continue;
              }

              const partialUpdatedContent = message.content || "";
              const { startCharIndex, endCharIndex } = params.highlightedCode;

              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (prevCurrentContent.type !== "code") {
                toast({
                  title: "Error",
                  description: "Received non code block update",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }

              if (
                updatedArtifactStartContent === undefined &&
                updatedArtifactRestContent === undefined
              ) {
                updatedArtifactStartContent =
                  prevCurrentContent.code.slice(0, startCharIndex) +
                  partialUpdatedContent;
                updatedArtifactRestContent =
                  prevCurrentContent.code.slice(endCharIndex);
              }
              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }
                const content = removeCodeBlockFormatting(
                  `${updatedArtifactStartContent}${updatedArtifactRestContent}`
                );
                return updateHighlightedCode(
                  prev,
                  content,
                  newArtifactIndex,
                  prevCurrentContent,
                  firstUpdateCopy
                );
              });

              if (isFirstUpdate) {
                isFirstUpdate = false;
              }
            }

            if (
              [
                "rewriteArtifactTheme",
                "rewriteCodeArtifactTheme",
                "customAction",
              ].includes(langgraphNode) &&
              NON_STREAMING_TEXT_MODELS.some((m) => m === threadData.modelName)
            ) {
              if (!artifact) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (!prevCurrentContent) {
                toast({
                  title: "Error",
                  description: "Original artifact not found",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              const message = extractStreamDataOutput(nodeOutput);
              fullNewArtifactContent += message?.content || "";

              // Ensure we have the language to update the artifact with
              const artifactLanguage =
                params.portLanguage ||
                (isArtifactCodeContent(prevCurrentContent)
                  ? prevCurrentContent.language
                  : "other");

              let artifactType: ArtifactType;
              if (langgraphNode === "rewriteCodeArtifactTheme") {
                artifactType = "code";
              } else if (langgraphNode === "rewriteArtifactTheme") {
                artifactType = "text";
              } else {
                artifactType = prevCurrentContent.type;
              }
              const firstUpdateCopy = isFirstUpdate;
              setFirstTokenReceived(true);
              setArtifact((prev) => {
                if (!prev) {
                  throw new Error("No artifact found when updating markdown");
                }

                let content = fullNewArtifactContent;
                if (artifactType === "code") {
                  content = removeCodeBlockFormatting(content);
                }

                return updateRewrittenArtifact({
                  prevArtifact: prev ?? artifact,
                  newArtifactContent: content,
                  rewriteArtifactMeta: {
                    type: artifactType,
                    title: prevCurrentContent.title,
                    language: artifactLanguage,
                  },
                  prevCurrentContent,
                  newArtifactIndex,
                  isFirstUpdate: firstUpdateCopy,
                  artifactLanguage,
                });
              });
            }

            if (
              ["generateFollowup", "replyToGeneralInput"].includes(
                langgraphNode
              ) &&
              !followupMessageId &&
              NON_STREAMING_TEXT_MODELS.some((m) => m === threadData.modelName)
            ) {
              const message = extractStreamDataOutput(nodeOutput);
              if (typeof message?.content !== "string") {
                continue;
              }
              followupMessageId = message.id;
              setMessages((prevMessages) =>
                replaceOrInsertMessageChunk(prevMessages, message)
              );
            }
          }

          if (event === "on_chain_end") {
            if (
              langgraphNode === "rewriteArtifact" &&
              taskName === "optionally_update_artifact_meta"
            ) {
              rewriteArtifactMeta = nodeOutput;
            }

            if (langgraphNode === "search" && webSearchMessageId) {
              const output = nodeOutput as {
                webSearchResults: SearchResult[];
              };

              setMessages((prev) => {
                return prev.map((m) => {
                  if (m.id !== webSearchMessageId) return m;

                  return new AIMessage({
                    ...m,
                    additional_kwargs: {
                      ...m.additional_kwargs,
                      webSearchResults: output.webSearchResults,
                      webSearchStatus: "done",
                    },
                  });
                });
              });
            }

            if (
              langgraphNode === "generateArtifact" &&
              !generateArtifactToolCallStr &&
              NON_STREAMING_TOOL_CALLING_MODELS.some(
                (m) => m === threadData.modelName
              )
            ) {
              const message = nodeOutput;
              generateArtifactToolCallStr +=
                message?.tool_call_chunks?.[0]?.args || message?.content || "";
              const result = handleGenerateArtifactToolCallChunk(
                generateArtifactToolCallStr,
                artifact
              );
              if (result && result === "continue") {
                continue;
              } else if (result && typeof result === "object") {
                setFirstTokenReceived(true);
                setArtifact(result);
              }
            }

            if (langgraphNode === "assessThesis" && nodeOutput) {
              const output = nodeOutput as Record<string, any>;
              if (output.phase_state) {
                setPhaseState(output.phase_state);
              }
            }

            if (langgraphNode === "applyTextEdits" && nodeOutput) {
              const output = extractStreamDataOutput(nodeOutput) as {
                artifact?: ArtifactV3;
              };
              if (output?.artifact) {
                applyAgentArtifactUpdate(output.artifact);
              }
            }

            if (
              (langgraphNode === "updateHighlightedText" ||
                langgraphNode === "updateArtifact" ||
                langgraphNode === "rewriteArtifact" ||
                langgraphNode === "integrateCanvasDirection") &&
              nodeOutput
            ) {
              const output = extractStreamDataOutput(nodeOutput) as {
                artifact?: ArtifactV3;
              };
              if (output?.artifact) {
                const shouldApply =
                  langgraphNode === "updateHighlightedText" ||
                  output.artifact.currentIndex !==
                    artifactAppliedFromStreamIndex;
                if (shouldApply) {
                  applyAgentArtifactUpdate(output.artifact);
                }
              }
            }

            if (langgraphNode === "generateFollowup" && nodeOutput) {
              const output = extractStreamDataOutput(nodeOutput) as {
                messages?: Array<Record<string, unknown>>;
              };
              const raw = output?.messages?.[0];
              if (raw && !followupMessageId) {
                const content =
                  typeof raw.content === "string"
                    ? raw.content
                    : typeof (raw as { kwargs?: { content?: string } }).kwargs
                          ?.content === "string"
                      ? (raw as { kwargs: { content: string } }).kwargs.content
                      : null;

                if (content) {
                  const aiMsg = new AIMessage({
                    id: (raw.id as string) || uuidv4(),
                    content,
                  });
                  followupMessageId = aiMsg.id!;
                  setFirstTokenReceived(true);
                  setMessages((prev) => [...prev, aiMsg]);
                }
              }
            }
          }
        } catch (e: any) {
          console.error(
            "Failed to parse stream chunk",
            chunk,
            "\n\nError:\n",
            e
          );

          let errorMessage = "Unknown error. Please try again.";
          if (typeof e === "object" && e?.message) {
            errorMessage = e.message;
          }

          toast({
            title: "Error generating content",
            description: errorMessage,
            variant: "destructive",
            duration: 5000,
          });
          setError(true);
          setIsStreaming(false);
          break;
        }
      }
      lastSavedArtifact.current = artifact;
    } catch (e) {
      console.error("Failed to stream message", e);
      let errorMessage = "Unknown error. Please try again.";
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === "object" && e && "message" in e) {
        errorMessage = String((e as { message: unknown }).message);
      }
      toast({
        title: "Error generating content",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
      setError(true);
    } finally {
      setSelectedBlocks(undefined);
      setIsStreaming(false);

      // Store pendingEdit with pre-edit snapshots, defer diff computation to TextRenderer
      try {
        const latestArtifact = artifactRef.current;
        const postEditMarkdown =
          latestArtifact?.contents.find(
            (c) => c.index === latestArtifact.currentIndex
          )?.type === "text"
            ? (
                latestArtifact.contents.find(
                  (c) => c.index === latestArtifact.currentIndex
                ) as ArtifactMarkdownV3
              ).fullMarkdown
            : "";

        if (
          preEditMarkdown &&
          postEditMarkdown &&
          preEditMarkdown !== postEditMarkdown
        ) {
          setUpdateRenderedArtifactRequired(true);
          setArtifactSyncGeneration((g) => g + 1);

          if (preEditText) {
            setPendingEdit({
              isActive: true,
              preEditMarkdown,
              preEditText,
              diffRanges: [],
            });
          }
        }
      } catch (e) {
        console.warn("[track-changes] Failed to compute diff:", e);
      }
    }

    // Persist teaching progress to thread metadata
    if (
      threadData.threadId &&
      teachingAssignment &&
      assignmentSystemPrompt &&
      apparatusConfiguration?.tracking !== false
    ) {
      void updateTeachingProgress(
        threadData.threadId,
        phaseState,
        artifact,
        messages
      );
    }
  };

  const setSelectedArtifact = (index: number) => {
    setUpdateRenderedArtifactRequired(true);
    setThreadSwitched(true);

    setArtifact((prev) => {
      if (!prev) {
        toast({
          title: "Error",
          description: "No artifactV2 found",
          variant: "destructive",
          duration: 5000,
        });
        return prev;
      }
      const newArtifact = {
        ...prev,
        currentIndex: index,
      };
      lastSavedArtifact.current = newArtifact;
      return newArtifact;
    });
  };

  const setArtifactContent = (index: number, content: string) => {
    setArtifact((prev) => {
      if (!prev) {
        toast({
          title: "Error",
          description: "No artifact found",
          variant: "destructive",
          duration: 5000,
        });
        return prev;
      }
      const newArtifact = {
        ...prev,
        currentIndex: index,
        contents: prev.contents.map((a) => {
          if (a.index === index && a.type === "code") {
            return {
              ...a,
              code: reverseCleanContent(content),
            };
          }
          return a;
        }),
      };
      return newArtifact;
    });
  };

  const submitAssignment = async (): Promise<{
    wordCount: number;
    messageCount: number;
  }> => {
    // Cancel any pending debounced artifact save so it doesn't race us
    debouncedAPIUpdate.cancel();

    // Calculate word count from artifact
    let wordCount = 0;
    if (artifact) {
      const content = artifact.contents.find(
        (c) => c.index === artifact.currentIndex
      );
      if (content?.type === "text" && content.fullMarkdown) {
        wordCount = content.fullMarkdown.split(/\s+/).filter(Boolean).length;
      }
    }

    const messageCount = messages.filter((m: any) => m.type === "human").length;

    // Persist to thread
    if (threadData.threadId) {
      const submitThreadId = threadData.threadId;
      const client = createClient();

      // 1. Save artifact to thread values (ensure canvas content is persisted)
      if (artifact) {
        try {
          await client.threads.updateState(submitThreadId, {
            values: {
              artifact,
              phase_state: phaseState,
            },
          });
          lastSavedArtifact.current = artifact;
          try {
            localStorage.setItem(
              `canvas_backup_${submitThreadId}`,
              JSON.stringify({ artifact, timestamp: Date.now() })
            );
          } catch (_) {}
        } catch (e) {
          console.error("Failed to save artifact on submit", e);
        }
      }

      const markThreadSubmitted = async () => {
        const thread = await client.threads.get(submitThreadId);
        const existingMetadata =
          (thread?.metadata as Record<string, unknown>) || {};
        await client.threads.update(submitThreadId, {
          metadata: {
            ...existingMetadata,
            completionPercent: 100,
            phase_state: "submitted",
            phaseState: "submitted",
            submittedAt: new Date().toISOString(),
          },
        });
        await client.threads.updateState(submitThreadId, {
          values: { phase_state: "submitted" },
        });
      };

      if (workspaceItem?.item?.kind === "method_participant") {
        const response = await fetch(
          `/api/workspace/items/${encodeURIComponent(workspaceItem.item.id)}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              values: {},
              threadId: submitThreadId,
            }),
          }
        );
        if (!response.ok) {
          throw new Error("Failed to submit assignment");
        }
        await markThreadSubmitted();
        await workspaceItem.refresh();
      } else {
        await markThreadSubmitted();
      }
    }
    setPendingEdit(null);
    setPhaseState("submitted");
    return { wordCount, messageCount };
  };

  const switchSelectedThread = (thread: Thread) => {
    setUpdateRenderedArtifactRequired(true);
    setThreadSwitched(true);
    setChatStarted(true);

    // Set the thread ID in state. Then set in cookies so a new thread
    // isn't created on page load if one already exists.
    threadData.setThreadId(thread.thread_id);

    if (thread.metadata?.customModelName) {
      threadData.setModelName(
        thread.metadata.customModelName as ALL_MODEL_NAMES
      );
      threadData.setModelConfig(
        thread.metadata.customModelName as ALL_MODEL_NAMES,
        thread.metadata.modelConfig as CustomModelConfig
      );
    } else {
      const defaultName = getActiveDefaultModelName();
      threadData.setModelName(defaultName);
      threadData.setModelConfig(defaultName, getActiveDefaultModelConfig());
    }

    const castValues: {
      artifact: ArtifactV3 | undefined;
      messages: Record<string, any>[] | undefined;
    } = {
      artifact: undefined,
      messages: (thread.values as Record<string, any>)?.messages || undefined,
    };
    const castThreadValues = thread.values as Record<string, any>;
    if (castThreadValues?.phase_state) {
      setPhaseState(castThreadValues.phase_state);
    } else if (
      Number(thread.metadata?.completionPercent) === 100 ||
      thread.metadata?.phase_state === "submitted" ||
      thread.metadata?.phaseState === "submitted"
    ) {
      setPhaseState("submitted");
    }
    if (castThreadValues?.artifact) {
      if (isDeprecatedArtifactType(castThreadValues.artifact)) {
        castValues.artifact = convertToArtifactV3(castThreadValues.artifact);
      } else {
        castValues.artifact = castThreadValues.artifact;
      }
    } else {
      castValues.artifact = undefined;
    }
    // If artifact is empty/missing, check localStorage backup for THIS thread.
    // Use thread.thread_id — threadData.threadId may still be the previous id
    // until React re-renders after setThreadId.
    if (!castValues.artifact) {
      try {
        const backupRaw = localStorage.getItem(
          `canvas_backup_${thread.thread_id}`
        );
        if (backupRaw) {
          const { artifact: backupArtifact, timestamp } = JSON.parse(backupRaw);
          if (
            backupArtifact &&
            Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000
          ) {
            // Backup is less than 7 days old — use it
            castValues.artifact = backupArtifact;
            // Restore to server in the background
            const client = createClient();
            void client.threads
              .updateState(thread.thread_id, {
                values: { artifact: backupArtifact },
              })
              .catch(console.warn);
          }
        }
      } catch (_) {}
    }
    lastSavedArtifact.current = castValues?.artifact;
    const loadedFormContext = castThreadValues?.formContext as
      | FormAgentContext
      | undefined;
    setFormContext(loadedFormContext);
    lastSavedFormContext.current = loadedFormContext;
    const loadedLedgerContext = castThreadValues?.ledgerContext as
      | LedgerAgentContext
      | undefined;
    ledgerContextRef.current = loadedLedgerContext;
    setLedgerContext(loadedLedgerContext);

    if (!castValues?.messages?.length) {
      setMessages([]);
      setArtifact(castValues?.artifact);
      return;
    }
    setArtifact(castValues?.artifact);
    setMessages(
      castValues.messages.map((msg: Record<string, any>) => {
        if (msg.response_metadata?.langSmithRunURL) {
          msg.tool_calls = msg.tool_calls ?? [];
          msg.tool_calls.push({
            name: "langsmith_tool_ui",
            args: { sharedRunURL: msg.response_metadata.langSmithRunURL },
            id: msg.response_metadata.langSmithRunURL
              ?.split("https://smith.langchain.com/public/")[1]
              .split("/")[0],
          });
        }
        return msg as BaseMessage;
      })
    );
  };

  const contextValue: GraphContentType = {
    graphData: {
      runId,
      isStreaming,
      error,
      selectedBlocks,
      messages,
      artifact,
      formContext,
      ledgerContext,
      ledgerSnapshotContext,
      updateRenderedArtifactRequired,
      artifactSyncGeneration,
      isArtifactSaved,
      firstTokenReceived,
      feedbackSubmitted,
      chatStarted,
      artifactUpdateFailed,
      searchEnabled,
      setSearchEnabled,
      setChatStarted,
      setIsStreaming,
      setFeedbackSubmitted,
      setArtifact,
      setFormContext,
      setLedgerContext,
      setLedgerSnapshotContext,
      setSelectedBlocks,
      setSelectedArtifact,
      setMessages,
      streamMessage: streamMessageV2,
      setArtifactContent,
      clearState,
      switchSelectedThread,
      setUpdateRenderedArtifactRequired,
      phaseState,
      setPhaseState,
      submitAssignment,
      setCursorPosition,
      setEditorHasFocus,
      pendingEdit,
      setPendingEdit,
      setEditorTextContent,
    },
  };

  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
}

export function useGraphContext() {
  const context = useContext(GraphContext);
  if (context === undefined) {
    throw new Error("useGraphContext must be used within a GraphProvider");
  }
  return context;
}
