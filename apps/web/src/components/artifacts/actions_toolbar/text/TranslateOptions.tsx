import { UsaFlag, SpanishFlag, FrenchFlag } from "@/components/icons/flags";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import {
  LANGUAGE_LOCALES,
  type GraphInput,
  type LanguageLocale,
} from "@opencanvas/shared";

const TRANSLATION_LANGUAGE_BY_LOCALE: Record<
  LanguageLocale,
  NonNullable<GraphInput["language"]>
> = {
  en: "english",
  de: "de",
  fr: "french",
  es: "spanish",
  it: "it",
};

const LANGUAGE_ICON_BY_LOCALE: Partial<
  Record<LanguageLocale, () => React.ReactNode>
> = {
  en: UsaFlag,
  fr: FrenchFlag,
  es: SpanishFlag,
};

export interface TranslateOptionsProps {
  streamMessage: (params: GraphInput) => Promise<void>;
  handleClose: () => void;
}

export function TranslateOptions(props: TranslateOptionsProps) {
  const { streamMessage } = props;

  const handleSubmit = async (locale: LanguageLocale) => {
    props.handleClose();
    await streamMessage({
      language: TRANSLATION_LANGUAGE_BY_LOCALE[
        locale
      ] as GraphInput["language"],
    });
  };

  return (
    <div className="flex flex-col gap-3 items-center w-full">
      {LANGUAGE_LOCALES.map(({ code, label }) => {
        const Icon = LANGUAGE_ICON_BY_LOCALE[code];
        return (
          <TooltipIconButton
            key={code}
            tooltip={label}
            variant="ghost"
            className="transition-colors w-[36px] h-[36px]"
            delayDuration={400}
            onClick={async () => await handleSubmit(code)}
          >
            {Icon ? (
              <Icon />
            ) : (
              <span className="text-[10px] font-medium">{label}</span>
            )}
          </TooltipIconButton>
        );
      })}
    </div>
  );
}
