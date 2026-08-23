"use client";

import React, { Suspense } from "react";
import type { ReadonlyMarkdownRendererProps } from "./readonly-markdown-renderer";

const ReadonlyMarkdownRenderer = React.lazy(() =>
  import("./readonly-markdown-renderer").then((m) => ({
    default: m.ReadonlyMarkdownRenderer,
  }))
);

function ReadonlyMarkdownRendererFallback() {
  return (
    <div className="text-sm text-muted-foreground py-4">Loading canvas…</div>
  );
}

export function ReadonlyMarkdownRendererSuspense(
  props: ReadonlyMarkdownRendererProps
) {
  return (
    <Suspense fallback={<ReadonlyMarkdownRendererFallback />}>
      <ReadonlyMarkdownRenderer {...props} />
    </Suspense>
  );
}
