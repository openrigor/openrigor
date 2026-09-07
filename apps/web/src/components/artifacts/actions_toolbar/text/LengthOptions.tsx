import { cn } from "@/lib/utils";
import { useState } from "react";
import { ArtifactLengthOptions } from "@opencanvas/shared/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { GraphInput } from "@opencanvas/shared/types";
import { useTranslations } from "next-intl";

export interface LengthOptionsProps {
  streamMessage: (params: GraphInput) => Promise<void>;
  handleClose: () => void;
}

const lengthOptions = [
  { value: 1, key: "shortest" },
  { value: 2, key: "shorter" },
  { value: 3, key: "currentLength" },
  { value: 4, key: "long" },
  { value: 5, key: "longest" },
];

export function LengthOptions(props: LengthOptionsProps) {
  const { streamMessage } = props;
  const t = useTranslations("artifacts");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState([3]);

  const handleSubmit = async (artifactLength: ArtifactLengthOptions) => {
    props.handleClose();
    await streamMessage({
      artifactLength,
    });
  };

  return (
    <div className="h-[200px] flex items-center justify-center px-4">
      <TooltipProvider>
        <Tooltip open={open}>
          <TooltipTrigger asChild>
            <Slider
              defaultValue={[3]}
              max={5}
              min={1}
              step={1}
              value={value}
              onValueChange={(newValue) => {
                setValue(newValue);
                setOpen(true);
              }}
              onValueCommit={async (v) => {
                setOpen(false);
                switch (v[0]) {
                  case 1:
                    await handleSubmit("shortest");
                    break;
                  case 2:
                    await handleSubmit("short");
                    break;
                  case 3:
                    // Same length, do nothing.
                    break;
                  case 4:
                    await handleSubmit("long");
                    break;
                  case 5:
                    await handleSubmit("longest");
                    break;
                }
              }}
              orientation="vertical"
              color="black"
              className={cn("h-[180px] w-[26px]")}
            />
          </TooltipTrigger>
          <TooltipContent side="right">
            {t(
              lengthOptions.find((option) => option.value === value[0])?.key ??
                "currentLength"
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
