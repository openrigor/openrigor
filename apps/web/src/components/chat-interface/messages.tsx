"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getExternalStoreMessage,
  MessagePrimitive,
  MessageState,
  useMessage,
} from "@assistant-ui/react";
import React, { Dispatch, SetStateAction, type FC } from "react";

import { MarkdownText } from "@/components/ui/assistant-ui/markdown-text";
import { ContextDocumentsUI } from "../tool-hooks/AttachmentsToolUI";
import { HumanMessage } from "@langchain/core/messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { Button } from "../ui/button";
import { WEB_SEARCH_RESULTS_QUERY_PARAM } from "@/constants";
import { Globe } from "lucide-react";
import { useQueryState } from "nuqs";

interface AssistantMessageProps {
  runId: string | undefined;
  feedbackSubmitted: boolean;
  setFeedbackSubmitted: Dispatch<SetStateAction<boolean>>;
}

const ThinkingAssistantMessageComponent = ({
  message,
}: {
  message: MessageState;
}): React.ReactElement => {
  const { id, content } = message;
  let contentText = "";
  if (typeof content === "string") {
    contentText = content;
  } else {
    const firstItem = content?.[0];
    if (firstItem?.type === "text") {
      contentText = firstItem.text;
    }
  }

  if (contentText === "") {
    return <></>;
  }

  return (
    <Accordion
      defaultValue={`accordion-${id}`}
      type="single"
      collapsible
      className="w-full"
    >
      <AccordionItem value={`accordion-${id}`}>
        <AccordionTrigger>Thoughts</AccordionTrigger>
        <AccordionContent>{contentText}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const ThinkingAssistantMessage = React.memo(ThinkingAssistantMessageComponent);

const WebSearchMessageComponent = ({ message }: { message: MessageState }) => {
  const [_, setShowWebResultsId] = useQueryState(
    WEB_SEARCH_RESULTS_QUERY_PARAM
  );

  const handleShowWebSearchResults = () => {
    if (!message.id) {
      return;
    }

    setShowWebResultsId(message.id);
  };

  return (
    <div className="flex mx-8">
      <Button
        onClick={handleShowWebSearchResults}
        variant="secondary"
        className="bg-blue-50 hover:bg-blue-100 transition-all ease-in-out duration-200 w-full"
      >
        <Globe className="size-4 mr-2" />
        Web Search Results
      </Button>
    </div>
  );
};

const WebSearchMessage = React.memo(WebSearchMessageComponent);

export const AssistantMessage: FC<AssistantMessageProps> = ({
  runId: _runId,
  feedbackSubmitted: _feedbackSubmitted,
  setFeedbackSubmitted: _setFeedbackSubmitted,
}) => {
  const message = useMessage();
  const isThinkingMessage = message.id.startsWith("thinking-");
  const isWebSearchMessage = message.id.startsWith("web-search-results-");

  if (isThinkingMessage) {
    return <ThinkingAssistantMessage message={message} />;
  }

  if (isWebSearchMessage) {
    return <WebSearchMessage message={message} />;
  }

  return (
    <MessagePrimitive.Root className="relative w-full max-w-2xl py-4">
      <div className="text-foreground max-w-xl break-words leading-7">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
};

export const UserMessage: FC = () => {
  const msg = useMessage(getExternalStoreMessage<HumanMessage>);
  const humanMessage = Array.isArray(msg) ? msg[0] : msg;

  if (humanMessage?.additional_kwargs?.[OC_HIDE_FROM_UI_KEY]) return null;

  return (
    <MessagePrimitive.Root className="grid w-full max-w-2xl auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 py-4">
      <ContextDocumentsUI
        message={humanMessage}
        className="col-start-2 row-start-1"
      />
      <div className="bg-muted text-foreground col-start-2 row-start-2 max-w-xl break-words rounded-3xl px-5 py-2.5">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
};
