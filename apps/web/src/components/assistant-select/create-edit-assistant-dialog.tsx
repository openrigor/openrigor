"use client";

import {
  CreateCustomAssistantArgs,
  EditCustomAssistantArgs,
} from "@/contexts/AssistantContext";
import { Assistant } from "@langchain/langgraph-sdk";
import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { TighterText } from "../ui/header";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import React, { Suspense, lazy } from "react";
const IconSelect = lazy(() =>
  import("./icon-select").then((mod) => ({ default: mod.IconSelect }))
);
import { useToast } from "@/hooks/use-toast";
import { ColorPicker } from "./color-picker";
import { Textarea } from "../ui/textarea";
import { InlineContextTooltip } from "../ui/inline-context-tooltip";
import { useStore } from "@/hooks/useStore";
import { arrayToFileList, contextDocumentToFile } from "@/lib/attachments";
import { ContextDocuments } from "./context-documents";
import { useContextDocuments } from "@/hooks/useContextDocuments";
import { useTranslations } from "next-intl";

interface CreateEditAssistantDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  userId: string | undefined;
  isEditing: boolean;
  assistant?: Assistant;
  createCustomAssistant: ({
    newAssistant,
    userId,
    successCallback,
  }: CreateCustomAssistantArgs) => Promise<Assistant | undefined>;
  editCustomAssistant: ({
    editedAssistant,
    assistantId,
    userId,
  }: EditCustomAssistantArgs) => Promise<Assistant | undefined>;
  isLoading: boolean;
  allDisabled: boolean;
  setAllDisabled: Dispatch<SetStateAction<boolean>>;
}

const GH_DISCUSSION_URL = `https://github.com/langchain-ai/open-canvas/discussions/182`;

const SystemPromptWhatsThis = (): React.ReactNode => {
  const t = useTranslations("assistant");
  return (
    <span className="flex flex-col gap-1 text-sm text-gray-600">
      <p>{t("systemPromptDescription")}</p>
      <p>
        {t("systemPromptFeedback")}{" "}
        <a href={GH_DISCUSSION_URL} target="_blank">
          {t("githubDiscussion")}
        </a>
        .
      </p>
    </span>
  );
};

