import { app, BrowserWindow, dialog } from "electron";
import { join } from "path";
import {
  DEFAULT_DOCUMENT_META,
  formatWindowTitle,
  type DocumentMeta,
} from "./document-meta";
import { registerIpcHandlers } from "./ipc";
import { setApplicationMenu } from "./menu";
import { isSmokeTest } from "./utils";
import { loadWindowState, manageWindowState } from "./window-state";
import type { WindowState } from "./window-state";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let documentMeta: DocumentMeta = { ...DEFAULT_DOCUMENT_META };
  let allowClose = false;
  let isQuitting = false;

  const getMainWindow = (): BrowserWindow | null => mainWindow;

  const getRecentFilePath = (): string =>
    join(app.getPath("userData"), "recent-files.json");

  const getDocumentMeta = (): DocumentMeta => documentMeta;

  const setDocumentMeta = (meta: DocumentMeta): void => {
    documentMeta = meta;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(formatWindowTitle(meta));
    }
  };

  const resetToUntitled = (): void => {
    setDocumentMeta({ dirty: false, path: null });
  };

  const rebuildMenu = (): void => {
    setApplicationMenu({
      getMainWindow,
      getDocumentMeta,
      getRecentFilePath,
      resetToUntitled,
      onRecentChanged: rebuildMenu,
    });
  };

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  function createWindow(): void {
    const defaults: WindowState = {
      width: 1280,
      height: 800,
      isMaximized: false,
    };
    const stateFilePath = join(app.getPath("userData"), "window-state.json");
    const state = loadWindowState(stateFilePath, defaults);

    mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      ...(state.x !== undefined ? { x: state.x } : {}),
      ...(state.y !== undefined ? { y: state.y } : {}),
      title: formatWindowTitle(documentMeta),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    manageWindowState(mainWindow, stateFilePath, defaults);

    mainWindow.on("close", (event) => {
      if (allowClose || !documentMeta.dirty) {
        return;
      }

      event.preventDefault();
      const win = mainWindow;
      if (!win || win.isDestroyed()) {
        return;
      }

      void dialog
        .showMessageBox(win, {
          type: "warning",
          buttons: ["Discard", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          title: "Unsaved changes",
          message: "You have unsaved changes. Discard them?",
          detail: "Your changes will be lost if you discard them.",
        })
        .then((result) => {
          if (result.response === 0) {
            allowClose = true;
            documentMeta = { ...documentMeta, dirty: false };
            if (isQuitting) {
              app.quit();
            } else {
              win.close();
            }
          } else {
            isQuitting = false;
          }
        });
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }

    mainWindow.on("closed", () => {
      mainWindow = null;
      allowClose = false;
    });
  }

  void app.whenReady().then(() => {
    if (isSmokeTest(process.argv)) {
      console.log("SMOKE_OK");
      app.exit(0);
      return;
    }

    registerIpcHandlers({
      getMainWindow,
      getRecentFilePath,
      getDocumentMeta,
      setDocumentMeta,
      onRecentChanged: rebuildMenu,
    });

    rebuildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        allowClose = false;
        createWindow();
      }
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
