import { ArtifactCodeV3, ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { Assistant } from "@langchain/langgraph-sdk";
import { Eye, EyeOff, PanelRightClose, Printer } from "lucide-react";
import { ReflectionsDialog } from "../../reflections-dialog/ReflectionsDialog";
import { ArtifactTitle } from "./artifact-title";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { CopyText } from "../components/CopyText";
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
  /**
   * Content passed to the header Copy button. Set only for text artifacts
   * (previously an in-canvas hover overlay, moved here next to Print).
   */
  copyContent?: ArtifactCodeV3 | ArtifactMarkdownV3;
  /** Raw-markdown toggle — header-bar variant (see TextRenderer toggleRef). */
  isRawView?: boolean;
  onToggleRawView?: () => void;
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
        {props.copyContent && (
          <CopyText currentArtifactContent={props.copyContent} />
        )}
        {props.onToggleRawView && (
          <TooltipIconButton
            tooltip={`View ${props.isRawView ? "rendered" : "raw"} markdown`}
            variant="outline"
            delayDuration={400}
            onClick={props.onToggleRawView}
            data-testid="toggle-raw-view"
          >
            {props.isRawView ? (
              <EyeOff className="w-5 h-5 text-gray-600" />
            ) : (
              <Eye className="w-5 h-5 text-gray-600" />
            )}
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
