import { useGraphContext } from "@/contexts/GraphContext";
import { useToast } from "@/hooks/use-toast";
import { ProgrammingLanguageOptions } from "@opencanvas/shared/types";
import { ThreadPrimitive } from "@assistant-ui/react";
import { Thread as ThreadType } from "@langchain/langgraph-sdk";
import {
  ArrowDownIcon,
  BookOpen,
  PanelRightOpen,
  SquarePen,
} from "lucide-react";
import { Dispatch, FC, SetStateAction } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReflectionsDialog } from "../reflections-dialog/ReflectionsDialog";
import { useLangSmithLinkToolUI } from "../tool-hooks/LangSmithLinkToolUI";
import { TooltipIconButton } from "../ui/assistant-ui/tooltip-icon-button";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./messages";
import { TypingIndicator } from "./typing-indicator";
import ModelSelector from "./model-selector";
import { ThreadHistory } from "./thread-history";
import { ThreadWelcome } from "./welcome";
import { useUserContext } from "@/contexts/UserContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

export interface ThreadProps {
  userId: string | undefined;
  hasChatStarted: boolean;
  handleQuickStart: (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => void;
  setChatStarted: Dispatch<SetStateAction<boolean>>;
  switchSelectedThreadCallback: (thread: ThreadType) => void;
  searchEnabled: boolean;
  setChatCollapsed: (c: boolean) => void;
  minimalCanvas?: boolean;
  disabled?: boolean;
  hideQuickStartButtons?: boolean;
  quickStartPrompts?: string[];
}

export const Thread: FC<ThreadProps> = (props: ThreadProps) => {
  const {
    setChatStarted,
    hasChatStarted,
    handleQuickStart,
    switchSelectedThreadCallback,
  } = props;
  const minimalCanvas = props.minimalCanvas ?? true;
  const { toast } = useToast();
  const {
    graphData: { clearState, runId, feedbackSubmitted, setFeedbackSubmitted },
  } = useGraphContext();
  const { selectedAssistant } = useAssistantContext();
  const {
    modelName,
    setModelName,
    modelConfig,
    setModelConfig,
    modelConfigs,
    setThreadId,
  } = useThreadContext();
  const { user } = useUserContext();
  const teaching = useTeachingAssignmentOptional();
  const assignmentPrompt = teaching?.assignment?.prompt;

  // Render the LangSmith trace link
  useLangSmithLinkToolUI(false);

  const handleNewSession = async () => {
    if (!user) {
      toast({
        title: "User not found",
        description: "Failed to create thread without user",
        duration: 5000,
        variant: "destructive",
      });
      return;
    }

    // Remove the threadId param from the URL
    setThreadId(null);

    setModelName(modelName);
    setModelConfig(modelName, modelConfig);
    clearState();
    setChatStarted(false);
  };

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 w-full flex-col">
      {assignmentPrompt && (
        <TooltipProvider>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <div
                className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-gray-100 cursor-help"
                data-testid="assignment-chat-prompt"
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-xs text-muted-foreground line-clamp-3 text-left">
                  {assignmentPrompt}
                </p>
                {hasChatStarted && (
                  <TooltipIconButton
                    tooltip="Collapse Chat"
                    variant="ghost"
                    className="w-8 h-8 shrink-0"
                    delayDuration={400}
                    onClick={() => props.setChatCollapsed(true)}
                  >
                    <PanelRightOpen className="text-gray-600" />
                  </TooltipIconButton>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="max-w-md whitespace-normal text-xs"
            >
              {assignmentPrompt}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <div className="pr-3 pl-6 pt-3 pb-2 flex flex-row gap-4 items-center justify-between">
        <div className="flex items-center justify-start gap-2 text-gray-600">
          {!minimalCanvas && (
            <ThreadHistory
              switchSelectedThreadCallback={switchSelectedThreadCallback}
            />
          )}
          {!minimalCanvas && !hasChatStarted && (
            <ModelSelector
              modelName={modelName}
              setModelName={setModelName}
              modelConfig={modelConfig}
              setModelConfig={setModelConfig}
              modelConfigs={modelConfigs}
            />
          )}
        </div>
        {hasChatStarted ? (
          <div className="flex flex-row flex-1 gap-2 items-center justify-end">
            {!assignmentPrompt && (
              <TooltipIconButton
                tooltip="Collapse Chat"
                variant="ghost"
                className="w-8 h-8"
                delayDuration={400}
                onClick={() => props.setChatCollapsed(true)}
              >
                <PanelRightOpen className="text-gray-600" />
              </TooltipIconButton>
            )}
            {!minimalCanvas && (
              <TooltipIconButton
                tooltip="New chat"
                variant="ghost"
                className="w-8 h-8"
                delayDuration={400}
                onClick={handleNewSession}
              >
                <SquarePen className="text-gray-600" />
              </TooltipIconButton>
            )}
          </div>
        ) : !minimalCanvas ? (
          <div className="flex flex-row gap-2 items-center">
            <ReflectionsDialog selectedAssistant={selectedAssistant} />
          </div>
        ) : null}
      </div>
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto scroll-smooth bg-inherit px-4 pt-4">
        {!hasChatStarted && !minimalCanvas && (
          <ThreadWelcome
            handleQuickStart={handleQuickStart}
            composer={
              <Composer
                chatStarted={false}
                userId={props.userId}
                searchEnabled={props.searchEnabled}
                disabled={props.disabled}
              />
            }
            searchEnabled={props.searchEnabled}
            hideQuickStartButtons={props.hideQuickStartButtons}
            quickStartPrompts={props.quickStartPrompts}
          />
        )}
        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessage,
            AssistantMessage: (prop) => (
              <AssistantMessage
                {...prop}
                feedbackSubmitted={feedbackSubmitted}
                setFeedbackSubmitted={setFeedbackSubmitted}
                runId={runId}
              />
            ),
          }}
        />
        <TypingIndicator />
      </ThreadPrimitive.Viewport>
      <div className="mt-auto flex w-full shrink-0 flex-col items-center justify-end rounded-t-lg border-t bg-inherit px-4 pb-4 pt-3">
        <ThreadScrollToBottom />
        <div className="w-full max-w-2xl">
          {minimalCanvas ? (
            <Composer
              chatStarted={hasChatStarted}
              userId={props.userId}
              searchEnabled={props.searchEnabled}
              disabled={props.disabled}
              minimalCanvas
            />
          ) : (
            hasChatStarted && (
              <div className="flex flex-col space-y-2">
                <ModelSelector
                  modelName={modelName}
                  setModelName={setModelName}
                  modelConfig={modelConfig}
                  setModelConfig={setModelConfig}
                  modelConfigs={modelConfigs}
                />
                <Composer
                  chatStarted
                  userId={props.userId}
                  searchEnabled={props.searchEnabled}
                  disabled={props.disabled}
                />
              </div>
            )
          )}
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
};
