"use client";

import { WebSearchResults } from "@/components/web-search-results";
import { ALL_MODEL_NAMES } from "@opencanvas/shared/models";
import {
  getActiveDefaultModelConfig,
  getActiveDefaultModelName,
} from "@/lib/active-model";
import { useGraphContext } from "@/contexts/GraphContext";
import { useToast } from "@/hooks/use-toast";
import { getLanguageTemplate } from "@/lib/get_language_template";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ArtifactV3,
  CustomModelConfig,
  ProgrammingLanguageOptions,
} from "@opencanvas/shared/types";
import React, { Suspense, useEffect, useState } from "react";

const ArtifactRenderer = React.lazy(() =>
  import("@/components/artifacts/ArtifactRenderer").then((m) => ({
    default: m.ArtifactRenderer,
  }))
);
const ContentComposerChatInterface = React.lazy(() =>
  import("./content-composer").then((m) => ({
    default: m.ContentComposerChatInterface,
  }))
);
import NoSSRWrapper from "../NoSSRWrapper";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { createClient } from "@/hooks/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CHAT_COLLAPSED_QUERY_PARAM } from "@/constants";
import { AssignmentWorkspaceBanner } from "@/components/teaching/assignment-workspace-banner";
import { SubmitAssignmentDialog } from "@/components/teaching/submit-assignment-dialog";
import { AbandonAssignmentDialog } from "@/components/teaching/abandon-assignment-dialog";
import { useAssignmentCanvasBootstrap } from "@/hooks/use-assignment-canvas-bootstrap";
import { useAssignmentKickoff } from "@/hooks/use-assignment-kickoff";
import { CanvasLoading } from "@/components/canvas/canavas-loading";
import { useRouter, useSearchParams } from "next/navigation";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";
import { useWorkspaceItemOptional } from "@/contexts/WorkspaceItemContext";
import { publicMethodPageUrl } from "@/lib/workspace/method-links";

export interface CanvasProps {
  /** Optional editor-level banner rendered inside the canvas height budget. */
  editorBanner?: React.ReactNode;
  /** The default canvas is intentionally reduced to the core writing flow. */
  minimalCanvas?: boolean;
}

