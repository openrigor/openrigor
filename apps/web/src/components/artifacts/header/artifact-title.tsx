import { Save } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ArtifactTitleProps {
  title: string;
  isArtifactSaved: boolean;
  artifactUpdateFailed: boolean;
  onTitleChange?: (newTitle: string) => void;
}

export function ArtifactTitle(props: ArtifactTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(props.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(props.title);
  }, [props.title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== props.title && props.onTitleChange) {
      props.onTitleChange(trimmed);
    } else {
      setEditValue(props.title);
    }
  };

  const saveTooltip = props.isArtifactSaved
    ? "Saved"
    : props.artifactUpdateFailed
      ? "Failed to save"
      : "Saving";

  return (
    <div className="flex flex-row items-center gap-2 min-w-0">
      <span className="flex items-center">
        <TooltipProvider>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center"
              >
                <Save
                  className={cn(
                    "w-4 h-4",
                    !props.isArtifactSaved &&
                      !props.artifactUpdateFailed &&
                      "text-amber-500 animate-spin",
                    props.isArtifactSaved && "text-green-500",
                    props.artifactUpdateFailed && "text-red-500"
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{saveTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          className="text-base font-medium text-gray-700 bg-transparent border-b border-gray-300 outline-none w-full max-w-md"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") {
              setEditValue(props.title);
              setIsEditing(false);
            }
          }}
        />
      ) : (
        <h1
          className="text-base font-medium text-gray-700 line-clamp-1 cursor-text hover:text-gray-900"
          onClick={() => setIsEditing(true)}
          title="Click to edit title"
        >
          {props.title}
        </h1>
      )}
    </div>
  );
}
