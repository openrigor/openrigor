import {
  exportAsMarkdown,
  type ResearchExportArtifact,
  type ResearchExportProvenance,
} from "./research-export";

/**
 * PDF fallback for the beta. The browser's print dialog is the supported
 * Markdown-to-PDF path; keeping the response as Markdown avoids a heavyweight
 * server-side PDF dependency while preserving the research export exactly.
 */
export function exportAsPdf(
  artifact: ResearchExportArtifact,
  provenance: ResearchExportProvenance = {},
  filename = "research-export.md"
): Response {
  return new Response(exportAsMarkdown(artifact, provenance), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-PDF-Export": "Print this Markdown response to PDF in the browser",
    },
  });
}
