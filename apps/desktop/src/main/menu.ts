import {
  app,
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";
import { confirmDiscard } from "./file-ops";
import type { DocumentMeta } from "./document-meta";
import { loadRecentPaths, saveRecentPaths } from "./recent-files";

export type MenuFileAction = "new" | "open" | "save" | "saveAs" | "openRecent";

export interface MenuContext {
  getMainWindow: () => BrowserWindow | null;
  getDocumentMeta: () => DocumentMeta;
  getRecentFilePath: () => string;
  /** After confirmed discard on New: clean untitled meta for title/close guard. */
  resetToUntitled: () => void;
  onRecentChanged: () => void;
}

function sendMenuAction(
  win: BrowserWindow | null,
  action: MenuFileAction,
  path?: string
): void {
  if (!win || win.isDestroyed()) {
    return;
  }
  if (path !== undefined) {
    win.webContents.send("menu:action", action, path);
  } else {
    win.webContents.send("menu:action", action);
  }
}

async function guardIfDirty(ctx: MenuContext): Promise<boolean> {
  if (!ctx.getDocumentMeta().dirty) {
    return true;
  }
  return confirmDiscard(ctx.getMainWindow());
}

export function buildApplicationMenu(ctx: MenuContext): Menu {
  const recent = loadRecentPaths(ctx.getRecentFilePath());

  const recentSubmenu: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: "No Recent Files", enabled: false }]
      : [
          ...recent.map((filePath) => ({
            label: filePath,
            click: () => {
              void (async () => {
                if (!(await guardIfDirty(ctx))) {
                  return;
                }
                // Dirty stays until openPath succeeds (cancel keeps buffer).
                sendMenuAction(ctx.getMainWindow(), "openRecent", filePath);
              })();
            },
          })),
          { type: "separator" as const },
          {
            label: "Clear Recent",
            click: () => {
              saveRecentPaths(ctx.getRecentFilePath(), []);
              ctx.onRecentChanged();
            },
          },
        ];

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            void (async () => {
              if (!(await guardIfDirty(ctx))) {
                return;
              }
              // Confirmed discard → untitled until renderer reports meta.
              ctx.resetToUntitled();
              sendMenuAction(ctx.getMainWindow(), "new");
            })();
          },
        },
        {
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            void (async () => {
              if (!(await guardIfDirty(ctx))) {
                return;
              }
              // Dirty stays until file:open succeeds (cancel keeps buffer).
              sendMenuAction(ctx.getMainWindow(), "open");
            })();
          },
        },
        {
          label: "Open Recent",
          submenu: recentSubmenu,
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            sendMenuAction(ctx.getMainWindow(), "save");
          },
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            sendMenuAction(ctx.getMainWindow(), "saveAs");
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function setApplicationMenu(ctx: MenuContext): void {
  Menu.setApplicationMenu(buildApplicationMenu(ctx));
}
