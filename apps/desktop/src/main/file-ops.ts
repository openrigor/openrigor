import {
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";

const MARKDOWN_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "All Files", extensions: ["*"] },
];

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface SaveFileResult {
  path: string;
}

async function showOpen(
  win: BrowserWindow | null,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  if (win && !win.isDestroyed()) {
    return dialog.showOpenDialog(win, options);
  }
  return dialog.showOpenDialog(options);
}

async function showSave(
  win: BrowserWindow | null,
  options: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
  if (win && !win.isDestroyed()) {
    return dialog.showSaveDialog(win, options);
  }
  return dialog.showSaveDialog(options);
}

async function showMessage(
  win: BrowserWindow | null,
  options: MessageBoxOptions
): Promise<MessageBoxReturnValue> {
  if (win && !win.isDestroyed()) {
    return dialog.showMessageBox(win, options);
  }
  return dialog.showMessageBox(options);
}

export async function openMarkdownFile(
  win: BrowserWindow | null
): Promise<OpenFileResult | null> {
  const result = await showOpen(win, {
    title: "Open Markdown",
    properties: ["openFile"],
    filters: MARKDOWN_FILTERS,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readMarkdownPath(result.filePaths[0]!);
}

export function readMarkdownPath(filePath: string): OpenFileResult | null {
  try {
    const content = readFileSync(filePath, "utf8");
    return { path: filePath, content };
  } catch {
    return null;
  }
}

export async function saveMarkdownFile(
  win: BrowserWindow | null,
  content: string,
  path: string | null | undefined
): Promise<SaveFileResult | null> {
  if (path && path.trim().length > 0) {
    return writeMarkdownPath(path, content);
  }
  return saveMarkdownFileAs(win, content, null);
}

export async function saveMarkdownFileAs(
  win: BrowserWindow | null,
  content: string,
  defaultPath: string | null | undefined
): Promise<SaveFileResult | null> {
  const result = await showSave(win, {
    title: "Save Markdown",
    defaultPath: defaultPath ?? undefined,
    filters: MARKDOWN_FILTERS,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  let filePath = result.filePath;
  if (!/\.(md|markdown)$/i.test(filePath)) {
    filePath = `${filePath}.md`;
  }

  return writeMarkdownPath(filePath, content);
}

export function writeMarkdownPath(
  filePath: string,
  content: string
): SaveFileResult | null {
  try {
    writeFileSync(filePath, content, "utf8");
    return { path: filePath };
  } catch {
    return null;
  }
}

export async function confirmDiscard(
  win: BrowserWindow | null
): Promise<boolean> {
  const result = await showMessage(win, {
    type: "warning",
    buttons: ["Discard", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Unsaved changes",
    message: "You have unsaved changes. Discard them?",
    detail: "Your changes will be lost if you discard them.",
  });

  return result.response === 0;
}
