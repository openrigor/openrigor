"use client";

import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { type FC, useState, useEffect } from "react";

import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { SendHorizontalIcon } from "lucide-react";
import { DragAndDropWrapper } from "./drag-drop-wrapper";
import { ComposerAttachments } from "../assistant-ui/attachment";
import { ComposerActionsPopOut } from "./composer-actions-popout";
import { useTranslations } from "next-intl";

const GENERIC_PLACEHOLDERS = [
  "genericPlaceholder1",
  "genericPlaceholder2",
  "genericPlaceholder3",
  "genericPlaceholder4",
  "genericPlaceholder5",
  "genericPlaceholder6",
  "genericPlaceholder7",
  "genericPlaceholder8",
  "genericPlaceholder9",
  "genericPlaceholder10",
];

const SEARCH_PLACEHOLDERS = [
  "searchPlaceholder1",
  "searchPlaceholder2",
  "searchPlaceholder3",
  "searchPlaceholder4",
  "searchPlaceholder5",
  "searchPlaceholder6",
  "searchPlaceholder7",
  "searchPlaceholder8",
  "searchPlaceholder9",
  "searchPlaceholder10",
];

const getRandomPlaceholder = (
  searchEnabled: boolean,
  translate: (key: string) => string
) => {
  const placeholders = searchEnabled
    ? SEARCH_PLACEHOLDERS
    : GENERIC_PLACEHOLDERS;
  return translate(
    placeholders[Math.floor(Math.random() * placeholders.length)]
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};

interface ComposerProps {
  chatStarted: boolean;
  userId: string | undefined;
  searchEnabled: boolean;
  disabled?: boolean;
  minimalCanvas?: boolean;
}

export const Composer: FC<ComposerProps> = (props: ComposerProps) => {
  const [placeholder, setPlaceholder] = useState("");
  const t = useTranslations("chat");
  const commonT = useTranslations("common");

  useEffect(() => {
    setPlaceholder(getRandomPlaceholder(props.searchEnabled, t));
  }, [props.searchEnabled, t]);

  if (props.disabled) {
    return (
      <div className="flex flex-col w-full min-h-[64px] items-center justify-center border px-2.5 shadow-sm bg-muted/50 rounded-2xl">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-sm">{t("assignmentSubmittedReadOnly")}</span>
        </div>
      </div>
    );
  }

  return (
    <DragAndDropWrapper>
      <ComposerPrimitive.Root className="focus-within:border-aui-ring/20 flex flex-col w-full min-h-[64px] flex-wrap items-center justify-center border px-2.5 shadow-sm transition-colors ease-in bg-white rounded-2xl">
        <div className="flex flex-wrap gap-2 items-start mr-auto">
          <ComposerAttachments />
        </div>

        <div className="flex flex-row w-full items-center justify-start my-auto">
          {!props.minimalCanvas && (
            <ComposerActionsPopOut
              userId={props.userId}
              chatStarted={props.chatStarted}
            />
          )}
          <ComposerPrimitive.Input
            autoFocus
            placeholder={placeholder}
            rows={1}
            className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
            data-tracking-id="chat-input"
            data-testid="chat-input"
            disabled={props.disabled}
          />
          {!props.disabled && (
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send asChild>
                <TooltipIconButton
                  tooltip={t("send")}
                  variant="default"
                  className="my-2.5 size-8 p-2 transition-opacity ease-in"
                >
                  <SendHorizontalIcon />
                </TooltipIconButton>
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
          )}
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel asChild>
              <TooltipIconButton
                tooltip={commonT("cancel")}
                variant="default"
                className="my-2.5 size-8 p-2 transition-opacity ease-in"
              >
                <CircleStopIcon />
              </TooltipIconButton>
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
    </DragAndDropWrapper>
  );
};
