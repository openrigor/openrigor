import { useState } from "react";

import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { DocumentProvider, displayPath, useDocumentStore } from "./document";
import { DocumentEditor, PrintView } from "./editor";

function AppShell() {
  const {
    path,
    markdown,
    dirty,
    setMarkdown,
    newDocument,
    openDocument,
    saveDocument,
    saveDocumentAs,
  } = useDocumentStore();
  const [rawMode, setRawMode] = useState(false);

  const label = displayPath(path);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="no-print flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                dirty ? "bg-amber-500" : "bg-emerald-500/70"
              }`}
              title={dirty ? "Unsaved changes" : "Saved"}
              aria-label={dirty ? "Unsaved changes" : "Saved"}
            />
            <span className="truncate font-medium text-foreground">
              {label}
              {dirty ? "*" : ""}
            </span>
            {path ? (
              <span className="hidden truncate text-muted-foreground sm:inline">
                {path}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void newDocument()}
          >
            New
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void openDocument()}
          >
            Open
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void saveDocument()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void saveDocumentAs()}
          >
            Save As
          </Button>
          <Button
            size="sm"
            variant={rawMode ? "default" : "outline"}
            onClick={() => setRawMode((v) => !v)}
            aria-pressed={rawMode}
          >
            Raw
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>

      <main className="no-print min-h-0 flex-1">
        {rawMode ? (
          <Textarea
            className="h-full min-h-full resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
            aria-label="Raw markdown"
          />
        ) : (
          <DocumentEditor markdown={markdown} onChange={setMarkdown} />
        )}
      </main>

      <div className="print-only-host" aria-hidden="true">
        <PrintView markdown={markdown} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DocumentProvider>
      <AppShell />
    </DocumentProvider>
  );
}
