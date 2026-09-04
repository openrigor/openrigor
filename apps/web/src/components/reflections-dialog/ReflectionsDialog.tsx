"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { BrainCog, Loader } from "lucide-react";
import { ConfirmClearDialog } from "./ConfirmClearDialog";
import { TooltipIconButton } from "../ui/assistant-ui/tooltip-icon-button";
import { TighterText } from "../ui/header";
import { useStore } from "@/hooks/useStore";
import { useToast } from "@/hooks/use-toast";
import { Assistant } from "@langchain/langgraph-sdk";
import { Badge } from "../ui/badge";
import { getIcon } from "../assistant-select/utils";

export interface NoReflectionsProps {
  selectedAssistant: Assistant | undefined;
  getReflections: (assistantId: string) => Promise<void>;
}

function NoReflections(props: NoReflectionsProps) {
  const t = useTranslations("reflections");
  const { selectedAssistant } = props;
  const { toast } = useToast();

  const getReflections = async () => {
    if (!selectedAssistant) {
      toast({
        title: t("error"),
        description: t("assistantIdNotFound"),
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    await props.getReflections(selectedAssistant.assistant_id);
  };

  return (
    <div className="flex flex-col items-center mt-6 mb-[-24px] gap-3">
      <TighterText>{t("noReflectionsYet")}</TighterText>
      <TighterText className="text-sm text-gray-500">
        {t("reflectionsInactivity")}
      </TighterText>
      <Button onClick={getReflections} variant="secondary" size="sm">
        <TighterText>{t("searchReflections")}</TighterText>
      </Button>
    </div>
  );
}

interface ReflectionsDialogProps {
  selectedAssistant: Assistant | undefined;
}

export function ReflectionsDialog(props: ReflectionsDialogProps) {
  const t = useTranslations("reflections");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { selectedAssistant } = props;
  const {
    isLoadingReflections,
    reflections,
    getReflections,
    deleteReflections,
  } = useStore();

  useEffect(() => {
    if (!selectedAssistant || typeof window === "undefined") return;
    // Don't re-fetch reflections if they already exist & are for the same assistant
    if (
      (reflections?.content || reflections?.styleRules) &&
      reflections.assistantId === selectedAssistant.assistant_id
    )
      return;

    getReflections(selectedAssistant.assistant_id);
  }, [selectedAssistant]);

  const handleDelete = async () => {
    if (!selectedAssistant) {
      toast({
        title: t("error"),
        description: t("assistantIdNotFound"),
        variant: "destructive",
        duration: 5000,
      });
      return false;
    }
    setOpen(false);
    return await deleteReflections(selectedAssistant.assistant_id);
  };

  const iconData = (selectedAssistant?.metadata as Record<string, any>)
    ?.iconData;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TooltipIconButton
          tooltip={t("reflections")}
          variant="ghost"
          className="w-fit h-fit p-2"
          onClick={() => setOpen(true)}
        >
          <BrainCog className="w-6 h-6 text-gray-600" />
        </TooltipIconButton>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-8 bg-white rounded-lg shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <TighterText className="text-3xl font-light text-gray-800">
              {t("reflections")}
            </TighterText>
            {selectedAssistant && (
              <Badge
                style={{
                  ...(iconData
                    ? {
                        color: iconData.iconColor,
                        backgroundColor: `${iconData.iconColor}20`, // 33 in hex is ~20% opacity
                      }
                    : {
                        color: "#000000",
                        backgroundColor: "#00000020",
                      }),
                }}
                className="flex items-center justify-center gap-2 px-2 py-1"
              >
                <span className="flex items-center justify-start w-4 h-4">
                  {getIcon(
                    (selectedAssistant?.metadata as Record<string, any>)
                      ?.iconData?.iconName
                  )}
                </span>
                {selectedAssistant?.name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="mt-2 text-md font-light text-gray-600">
            <TighterText>
              {isLoadingReflections ? (
                t("loadingReflections")
              ) : reflections?.content || reflections?.styleRules ? (
                t("currentReflectionsDescription")
              ) : (
                <NoReflections
                  selectedAssistant={selectedAssistant}
                  getReflections={getReflections}
                />
              )}
            </TighterText>
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 max-h-[60vh] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {isLoadingReflections ? (
            <div className="flex justify-center items-center h-32">
              <Loader className="h-8 w-8 animate-spin" />
            </div>
          ) : reflections?.content || reflections?.styleRules ? (
            <>
              {reflections?.styleRules && (
                <div className="mb-6">
                  <TighterText className="text-xl font-light text-gray-800 sticky top-0 bg-white py-2 mb-3">
                    {t("styleReflections")}
                  </TighterText>
                  <ul className="list-disc list-inside space-y-2">
                    {reflections.styleRules?.map((rule, index) => (
                      <li key={index} className="flex items-baseline">
                        <span className="mr-2">•</span>
                        <TighterText className="text-gray-600 font-light">
                          {rule}
                        </TighterText>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reflections?.content && (
                <div className="mb-6">
                  <TighterText className="text-xl font-light text-gray-800 sticky top-0 bg-white py-2 mb-3">
                    {t("contentReflections")}
                  </TighterText>
                  <ul className="list-disc list-inside space-y-2">
                    {reflections.content.map((rule, index) => (
                      <li key={index} className="flex items-baseline">
                        <span className="mr-2">•</span>
                        <TighterText className="text-gray-600 font-light">
                          {rule}
                        </TighterText>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
        <div className="mt-6 flex justify-between">
          {reflections?.content || reflections?.styleRules ? (
            <ConfirmClearDialog handleDeleteReflections={handleDelete} />
          ) : null}
          <Button
            onClick={() => setOpen(false)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded shadow transition"
          >
            <TighterText>{t("close")}</TighterText>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
