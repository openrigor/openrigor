import { UsaFlag, SpanishFlag, FrenchFlag } from "@/components/icons/flags";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { GraphInput } from "@opencanvas/shared/types";
import { LOCALES, type LocaleCode } from "@/lib/i18n/locales";

// E3 (#98) will replace the graph's current translation-language union.
const TRANSLATION_LANGUAGE_BY_LOCALE: Record<LocaleCode, string> = {
  en: "english",
  de: "german",
  fr: "french",
  es: "spanish",
  it: "italian",
};

const LANGUAGE_ICON_BY_LOCALE: Partial<
  Record<LocaleCode, () => React.ReactNode>
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

  const handleSubmit = async (locale: LocaleCode) => {
    props.handleClose();
    await streamMessage({
      language: TRANSLATION_LANGUAGE_BY_LOCALE[
        locale
      ] as GraphInput["language"],
    });
  };

  return (
    <div className="flex flex-col gap-3 items-center w-full">
      {LOCALES.map(({ code, label }) => {
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
