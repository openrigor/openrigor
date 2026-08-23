import { ipcMain, type BrowserWindow } from "electron";
import {
  formatWindowTitle,
  validateDocumentMeta,
  type DocumentMeta,
} from "./document-meta";
import {
  confirmDiscard,
  openMarkdownFile,
  readMarkdownPath,
  saveMarkdownFile,
  saveMarkdownFileAs,
} from "./file-ops";
import {
  addRecentPath,
  loadRecentPaths,
  saveRecentPaths,
} from "./recent-files";

export interface IpcContext {
  getMainWindow: () => BrowserWindow | null;
  getRecentFilePath: () => string;
  getDocumentMeta: () => DocumentMeta;
  setDocumentMeta: (meta: DocumentMeta) => void;
  onRecentChanged: () => void;
}

function applyDocumentMeta(ctx: IpcContext, meta: DocumentMeta): void {
  ctx.setDocumentMeta(meta);
  const win = ctx.getMainWindow();
  if (win && !win.isDestroyed()) {
    win.setTitle(formatWindowTitle(meta));
  }
}

function rememberPath(ctx: IpcContext, filePath: string): void {
  const recentPath = ctx.getRecentFilePath();
  const current = loadRecentPaths(recentPath);
  const next = addRecentPath(current, filePath);
  saveRecentPaths(recentPath, next);
  ctx.onRecentChanged();
}

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle("app:ping", () => "pong");

  ipcMain.handle("file:open", async () => {
    const opened = await openMarkdownFile(ctx.getMainWindow());
    if (!opened) {
      return null;
    }
    rememberPath(ctx, opened.path);
    applyDocumentMeta(ctx, { dirty: false, path: opened.path });
    return opened;
  });

  ipcMain.handle("file:openPath", (_event, filePath: unknown) => {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      return null;
    }
    const opened = readMarkdownPath(filePath);
    if (!opened) {
      return null;
    }
    rememberPath(ctx, opened.path);
    applyDocumentMeta(ctx, { dirty: false, path: opened.path });
    return opened;
  });

  ipcMain.handle(
    "file:save",
    async (_event, args: { content?: unknown; path?: unknown } | undefined) => {
      if (!args || typeof args.content !== "string") {
        return null;
      }
      const pathArg =
        typeof args.path === "string"
          ? args.path
          : args.path === null
            ? null
            : ctx.getDocumentMeta().path;

      const saved = await saveMarkdownFile(
        ctx.getMainWindow(),
        args.content,
        pathArg
      );
      if (!saved) {
        return null;
      }
      rememberPath(ctx, saved.path);
      applyDocumentMeta(ctx, { dirty: false, path: saved.path });
      return saved;
    }
  );

  ipcMain.handle(
    "file:saveAs",
    async (
      _event,
      args: { content?: unknown; defaultPath?: unknown } | undefined
    ) => {
      if (!args || typeof args.content !== "string") {
        return null;
      }
      const defaultPath =
        typeof args.defaultPath === "string"
          ? args.defaultPath
          : ctx.getDocumentMeta().path;

      const saved = await saveMarkdownFileAs(
        ctx.getMainWindow(),
        args.content,
        defaultPath
      );
      if (!saved) {
        return null;
      }
      rememberPath(ctx, saved.path);
      applyDocumentMeta(ctx, { dirty: false, path: saved.path });
      return saved;
    }
  );

  ipcMain.handle("app:getRecent", () => {
    return loadRecentPaths(ctx.getRecentFilePath());
  });

  ipcMain.handle("app:clearRecent", () => {
    saveRecentPaths(ctx.getRecentFilePath(), []);
    ctx.onRecentChanged();
  });

  ipcMain.handle("app:setDocumentMeta", (_event, raw: unknown) => {
    const meta = validateDocumentMeta(raw);
    if (!meta) {
      return;
    }
    applyDocumentMeta(ctx, meta);
  });

  ipcMain.handle("dialog:confirmDiscard", async () => {
    return confirmDiscard(ctx.getMainWindow());
  });
}
