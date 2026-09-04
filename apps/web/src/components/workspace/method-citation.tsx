"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  generateApa,
  generateBibtex,
  type MethodCitationMethod,
} from "@/lib/methods/citation";

type CitationBlockProps = {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
};

function CitationBlock({
  label,
  value,
  onCopy,
  copyLabel,
}: CitationBlockProps & { copyLabel: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{label}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Copy ${label} citation`}
          onClick={() => onCopy(label, value)}
        >
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          {copyLabel}
        </Button>
      </div>
      <pre
        className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
        data-testid={`${label.toLowerCase()}-citation`}
      >
        <code>{value}</code>
      </pre>
    </div>
  );
}

export function MethodCitation({ method }: { method: MethodCitationMethod }) {
  const t = useTranslations("workspace");
  const { toast } = useToast();
  const [copying, setCopying] = useState<string | null>(null);
  const bibtex = generateBibtex(method);
  const apa = generateApa(method);

  if (!bibtex || !apa) return null;

  async function copyCitation(label: string, value: string) {
    setCopying(label);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      toast({
        title: t("citationCopied"),
        description: t("citationCopiedDescription", { label }),
      });
    } catch {
      toast({
        title: t("couldNotCopyCitation"),
        description: t("copyCitationManually"),
        variant: "destructive",
      });
    } finally {
      setCopying(null);
    }
  }

  return (
    <Card data-testid="method-citation">
      <CardHeader>
        <CardTitle>{t("methodCitation")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <CitationBlock
          label="BibTeX"
          value={bibtex}
          copyLabel={t("copy")}
          onCopy={(label, value) => void copyCitation(label, value)}
        />
        <CitationBlock
          label="APA"
          value={apa}
          copyLabel={t("copy")}
          onCopy={(label, value) => void copyCitation(label, value)}
        />
        {copying && (
          <span className="sr-only">{t("copying", { label: copying })}</span>
        )}
      </CardContent>
    </Card>
  );
}
