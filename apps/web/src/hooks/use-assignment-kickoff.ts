"use client";

import { useAssistantContext } from "@/contexts/AssistantContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";
import { useUserContext } from "@/contexts/UserContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import {
  buildAssignmentKickoffUserMessage,
  studentFirstNameFromUser,
} from "@/lib/teaching/assignment-prompt";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { HumanMessage } from "@langchain/core/messages";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

/** After assignment canvas loads, request the coach's opening chat message (LLM). */
export function useAssignmentKickoff() {
  const assignmentContext = useTeachingAssignmentOptional();
  const assignment = assignmentContext?.assignment;
  const apparatusConfiguration = assignmentContext?.apparatusConfiguration;
  const { user } = useUserContext();
  const { selectedAssistant } = useAssistantContext();
  const { graphData } = useGraphContext();
  const { threadId, getActiveThread, setThreadId } = useThreadContext();
  const kickedOffRef = useRef<string | null>(null);
  const aiAssistanceEnabled = apparatusConfiguration?.ai_assistance !== false;

  useEffect(() => {
    kickedOffRef.current = null;
  }, [assignment?.id]);

  useEffect(() => {
    if (!assignment || !user || !selectedAssistant) return;
    if (!aiAssistanceEnabled) return;
    if (!graphData.chatStarted || !graphData.artifact) return;
    if (graphData.messages.length > 0 || graphData.isStreaming) return;
    if (kickedOffRef.current === assignment.id) return;

    // If a threadId is present in the URL, this is a resume — skip kickoff.
    // The existing thread's messages/artifact will be restored by GraphContext's
    // switchSelectedThread handler.
    if (threadId) {
      kickedOffRef.current = assignment.id;
      return;
    }
    if (assignment.status === "submitted") {
      kickedOffRef.current = assignment.id;
      return;
    }

    void (async () => {
      try {
        // Safety net: never mint a new kickoff when incomplete richer work exists.
        // Submitted workspace assignments resume read-only instead of a fresh attempt.
        const existing = await getActiveThread(assignment.id);
        if (existing) {
          kickedOffRef.current = assignment.id;
          setThreadId(existing.thread_id);
          return;
        }
        // Empty incomplete kickoff: do not setThreadId here (would re-enter this
        // effect and skip streaming). createThread reuses it when streaming.

        const firstName = studentFirstNameFromUser(user);
        const kickoffHuman = new HumanMessage({
          id: uuidv4(),
          content: buildAssignmentKickoffUserMessage(firstName),
          additional_kwargs: {
            [OC_HIDE_FROM_UI_KEY]: true,
          },
        });

        graphData.setMessages([kickoffHuman]);
        await graphData.streamMessage({
          messages: [convertToOpenAIFormat(kickoffHuman)],
          next: "replyToGeneralInput",
          phase_state: "socratic",
        });
        kickedOffRef.current = assignment.id;
      } catch (e) {
        kickedOffRef.current = null;
        console.error("Assignment kickoff failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one kickoff per assignment open
  }, [
    assignment?.id,
    user?.id,
    selectedAssistant?.assistant_id,
    graphData.chatStarted,
    graphData.artifact,
    graphData.messages.length,
    graphData.isStreaming,
    threadId,
    aiAssistanceEnabled,
  ]);
}
