"use client";

import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useWorkspaceItemOptional } from "@/contexts/WorkspaceItemContext";
import { ArtifactV3 } from "@opencanvas/shared/types";
import { useEffect, useRef } from "react";

/**
 * When an assignment is active, open a canvas workspace with starter markdown
 * and assignment-scoped agent instructions (via GraphContext systemPrompt).
 *
 * On resume (?threadId= present, or a persisted workspace item thread), the
 * canvas is restored from the existing thread state via GraphContext's
 * switchSelectedThread, so we skip reinitialisation.
 */
export function useAssignmentCanvasBootstrap() {
  const assignmentContext = useTeachingAssignmentOptional();
  const assignment = assignmentContext?.assignment;
  const { graphData } = useGraphContext();
  const { setThreadId, threadId } = useThreadContext();
  const workspaceItem = useWorkspaceItemOptional()?.item;
  const persistedThreadId =
    workspaceItem && "threadId" in workspaceItem
      ? workspaceItem.threadId
      : undefined;
  const submitted =
    assignment?.status === "submitted" ||
    (workspaceItem?.kind === "method_participant" &&
      workspaceItem.submission?.status === "submitted");
  const bootstrappedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!assignment) {
      bootstrappedIdRef.current = null;
      return;
    }

    const resumeThreadId = persistedThreadId ?? threadId;
    if (resumeThreadId) {
      bootstrappedIdRef.current = assignment.id;
      if (threadId !== resumeThreadId) {
        void setThreadId(resumeThreadId);
      }
      graphData.setChatStarted(true);
      if (submitted) {
        graphData.setPhaseState("submitted");
      }
      return;
    }

    bootstrappedIdRef.current = assignment.id;

    graphData.clearState();
    void setThreadId(null);

    const artifactContent = {
      index: 1,
      type: "text" as const,
      title: assignment.title,
      fullMarkdown: assignment.starterMarkdown ?? "",
    };
    const newArtifact: ArtifactV3 = {
      currentIndex: 1,
      contents: [artifactContent],
    };

    graphData.setArtifact(newArtifact);
    graphData.setUpdateRenderedArtifactRequired(true);
    graphData.setChatStarted(true);
    // Run once per assignment id; graphData handlers are not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignment.id only
  }, [assignment?.id, threadId, persistedThreadId, submitted]);

  return assignment;
}
