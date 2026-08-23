"use client";

import { Canvas } from "@/components/canvas";
import { Badge } from "@/components/ui/badge";
import { WorkspaceAssignmentProvider } from "@/contexts/TeachingAssignmentContext";
import { SessionRecorderWrapper } from "@/components/tracking/session-recorder-wrapper";
import type { MethodParticipantWorkspaceItem } from "@/lib/workspace/types";
import { methodParticipantAsAssignment } from "@/lib/workspace/thread-policy";
import { useSharedProviderLabel } from "@/lib/workspace/shared-provider";

export function MethodParticipantCanvas({
  item,
}: {
  item: MethodParticipantWorkspaceItem;
}) {
  const providerLabel = useSharedProviderLabel(item.id);

  return (
    <WorkspaceAssignmentProvider
      assignment={methodParticipantAsAssignment(item)}
    >
      <SessionRecorderWrapper>
        <Canvas
          editorBanner={
            providerLabel ? (
              <Badge variant="secondary" data-testid="shared-byok-badge">
                {providerLabel}
              </Badge>
            ) : undefined
          }
        />
      </SessionRecorderWrapper>
    </WorkspaceAssignmentProvider>
  );
}
