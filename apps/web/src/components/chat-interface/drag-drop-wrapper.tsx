import React, { DragEvent } from "react";
import { useComposer, useComposerRuntime } from "@assistant-ui/react";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

interface DragAndDropWrapperProps {
  children: React.ReactNode;
}

export function DragAndDropWrapper({ children }: DragAndDropWrapperProps) {
  const { toast } = useToast();
  const t = useTranslations("chat");
  const commonT = useTranslations("common");
  const disabled = useComposer((c) => !c.isEditing);
  const composerRuntime = useComposerRuntime();

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!disabled) {
      try {
        const files = Array.from(e.dataTransfer.files);
        const attachmentAccept = composerRuntime.getAttachmentAccept();
        const addAttachmentPromises = files.map(async (file) => {
          if (
            attachmentAccept === "*" ||
            attachmentAccept.split(",").some((t) => t.trim() === file.type)
          ) {
            await composerRuntime.addAttachment(file);
          } else {
            toast({
              title: t("incompatibleFileType"),
              description: (
                <div className="flex flex-col gap-1 text-pretty">
                  <p>{t("fileNotSupported", { fileName: file.name })}</p>
                  <p>{t("receivedType", { type: file.type })}</p>
                  <p>{t("mustBeOneOf")}</p>
                  <p className="font-mono text-wrap">
                    {attachmentAccept.split(",").join(", ")}
                  </p>
                </div>
              ),
              variant: "destructive",
              duration: 5000,
            });
          }
        });

        await Promise.all(addAttachmentPromises);
      } catch (e) {
        console.error(e);
        toast({
          title: commonT("error"),
          description: t("attachmentAddFailed"),
          variant: "destructive",
          duration: 5000,
        });
      }
    } else {
      toast({
        title: t("dragDropDisabled"),
        description: t("dragDropDisabledDescription"),
        duration: 5000,
      });
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      {children}
    </div>
  );
}
