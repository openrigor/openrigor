import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { Undo2, Redo2 } from "lucide-react";
import { useEffect, useState } from "react";

interface UndoRedoButtonsProps {
  editorRef: React.MutableRefObject<any | null>;
}

export function UndoRedoButtons(props: UndoRedoButtonsProps) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Poll undo/redo availability on editor changes
  useEffect(() => {
    const refValue = props.editorRef.current;
    // Handle both shapes: direct editor or { editor, getCursorPosition }
    const editor = refValue?.editor || refValue;
    if (!editor) return;

    const updateState = () => {
      // TipTap history extension exposes canUndo/canRedo
      // Access via editor._tiptapEditor (BlockNote wraps TipTap)
      try {
        const tiptapEditor = editor._tiptapEditor || editor;
        // ProseMirror history: check if undo/redo commands are available
        // TipTap's History extension adds these commands
        setCanUndo(tiptapEditor.can?.().undo?.() ?? false);
        setCanRedo(tiptapEditor.can?.().redo?.() ?? false);
      } catch {
        // Fallback: assume undo is possible if editor exists
        setCanUndo(true);
        setCanRedo(false);
      }
    };

    // Update on editor transactions
    editor._tiptapEditor?.on("transaction", updateState);
    updateState(); // Initial check

    return () => {
      editor._tiptapEditor?.off("transaction", updateState);
    };
  }, [props.editorRef]);

  const handleUndo = () => {
    const refValue = props.editorRef.current;
    const editor = refValue?.editor || refValue;
    if (!editor) return;
    try {
      // BlockNote wraps TipTap. Access the underlying TipTap editor.
      const tiptapEditor = editor._tiptapEditor || editor;
      tiptapEditor.commands.undo();
    } catch (e) {
      console.warn("Undo failed:", e);
    }
  };

  const handleRedo = () => {
    const refValue = props.editorRef.current;
    const editor = refValue?.editor || refValue;
    if (!editor) return;
    try {
      const tiptapEditor = editor._tiptapEditor || editor;
      tiptapEditor.commands.redo();
    } catch (e) {
      console.warn("Redo failed:", e);
    }
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <TooltipIconButton
        tooltip="Undo (Ctrl+Z)"
        side="left"
        variant="ghost"
        delayDuration={400}
        onClick={handleUndo}
        disabled={!canUndo}
        className="size-6 p-0.5"
      >
        <Undo2
          className={cn(
            "w-4 h-4",
            canUndo ? "text-gray-600" : "text-gray-300 opacity-50"
          )}
          aria-disabled={!canUndo}
        />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Redo (Ctrl+Y)"
        side="right"
        variant="ghost"
        delayDuration={400}
        onClick={handleRedo}
        disabled={!canRedo}
        className="size-6 p-0.5"
      >
        <Redo2
          className={cn(
            "w-4 h-4",
            canRedo ? "text-gray-600" : "text-gray-300 opacity-50"
          )}
          aria-disabled={!canRedo}
        />
      </TooltipIconButton>
    </div>
  );
}
