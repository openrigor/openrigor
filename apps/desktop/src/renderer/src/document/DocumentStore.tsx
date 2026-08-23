import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const AUTOSAVE_MS = 2000;
const EMPTY_MARKDOWN = "";

export interface DocumentState {
  path: string | null;
  markdown: string;
  dirty: boolean;
}

export interface DocumentActions {
  setMarkdown: (markdown: string) => void;
  newDocument: () => Promise<void>;
  openDocument: () => Promise<void>;
  openRecent: (filePath: string) => Promise<void>;
  saveDocument: () => Promise<void>;
  saveDocumentAs: () => Promise<void>;
}

export type DocumentStoreValue = DocumentState & DocumentActions;

const DocumentStoreContext = createContext<DocumentStoreValue | null>(null);

async function confirmDiscardIfNeeded(dirty: boolean): Promise<boolean> {
  if (!dirty) {
    return true;
  }
  return window.electronAPI.confirmDiscard();
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null);
  const [markdown, setMarkdownState] = useState(EMPTY_MARKDOWN);
  const [dirty, setDirty] = useState(false);

  const pathRef = useRef(path);
  const markdownRef = useRef(markdown);
  const dirtyRef = useRef(dirty);
  pathRef.current = path;
  markdownRef.current = markdown;
  dirtyRef.current = dirty;

  const setMarkdown = useCallback((next: string) => {
    setMarkdownState(next);
    setDirty(true);
  }, []);

  const applyOpened = useCallback((filePath: string, content: string) => {
    setPath(filePath);
    setMarkdownState(content);
    setDirty(false);
  }, []);

  const resetUntitled = useCallback(() => {
    setPath(null);
    setMarkdownState(EMPTY_MARKDOWN);
    setDirty(false);
  }, []);

  const newDocument = useCallback(
    async (opts?: { skipConfirm?: boolean }) => {
      if (!opts?.skipConfirm) {
        if (!(await confirmDiscardIfNeeded(dirtyRef.current))) {
          return;
        }
      }
      resetUntitled();
    },
    [resetUntitled]
  );

  const openDocument = useCallback(
    async (opts?: { skipConfirm?: boolean }) => {
      if (!opts?.skipConfirm) {
        if (!(await confirmDiscardIfNeeded(dirtyRef.current))) {
          return;
        }
      }
      const opened = await window.electronAPI.openFile();
      if (!opened) {
        return;
      }
      applyOpened(opened.path, opened.content);
    },
    [applyOpened]
  );

  const openRecent = useCallback(
    async (filePath: string, opts?: { skipConfirm?: boolean }) => {
      if (!opts?.skipConfirm) {
        if (!(await confirmDiscardIfNeeded(dirtyRef.current))) {
          return;
        }
      }
      const opened = await window.electronAPI.openPath(filePath);
      if (!opened) {
        return;
      }
      applyOpened(opened.path, opened.content);
    },
    [applyOpened]
  );

  const saveDocument = useCallback(async () => {
    const content = markdownRef.current;
    const currentPath = pathRef.current;
    const saved = await window.electronAPI.saveFile({
      content,
      path: currentPath,
    });
    if (!saved) {
      return;
    }
    setPath(saved.path);
    if (markdownRef.current === content) {
      setDirty(false);
    }
  }, []);

  const saveDocumentAs = useCallback(async () => {
    const content = markdownRef.current;
    const saved = await window.electronAPI.saveFileAs({
      content,
      defaultPath: pathRef.current,
    });
    if (!saved) {
      return;
    }
    setPath(saved.path);
    if (markdownRef.current === content) {
      setDirty(false);
    }
  }, []);

  // Window title + close guard — report on every dirty/path change.
  useEffect(() => {
    void window.electronAPI.setDocumentMeta({ dirty, path });
  }, [dirty, path]);

  // Autosave only when a path is set.
  useEffect(() => {
    if (!path || !dirty) {
      return;
    }

    const timer = window.setTimeout(() => {
      const content = markdownRef.current;
      const savePath = pathRef.current;
      if (!savePath) {
        return;
      }
      void (async () => {
        const saved = await window.electronAPI.saveFile({
          content,
          path: savePath,
        });
        if (!saved) {
          return;
        }
        setPath(saved.path);
        if (markdownRef.current === content) {
          setDirty(false);
        }
      })();
    }, AUTOSAVE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [markdown, path, dirty]);

  // File menu actions (main already confirmed discard for new/open/openRecent).
  useEffect(() => {
    return window.electronAPI.onMenuAction((action, filePath) => {
      void (async () => {
        switch (action) {
          case "new":
            await newDocument({ skipConfirm: true });
            break;
          case "open":
            await openDocument({ skipConfirm: true });
            break;
          case "save":
            await saveDocument();
            break;
          case "saveAs":
            await saveDocumentAs();
            break;
          case "openRecent":
            if (typeof filePath === "string" && filePath.length > 0) {
              await openRecent(filePath, { skipConfirm: true });
            }
            break;
        }
      })();
    });
  }, [newDocument, openDocument, openRecent, saveDocument, saveDocumentAs]);

  const value = useMemo<DocumentStoreValue>(
    () => ({
      path,
      markdown,
      dirty,
      setMarkdown,
      newDocument: () => newDocument(),
      openDocument: () => openDocument(),
      openRecent: (filePath: string) => openRecent(filePath),
      saveDocument,
      saveDocumentAs,
    }),
    [
      path,
      markdown,
      dirty,
      setMarkdown,
      newDocument,
      openDocument,
      openRecent,
      saveDocument,
      saveDocumentAs,
    ]
  );

  return (
    <DocumentStoreContext.Provider value={value}>
      {children}
    </DocumentStoreContext.Provider>
  );
}

export function useDocumentStore(): DocumentStoreValue {
  const ctx = useContext(DocumentStoreContext);
  if (!ctx) {
    throw new Error("useDocumentStore must be used within DocumentProvider");
  }
  return ctx;
}
