"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type ExportFormat = "markdown" | "evidence-packet";

export function ExportButton({
  workspaceItemId,
  artifactId,
  artifactName,
}: {
  workspaceItemId: string;
  artifactId: string;
  artifactName?: string;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<ExportFormat>();

  async function download(format: ExportFormat) {
    setDownloading(format);
    try {
      const params = new URLSearchParams({ artifactId, format });
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(
          workspaceItemId
        )}/export?${params.toString()}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        let message = "Could not export artifact";
        try {
          const body = (await response.json()) as { error?: string };
          message = body.error || message;
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadFilename(response, format, artifactName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      toast({
        title: "Could not export artifact",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(undefined);
    }
  }

  const busy = downloading !== undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label="Export artifact"
          data-testid="export-button"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "Exporting…" : "Export"}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => void download("markdown")}
        >
          Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => void download("evidence-packet")}
        >
          Export evidence packet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function downloadFilename(
  response: Response,
  format: ExportFormat,
  artifactName?: string
): string {
  const disposition = response.headers.get("content-disposition");
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1];
  if (filename) return filename;
  const base =
    (artifactName || "artifact")
      .split("/")
      .at(-1)
      ?.replace(/\.[^./]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-") || "artifact";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${format === "evidence-packet" ? "evidence-" : ""}${date}.${format === "evidence-packet" ? "json" : "md"}`;
}
