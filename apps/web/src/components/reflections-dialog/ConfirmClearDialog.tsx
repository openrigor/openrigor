"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { TighterText } from "../ui/header";

export interface ReflectionsProps {
  handleDeleteReflections: () => Promise<boolean>;
}

export function ConfirmClearDialog(props: ReflectionsProps) {
  const t = useTranslations("reflections");
  const { handleDeleteReflections } = props;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => setOpen(true)} variant="destructive">
          <TighterText>{t("clearReflections")}</TighterText>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-8 bg-white rounded-lg shadow-xl">
        <DialogHeader>
          <DialogDescription className="mt-2 text-md text-center font-light text-red-500">
            <TighterText>{t("clearWarning")}</TighterText>
          </DialogDescription>
        </DialogHeader>
        <Button
          onClick={async () => {
            setOpen(false);
            await handleDeleteReflections();
          }}
          variant="destructive"
        >
          <TighterText>{t("clearReflections")}</TighterText>
        </Button>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setOpen(false)} variant="outline">
            <TighterText>{t("cancel")}</TighterText>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
