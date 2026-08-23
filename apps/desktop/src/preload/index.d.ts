export interface DocumentMeta {
  dirty: boolean;
  path: string | null;
}

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface SaveFileResult {
  path: string;
}

/** Menu actions pushed from the main process File menu. */
export type MenuAction = "new" | "open" | "save" | "saveAs" | "openRecent";

export type MenuActionHandler = (action: MenuAction, path?: string) => void;

export interface ElectronAPI {
  versions: NodeJS.ProcessVersions;
  ping: () => Promise<string>;

  /** Show open dialog and read UTF-8 markdown. */
  openFile: () => Promise<OpenFileResult | null>;
  /** Open a known path (e.g. recent file). */
  openPath: (filePath: string) => Promise<OpenFileResult | null>;
  /**
   * Write markdown. If `path` is set (or last known path via meta), writes
   * without a dialog — used by Save and by renderer autosave when path is set.
   * Untitled docs fall through to Save As.
   */
  saveFile: (args: {
    content: string;
    path?: string | null;
  }) => Promise<SaveFileResult | null>;
  /** Always show Save As dialog, then write. */
  saveFileAs: (args: {
    content: string;
    defaultPath?: string | null;
  }) => Promise<SaveFileResult | null>;

  getRecent: () => Promise<string[]>;
  clearRecent: () => Promise<void>;

  /** Report dirty/path so main can update title and guard close/quit. */
  setDocumentMeta: (meta: DocumentMeta) => Promise<void>;

  /** Native discard confirmation. Resolves true if user chooses Discard. */
  confirmDiscard: () => Promise<boolean>;

  /**
   * Subscribe to File menu actions from main.
   * Returns an unsubscribe function.
   */
  onMenuAction: (handler: MenuActionHandler) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
