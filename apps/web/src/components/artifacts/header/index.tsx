import { ReflectionsDialog } from "../../reflections-dialog/ReflectionsDialog";
import { ArtifactTitle } from "./artifact-title";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { ArtifactCodeV3, ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { Assistant } from "@langchain/langgraph-sdk";
import { PanelRightClose, Printer } from "lucide-react";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";

interface ArtifactHeaderProps {
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
  isArtifactSaved: boolean;
  selectedAssistant: Assistant | undefined;
  artifactUpdateFailed: boolean;
  chatCollapsed: boolean;
  setChatCollapsed: (c: boolean) => void;
  blockNoteEditorRef?: React.MutableRefObject<any | null>;
  onTitleChange?: (newTitle: string) => void;
  onPrint?: () => void;
  minimalCanvas?: boolean;
}

export function ArtifactHeader(props: ArtifactHeaderProps) {
  return (
    <div className="flex flex-row items-center justify-between px-4 py-1.5 border-b border-gray-100">
      <div className="flex flex-row items-center gap-2 min-w-0">
        {props.chatCollapsed && (
          <TooltipIconButton
            tooltip="Expand Chat"
            variant="ghost"
            className="w-8 h-8 shrink-0"
            delayDuration={400}
            onClick={() => props.setChatCollapsed(false)}
          >
            <PanelRightClose className="text-gray-600" />
          </TooltipIconButton>
        )}
        <ArtifactTitle
          title={props.currentArtifactContent.title}
          isArtifactSaved={props.isArtifactSaved}
          artifactUpdateFailed={props.artifactUpdateFailed}
          onTitleChange={props.onTitleChange}
        />
      </div>
      <div className="flex gap-1 items-center shrink-0">
        {props.onPrint && (
          <TooltipIconButton
            tooltip="Print canvas"
            variant="ghost"
            className="w-8 h-8"
            delayDuration={400}
            onClick={props.onPrint}
          >
            <Printer className="w-4 h-4 text-gray-600" />
          </TooltipIconButton>
        )}
        {props.blockNoteEditorRef && (
          <UndoRedoButtons editorRef={props.blockNoteEditorRef} />
        )}
        {!props.minimalCanvas && (
          <ReflectionsDialog selectedAssistant={props.selectedAssistant} />
        )}
      </div>
    </div>
  );
}
