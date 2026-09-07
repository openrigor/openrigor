import { ProgrammingLanguageOptions } from "@opencanvas/shared/types";
import { ThreadPrimitive, useThreadRuntime } from "@assistant-ui/react";
import NextImage from "next/image";
import { FC, useMemo } from "react";
import { TighterText } from "../ui/header";
import { NotebookPen } from "lucide-react";
import { ProgrammingLanguagesDropdown } from "../ui/programming-lang-dropdown";
import { Button } from "../ui/button";
import NoSSRWrapper from "../NoSSRWrapper";
import { useTranslations } from "next-intl";

const QUICK_START_PROMPTS_SEARCH = [
  "quickStartSearch1",
  "quickStartSearch2",
  "quickStartSearch3",
  "quickStartSearch4",
  "quickStartSearch5",
  "quickStartSearch6",
  "quickStartSearch7",
  "quickStartSearch8",
  "quickStartSearch9",
  "quickStartSearch10",
];

const QUICK_START_PROMPTS = [
  "quickStart1",
  "quickStart2",
  "quickStart3",
  "quickStart4",
  "quickStart5",
  "quickStart6",
  "quickStart7",
  "quickStart8",
  "quickStart9",
  "quickStart10",
  "quickStart11",
  "quickStart12",
  "quickStart13",
  "quickStart14",
];

export const TEACHER_ASSIGNMENT_PROMPT_KEYS = [
  "teacherAssignmentPrompt1",
  "teacherAssignmentPrompt2",
  "teacherAssignmentPrompt3",
  "teacherAssignmentPrompt4",
  "teacherAssignmentPrompt5",
  "teacherAssignmentPrompt6",
  "teacherAssignmentPrompt7",
  "teacherAssignmentPrompt8",
  "teacherAssignmentPrompt9",
  "teacherAssignmentPrompt10",
];

function getRandomPrompts(prompts: string[], count: number = 4): string[] {
  return [...prompts].sort(() => Math.random() - 0.5).slice(0, count);
}

interface QuickStartButtonsProps {
  handleQuickStart: (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => void;
  composer: React.ReactNode;
  searchEnabled: boolean;
  hideQuickStartButtons?: boolean;
  quickStartPrompts?: string[];
}

interface QuickStartPromptsProps {
  searchEnabled: boolean;
  quickStartPrompts?: string[];
}

const QuickStartPrompts = ({
  searchEnabled,
  quickStartPrompts,
}: QuickStartPromptsProps) => {
  const t = useTranslations("chat");
  const threadRuntime = useThreadRuntime();

  const handleClick = (text: string) => {
    threadRuntime.append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  const selectedPrompts = useMemo(
    () =>
      quickStartPrompts ||
      getRandomPrompts(
        (searchEnabled ? QUICK_START_PROMPTS_SEARCH : QUICK_START_PROMPTS).map(
          (key) => t(key)
        )
      ),
    [searchEnabled, quickStartPrompts, t]
  );

  return (
    <div className="flex flex-col w-full gap-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {selectedPrompts.map((prompt, index) => (
          <Button
            key={`quick-start-prompt-${index}`}
            onClick={() => handleClick(prompt)}
            variant="outline"
            className="min-h-[60px] w-full flex items-center justify-center p-6 whitespace-normal text-gray-500 hover:text-gray-700 transition-colors ease-in rounded-2xl"
          >
            <p className="text-center break-words text-sm font-normal">
              {prompt}
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
};

const QuickStartButtons = (props: QuickStartButtonsProps) => {
  const t = useTranslations("chat");
  const hideBlankCanvas = props.hideQuickStartButtons;

  const handleLanguageSubmit = (language: ProgrammingLanguageOptions) => {
    props.handleQuickStart("code", language);
  };

  return (
    <div className="flex flex-col gap-8 items-center justify-center w-full">
      {!hideBlankCanvas && (
        <div className="flex flex-col gap-6">
          <p className="text-gray-600 text-sm">{t("startBlankCanvas")}</p>
          <div className="flex flex-row gap-1 items-center justify-center w-full">
            <Button
              variant="outline"
              className="text-gray-500 hover:text-gray-700 transition-colors ease-in rounded-2xl flex items-center justify-center gap-2 w-[250px] h-[64px]"
              onClick={() => props.handleQuickStart("text")}
            >
              {t("newMarkdown")}
              <NotebookPen />
            </Button>
            <ProgrammingLanguagesDropdown handleSubmit={handleLanguageSubmit} />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-6 mt-2 w-full">
        <p className="text-gray-600 text-sm">{t("orWithMessage")}</p>
        {props.composer}
        <NoSSRWrapper>
          <QuickStartPrompts
            searchEnabled={props.searchEnabled}
            quickStartPrompts={props.quickStartPrompts}
          />
        </NoSSRWrapper>
      </div>
    </div>
  );
};

interface ThreadWelcomeProps {
  handleQuickStart: (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => void;
  composer: React.ReactNode;
  searchEnabled: boolean;
  hideQuickStartButtons?: boolean;
  quickStartPrompts?: string[];
}

export const ThreadWelcome: FC<ThreadWelcomeProps> = (
  props: ThreadWelcomeProps
) => {
  const t = useTranslations("chat");

  return (
    <ThreadPrimitive.Empty>
      <div className="flex items-center justify-center mt-16 w-full">
        <div className="text-center max-w-3xl w-full">
          <NextImage
            src="/openrigor.png"
            alt="OpenRigor Logo"
            width={96}
            height={96}
            className="mx-auto"
          />
          <TighterText className="mt-4 text-lg font-medium">
            {t("welcomePrompt")}
          </TighterText>
          <div className="mt-8 w-full">
            <QuickStartButtons
              composer={props.composer}
              handleQuickStart={props.handleQuickStart}
              searchEnabled={props.searchEnabled}
              hideQuickStartButtons={props.hideQuickStartButtons}
              quickStartPrompts={props.quickStartPrompts}
            />
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};
