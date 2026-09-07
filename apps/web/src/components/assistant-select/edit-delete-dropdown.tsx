import { Dispatch, SetStateAction, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Assistant } from "@langchain/langgraph-sdk";
import { useToast } from "@/hooks/use-toast";
import { TooltipIconButton } from "../ui/assistant-ui/tooltip-icon-button";
import styles from "./edit-delete-dropdown.module.css";

interface EditDeleteDropdownProps {
  setEditModalOpen: Dispatch<SetStateAction<boolean>>;
  deleteAssistant: (assistantId: string) => Promise<boolean>;
  setAssistantDropdownOpen: Dispatch<SetStateAction<boolean>>;
  setEditingAssistant: Dispatch<SetStateAction<Assistant | undefined>>;
  selectedAssistant: Assistant;
  disabled: boolean;
  allowDelete: boolean;
  setDisabled: Dispatch<SetStateAction<boolean>>;
}

export function EditDeleteDropdown({
  setEditModalOpen,
  setEditingAssistant,
  deleteAssistant,
  setAssistantDropdownOpen,
  setDisabled,
  allowDelete,
  selectedAssistant,
  disabled,
}: EditDeleteDropdownProps) {
  const t = useTranslations("assistant");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const tooltipText = allowDelete ? t("editDelete") : t("edit");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <TooltipIconButton
          disabled={disabled}
          tooltip={tooltipText}
          variant="ghost"
          delayDuration={200}
          className="w-8 h-8"
        >
          <EllipsisVertical className="w-4 h-4" />
        </TooltipIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={styles.dropdownContent}>
        <DropdownMenuItem
          onClick={() => {
            setEditingAssistant(selectedAssistant);
            setEditModalOpen(true);
          }}
          className="w-8"
          disabled={disabled}
        >
          <Pencil className="text-gray-600 hover:text-black transition-colors ease-in-out duration-200" />
        </DropdownMenuItem>
        {allowDelete && (
          <DropdownMenuItem
            onClick={async () => {
              setDisabled(true);
              const res = await deleteAssistant(selectedAssistant.assistant_id);
              if (res) {
                toast({
                  title: t("assistantDeleted"),
                  duration: 5000,
                });
              } else {
                toast({
                  title: t("error"),
                  description: t("failedToDeleteAssistant"),
                  variant: "destructive",
                  duration: 5000,
                });
              }
              setDisabled(false);
              setOpen(false);
              setAssistantDropdownOpen(false);
            }}
            disabled={disabled}
            className="w-8"
          >
            <Trash2 className="text-gray-600 hover:text-red-500 transition-colors ease-in-out duration-200" />
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
