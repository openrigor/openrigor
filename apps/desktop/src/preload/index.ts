import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ElectronAPI, MenuAction, MenuActionHandler } from "./index.d";

const electronAPI: ElectronAPI = {
  versions: process.versions,
  ping: () => ipcRenderer.invoke("app:ping"),

  openFile: () => ipcRenderer.invoke("file:open"),
  openPath: (filePath: string) => ipcRenderer.invoke("file:openPath", filePath),
  saveFile: (args) => ipcRenderer.invoke("file:save", args),
  saveFileAs: (args) => ipcRenderer.invoke("file:saveAs", args),

  getRecent: () => ipcRenderer.invoke("app:getRecent"),
  clearRecent: () => ipcRenderer.invoke("app:clearRecent"),

  setDocumentMeta: (meta) => ipcRenderer.invoke("app:setDocumentMeta", meta),
  confirmDiscard: () => ipcRenderer.invoke("dialog:confirmDiscard"),

  onMenuAction: (handler: MenuActionHandler) => {
    const listener = (
      _event: IpcRendererEvent,
      action: MenuAction,
      path?: string
    ): void => {
      handler(action, path);
    };
    ipcRenderer.on("menu:action", listener);
    return () => {
      ipcRenderer.removeListener("menu:action", listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