export function CreateEditAssistantDialog(
  props: CreateEditAssistantDialogProps
) {
  const t = useTranslations("assistant");
  const { putContextDocuments, getContextDocuments } = useStore();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [iconName, setIconName] = useState<string>("User");
  const [hasSelectedIcon, setHasSelectedIcon] = useState(false);
  const [iconColor, setIconColor] = useState("#000000");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);
  const {
    documents,
    setDocuments,
    urls,
    setUrls,
    loadingDocuments,
    setLoadingDocuments,
    processDocuments,
    setProcessedContextDocuments,
  } = useContextDocuments(props.userId || "");

  const metadata = props.assistant?.metadata as Record<string, any> | undefined;

  useEffect(() => {
    if (props.assistant && props.isEditing) {
      setName(props.assistant?.name || "");
      setDescription(metadata?.description || "");
      setSystemPrompt(
        (props.assistant?.config?.configurable?.systemPrompt as
          | string
          | undefined) || ""
      );
      setHasSelectedIcon(true);
      setIconName(metadata?.iconData?.iconName || "User");
      setIconColor(metadata?.iconData?.iconColor || "#000000");
      setLoadingDocuments(true);
      getContextDocuments(props.assistant.assistant_id)
        .then((documents) => {
          if (documents) {
            const files = documents
              .filter((d) => !d.metadata?.url)
              .map(contextDocumentToFile);

            const urls = documents
              .filter((d) => d.metadata?.url)
              .map((d) => d.metadata?.url);

            setProcessedContextDocuments(
              new Map(
                documents.map((d) => {
                  if (d.metadata?.url) {
                    return [d.metadata?.url, d];
                  } else {
                    return [d.name, d];
                  }
                })
              )
            );

            setUrls(urls);
            setDocuments(arrayToFileList(files));
          }
        })
        .finally(() => setLoadingDocuments(false));
    } else if (!props.isEditing) {
      setName("");
      setDescription("");
      setSystemPrompt("");
      setIconName("User");
      setIconColor("#000000");
      setDocuments(undefined);
      setUrls([]);
    }
  }, [props.assistant, props.isEditing]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!props.userId) {
      toast({
        title: t("userNotFound"),
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    if (props.isEditing && !props.assistant) {
      toast({
        title: t("assistantNotFound"),
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    props.setAllDisabled(true);

    const contentDocuments = await processDocuments();

    let success: boolean;
    if (props.isEditing && props.assistant) {
      const updatedAssistant = await props.editCustomAssistant({
        editedAssistant: {
          name,
          description,
          systemPrompt,
          iconData: {
            iconName,
            iconColor,
          },
        },
        assistantId: props.assistant.assistant_id,
        userId: props.userId,
      });
      success = !!updatedAssistant;
      if (updatedAssistant) {
        await putContextDocuments({
          assistantId: props.assistant.assistant_id,
          documents: contentDocuments,
        });
      }
    } else {
      const assistant = await props.createCustomAssistant({
        newAssistant: {
          name,
          description,
          systemPrompt,
          iconData: {
            iconName,
            iconColor,
          },
        },
        userId: props.userId,
      });
      success = !!assistant;
      if (assistant) {
        await putContextDocuments({
          assistantId: assistant.assistant_id,
          documents: contentDocuments,
        });
      }
    }

    if (success) {
      toast({
        title: props.isEditing ? t("assistantEdited") : t("assistantCreated"),
        duration: 5000,
      });
    } else {
      toast({
        title: props.isEditing
          ? t("failedToEditAssistant")
          : t("failedToCreateAssistant"),
        variant: "destructive",
        duration: 5000,
      });
    }
    props.setAllDisabled(false);
    props.setOpen(false);
  };

  const handleResetState = () => {
    setName("");
    setDescription("");
    setSystemPrompt("");
    setIconName("User");
    setIconColor("#000000");
  };

  const handleRemoveFile = (index: number) => {
    setDocuments((prev) => {
      if (!prev) return prev;
      const files = Array.from(prev);
      const newFiles = files.filter((_, i) => i !== index);
      return arrayToFileList(newFiles);
    });
  };

  if (props.isEditing && !props.assistant) {
    return null;
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(change) => {
        if (!change) {
          handleResetState();
        }
        props.setOpen(change);
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] p-8 bg-white rounded-lg shadow-xl min-w-[70vw] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <DialogHeader>
          <DialogTitle className="text-3xl font-light text-gray-800">
            <TighterText>
              {props.isEditing ? t("edit") : t("create")} {t("assistant")}
            </TighterText>
          </DialogTitle>
          <DialogDescription className="mt-2 text-md font-light text-gray-600">
            <TighterText>{t("assistantDescription")}</TighterText>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => handleSubmit(e)}
          className="flex flex-col items-start justify-start gap-4 w-full"
        >
          <Label htmlFor="name">
            <TighterText>
              {t("name")} <span className="text-red-500">*</span>
            </TighterText>
          </Label>
          <Input
            disabled={props.allDisabled}
            required
            id="name"
            placeholder={t("workEmailsPlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Label htmlFor="description">
            <TighterText>{t("description")}</TighterText>
          </Label>
          <Input
            disabled={props.allDisabled}
            required={false}
            id="description"
            placeholder={t("assistantDescriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Label htmlFor="system-prompt">
            <TighterText className="flex items-center">
              {t("systemPrompt")}
              <InlineContextTooltip cardContentClassName="w-[500px] ml-10">
                <SystemPromptWhatsThis />
              </InlineContextTooltip>
            </TighterText>
          </Label>
          <Textarea
            disabled={props.allDisabled}
            required={false}
            id="system-prompt"
            placeholder={t("systemPromptPlaceholder")}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
          />

          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-col gap-4 items-start justify-start w-full">
              <Label htmlFor="icon">
                <TighterText>{t("icon")}</TighterText>
              </Label>
              <Suspense
                fallback={
                  <div className="h-10 w-full animate-pulse bg-gray-200 dark:bg-gray-800 rounded" />
                }
              >
                <IconSelect
                  allDisabled={props.allDisabled}
                  iconColor={iconColor}
                  selectedIcon={iconName}
                  setSelectedIcon={(i) => {
                    setHasSelectedIcon(true);
                    setIconName(i);
                  }}
                  hasSelectedIcon={hasSelectedIcon}
                />
              </Suspense>
            </div>
            <div className="flex flex-col gap-4 items-start justify-start w-full">
              <Label htmlFor="description">
                <TighterText>{t("color")}</TighterText>
              </Label>
              <div className="flex gap-1 items-center justify-start w-full">
                <ColorPicker
                  disabled={props.allDisabled}
                  iconColor={iconColor}
                  setIconColor={setIconColor}
                  showColorPicker={showColorPicker}
                  setShowColorPicker={setShowColorPicker}
                  hoverTimer={hoverTimer}
                  setHoverTimer={setHoverTimer}
                />
                <Input
                  disabled={props.allDisabled}
                  required={false}
                  id="description"
                  placeholder={t("colorPlaceholder")}
                  value={iconColor}
                  onChange={(e) => {
                    if (!e.target.value.startsWith("#")) {
                      setIconColor("#" + e.target.value);
                    } else {
                      setIconColor(e.target.value);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <ContextDocuments
            documents={documents}
            setDocuments={setDocuments}
            loadingDocuments={loadingDocuments}
            allDisabled={props.allDisabled}
            handleRemoveFile={handleRemoveFile}
            urls={urls}
            setUrls={setUrls}
          />

          <div className="flex items-center justify-center w-full mt-4 gap-3">
            <Button
              disabled={props.allDisabled}
              className="w-full"
              type="submit"
            >
              <TighterText>{t("save")}</TighterText>
            </Button>
            <Button
              disabled={props.allDisabled}
              onClick={() => {
                handleResetState();
                props.setOpen(false);
              }}
              variant="destructive"
              className="w-[20%]"
              type="button"
            >
              <TighterText>{t("cancel")}</TighterText>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
