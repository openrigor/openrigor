export type ReviewArtifactContent = {
  index?: number;
  type?: string;
  fullMarkdown?: string;
};

export type ReviewArtifact = {
  currentIndex?: number;
  contents?: ReviewArtifactContent[];
};

/**
 * Pick the markdown the review canvas should render (issue #75).
 *
 * The drafted content often lives in a later content entry (e.g. the
 * AI-generated "Opening Paragraph" at index 2) while the first text entry is a
 * title-only vessel with empty markdown. Naively rendering the first `text`
 * content therefore shows a blank canvas even when the submission has content.
 *
 * Selection order:
 * 1. the artifact's active content (`currentIndex`), when it carries markdown
 * 2. the first text content with non-empty markdown
 * 3. the first text content (fallback, preserves prior behaviour for
 *    single-content canvases), or ""
 */
export function selectReviewCanvasMarkdown(
  artifact?: ReviewArtifact | null
): string {
  const contents = artifact?.contents ?? [];
  if (contents.length === 0) return "";

  const byIndex = (index: number) =>
    contents.find((content) => content.index === index);
  const hasMarkdown = (content?: ReviewArtifactContent) =>
    Boolean(content && (content.fullMarkdown ?? "").trim());

  const active =
    artifact?.currentIndex != null ? byIndex(artifact.currentIndex) : undefined;
  if (active && active.type === "text" && hasMarkdown(active)) {
    return active.fullMarkdown ?? "";
  }

  const withContent = contents.find(
    (content) => content.type === "text" && hasMarkdown(content)
  );
  if (withContent) return withContent.fullMarkdown ?? "";

  const firstText = contents.find((content) => content.type === "text");
  return firstText?.fullMarkdown ?? "";
}
