"use client";

import { SessionRecorder } from "@/tracking/SessionRecorder";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useUserContext } from "@/contexts/UserContext";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";

export function SessionRecorderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUserContext();
  const { threadId } = useThreadContext();
  const teachingAssignment = useTeachingAssignmentOptional();

  // Only enable tracking if we have a threadId
  const enabled =
    !!threadId &&
    teachingAssignment?.apparatusConfiguration?.tracking !== false;

  return (
    <SessionRecorder
      threadId={threadId || "unknown"}
      userId={user?.id}
      enabled={enabled}
    >
      {children}
    </SessionRecorder>
  );
}