export function CanvasComponent({
  editorBanner,
  minimalCanvas = true,
}: CanvasProps = {}) {
  const { graphData } = useGraphContext();
  const { setModelName, setModelConfig, threadId } = useThreadContext();
  const {
    setArtifact,
    chatStarted,
    setChatStarted,
    phaseState,
    setPhaseState,
    submitAssignment,
    artifact,
    messages,
  } = graphData;
  const teachingAssignment = useTeachingAssignmentOptional();
  const workspaceItem = useWorkspaceItemOptional()?.item;
  const workspaceMethod =
    workspaceItem?.kind === "method_participant" ||
    workspaceItem?.kind === "method"
      ? workspaceItem.methodSource
      : undefined;
  const aiAssistanceEnabled =
    teachingAssignment?.apparatusConfiguration?.ai_assistance !== false;
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [webSearchResultsOpen, setWebSearchResultsOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    wordCount: number;
    messageCount: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [abandonDialogOpen, setAbandonDialogOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  const activeAssignment = useAssignmentCanvasBootstrap();
  useAssignmentKickoff();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assignmentId = teachingAssignment?.assignmentId ?? null;

  useEffect(() => {
    if (activeAssignment) {
      const submitted =
        activeAssignment.status === "submitted" ||
        phaseState === "submitted" ||
        searchParams.get("readonly") === "1";
      setIsEditing(!submitted);
      setChatCollapsed(false);
      const queryParams = new URLSearchParams(searchParams.toString());
      if (queryParams.has(CHAT_COLLAPSED_QUERY_PARAM)) {
        queryParams.delete(CHAT_COLLAPSED_QUERY_PARAM);
        router.replace(`?${queryParams.toString()}`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignment id only
  }, [activeAssignment?.id]);

  useEffect(() => {
    if (aiAssistanceEnabled || chatStarted || graphData.artifact) return;
    // AI-off profiles still need a first-class authoring surface. Seed an
    // empty markdown artifact locally; submission remains available without a
    // graph run.
    setArtifact({
      currentIndex: 1,
      contents: [
        { index: 1, type: "text", title: "Assignment", fullMarkdown: "" },
      ],
    });
    setChatStarted(true);
    setIsEditing(true);
  }, [
    aiAssistanceEnabled,
    chatStarted,
    graphData.artifact,
    setArtifact,
    setChatStarted,
  ]);

  const chatCollapsedSearchParam = searchParams.get(CHAT_COLLAPSED_QUERY_PARAM);
  useEffect(() => {
    try {
      if (chatCollapsedSearchParam) {
        setChatCollapsed(JSON.parse(chatCollapsedSearchParam));
      }
    } catch (e) {
      setChatCollapsed(false);
      const queryParams = new URLSearchParams(searchParams.toString());
      queryParams.delete(CHAT_COLLAPSED_QUERY_PARAM);
      router.replace(`?${queryParams.toString()}`, { scroll: false });
    }
  }, [chatCollapsedSearchParam]);

  // Prevent editing when assignment is submitted
  useEffect(() => {
    if (
      phaseState === "submitted" ||
      activeAssignment?.status === "submitted" ||
      searchParams.get("readonly") === "1"
    ) {
      setIsEditing(false);
      if (phaseState !== "submitted") {
        setPhaseState("submitted");
      }
    }
  }, [phaseState, activeAssignment?.status, searchParams, setPhaseState]);

  const handleSubmitClick = () => {
    setSubmitDialogOpen(true);
  };

  const handleSubmitConfirm = async () => {
    setIsSubmitting(true);
    try {
      const result = await submitAssignment();
      setSubmitResult(result);
      setSubmitDialogOpen(false);
    } catch (error) {
      toast({
        title: "Submission failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to submit assignment. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbandonConfirm = async () => {
    setIsAbandoning(true);
    try {
      const client = createClient();
      const threadIdVal = threadId;

      if (threadIdVal) {
        // Delete the thread entirely so abandoned data doesn't clutter storage
        await client.threads.delete(threadIdVal);

        // Clear the cached thread ID so we don't 404 on next load
        try {
          const cache = JSON.parse(
            localStorage.getItem("oc_thread_cache") || "{}"
          );
          for (const key of Object.keys(cache)) {
            if (cache[key] === threadIdVal) {
              delete cache[key];
            }
          }
          localStorage.setItem("oc_thread_cache", JSON.stringify(cache));
        } catch (_) {}
      }

      setAbandonDialogOpen(false);
      router.push(workspaceItem ? "/workspace" : "/student");
    } catch (error) {
      toast({
        title: "Failed to abandon assignment",
        description: "Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsAbandoning(false);
    }
  };

  const handleQuickStart = (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => {
    if (type === "code" && !language) {
      toast({
        title: "Language not selected",
        description: "Please select a language to continue",
        duration: 5000,
      });
      return;
    }
    setChatStarted(true);

    let artifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
    if (type === "code" && language) {
      artifactContent = {
        index: 1,
        type: "code",
        title: `Quick start ${type}`,
        code: getLanguageTemplate(language),
        language,
      };
    } else {
      artifactContent = {
        index: 1,
        type: "text",
        title: `Quick start ${type}`,
        fullMarkdown: "",
      };
    }

    const newArtifact: ArtifactV3 = {
      currentIndex: 1,
      contents: [artifactContent],
    };
    // Do not worry about existing items in state. This should
    // never occur since this action can only be invoked if
    // there are no messages/artifacts in the thread.
    setArtifact(newArtifact);
    setIsEditing(true);
  };

  return (
    <div className="flex h-screen flex-col">
      {editorBanner}
      {activeAssignment && (
        <>
          <AssignmentWorkspaceBanner
            assignment={activeAssignment}
            phaseState={phaseState}
            onSubmit={handleSubmitClick}
            onAbandon={() => setAbandonDialogOpen(true)}
            homeHref={workspaceItem ? "/workspace" : "/student"}
            homeLabel={workspaceItem ? "Workspace" : "Assignments"}
            methodHref={
              workspaceMethod
                ? publicMethodPageUrl(workspaceMethod.id)
                : undefined
            }
            methodLabel={workspaceMethod?.title || workspaceMethod?.id}
          />
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        </>
      )}
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatStarted && aiAssistanceEnabled && !assignmentId && (
          <NoSSRWrapper>
            <Suspense fallback={<div>Loading...</div>}>
              <ContentComposerChatInterface
                minimalCanvas={minimalCanvas}
                chatCollapsed={chatCollapsed}
                setChatCollapsed={(c) => {
                  setChatCollapsed(c);
                  const queryParams = new URLSearchParams(
                    searchParams.toString()
                  );
                  queryParams.set(
                    CHAT_COLLAPSED_QUERY_PARAM,
                    JSON.stringify(c)
                  );
                  router.replace(`?${queryParams.toString()}`, {
                    scroll: false,
                  });
                }}
                switchSelectedThreadCallback={(thread) => {
                  // Chat should only be "started" if there are messages present
                  if (
                    (thread.values as Record<string, any>)?.messages?.length
                  ) {
                    setChatStarted(true);
                    if (thread?.metadata?.customModelName) {
                      setModelName(
                        thread.metadata.customModelName as ALL_MODEL_NAMES
                      );
                    } else {
                      setModelName(getActiveDefaultModelName());
                    }

                    if (thread?.metadata?.modelConfig) {
                      setModelConfig(
                        (thread?.metadata?.customModelName ??
                          getActiveDefaultModelName()) as ALL_MODEL_NAMES,
                        (thread.metadata?.modelConfig ??
                          getActiveDefaultModelConfig()) as CustomModelConfig
                      );
                    } else {
                      setModelConfig(
                        getActiveDefaultModelName(),
                        getActiveDefaultModelConfig()
                      );
                    }
                  } else {
                    setChatStarted(false);
                  }
                }}
                setChatStarted={setChatStarted}
                hasChatStarted={chatStarted}
                handleQuickStart={handleQuickStart}
              />
            </Suspense>
          </NoSSRWrapper>
        )}
        {!chatStarted && assignmentId && aiAssistanceEnabled && (
          <CanvasLoading />
        )}
        {!chatCollapsed && chatStarted && aiAssistanceEnabled && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="transition-all duration-700 h-full min-h-0 mr-auto bg-gray-50/70 shadow-inner-right"
            id="chat-panel-main"
            order={1}
          >
            <NoSSRWrapper>
              <Suspense fallback={<div>Loading...</div>}>
                <ContentComposerChatInterface
                  minimalCanvas={minimalCanvas}
                  chatCollapsed={chatCollapsed}
                  setChatCollapsed={(c) => {
                    setChatCollapsed(c);
                    const queryParams = new URLSearchParams(
                      searchParams.toString()
                    );
                    queryParams.set(
                      CHAT_COLLAPSED_QUERY_PARAM,
                      JSON.stringify(c)
                    );
                    router.replace(`?${queryParams.toString()}`, {
                      scroll: false,
                    });
                  }}
                  switchSelectedThreadCallback={(thread) => {
                    // Chat should only be "started" if there are messages present
                    if (
                      (thread.values as Record<string, any>)?.messages?.length
                    ) {
                      setChatStarted(true);
                      if (thread?.metadata?.customModelName) {
                        setModelName(
                          thread.metadata.customModelName as ALL_MODEL_NAMES
                        );
                      } else {
                        setModelName(getActiveDefaultModelName());
                      }

                      if (thread?.metadata?.modelConfig) {
                        setModelConfig(
                          (thread?.metadata.customModelName ??
                            getActiveDefaultModelName()) as ALL_MODEL_NAMES,
                          (thread.metadata.modelConfig ??
                            getActiveDefaultModelConfig()) as CustomModelConfig
                        );
                      } else {
                        setModelConfig(
                          getActiveDefaultModelName(),
                          getActiveDefaultModelConfig()
                        );
                      }
                    } else {
                      setChatStarted(false);
                    }
                  }}
                  setChatStarted={setChatStarted}
                  hasChatStarted={chatStarted}
                  handleQuickStart={handleQuickStart}
                />
              </Suspense>
            </NoSSRWrapper>
          </ResizablePanel>
        )}

        {chatStarted && (
          <>
            {aiAssistanceEnabled && <ResizableHandle />}
            <ResizablePanel
              defaultSize={
                aiAssistanceEnabled ? (chatCollapsed ? 100 : 75) : 100
              }
              maxSize={85}
              minSize={50}
              id="canvas-panel"
              order={2}
              className="flex flex-row w-full"
            >
              <div className="w-full ml-auto">
                <Suspense fallback={<div>Loading...</div>}>
                  <ArtifactRenderer
                    minimalCanvas={minimalCanvas}
                    chatCollapsed={chatCollapsed}
                    setChatCollapsed={(c) => {
                      setChatCollapsed(c);
                      const queryParams = new URLSearchParams(
                        searchParams.toString()
                      );
                      queryParams.set(
                        CHAT_COLLAPSED_QUERY_PARAM,
                        JSON.stringify(c)
                      );
                      router.replace(`?${queryParams.toString()}`, {
                        scroll: false,
                      });
                    }}
                    setIsEditing={setIsEditing}
                    isEditing={isEditing}
                  />
                </Suspense>
              </div>
              <WebSearchResults
                open={webSearchResultsOpen}
                setOpen={setWebSearchResultsOpen}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {activeAssignment &&
        (() => {
          let wordCount = 0;
          if (artifact) {
            const content = artifact.contents.find(
              (c) => c.index === artifact.currentIndex
            );
            if (content?.type === "text" && content.fullMarkdown) {
              wordCount = content.fullMarkdown
                .split(/\s+/)
                .filter(Boolean).length;
            }
          }
          const messageCount = messages.filter(
            (m) => (m as any).type === "human"
          ).length;

          return (
            <>
              <SubmitAssignmentDialog
                open={submitDialogOpen}
                onOpenChange={setSubmitDialogOpen}
                onConfirm={handleSubmitConfirm}
                assignmentTitle={activeAssignment.title}
                wordCount={submitResult?.wordCount || wordCount}
                wordTarget={activeAssignment.wordTarget}
                messageCount={submitResult?.messageCount || messageCount}
                isSubmitting={isSubmitting}
              />
              <AbandonAssignmentDialog
                open={abandonDialogOpen}
                onOpenChange={setAbandonDialogOpen}
                onConfirm={handleAbandonConfirm}
                assignmentTitle={activeAssignment.title}
                isAbandoning={isAbandoning}
              />
            </>
          );
        })()}
    </div>
  );
}

export const Canvas = React.memo(CanvasComponent);
