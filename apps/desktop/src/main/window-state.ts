import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { BrowserWindow } from "electron";

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateWindowState(raw: unknown): WindowState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (!isFiniteNumber(record.width) || record.width < 200) {
    return null;
  }
  if (!isFiniteNumber(record.height) || record.height < 200) {
    return null;
  }

  if ("x" in record && record.x !== undefined && !isFiniteNumber(record.x)) {
    return null;
  }
  if ("y" in record && record.y !== undefined && !isFiniteNumber(record.y)) {
    return null;
  }

  if (
    "isMaximized" in record &&
    record.isMaximized !== undefined &&
    typeof record.isMaximized !== "boolean"
  ) {
    return null;
  }

  const state: WindowState = {
    width: record.width,
    height: record.height,
    isMaximized:
      typeof record.isMaximized === "boolean" ? record.isMaximized : false,
  };

  if (isFiniteNumber(record.x)) {
    state.x = record.x;
  }
  if (isFiniteNumber(record.y)) {
    state.y = record.y;
  }

  return state;
}

export function loadWindowState(
  filePath: string,
  defaults: WindowState
): WindowState {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const validated = validateWindowState(parsed);
    return validated ?? defaults;
  } catch {
    return defaults;
  }
}

export function saveWindowState(filePath: string, state: WindowState): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(tmpPath, filePath);
  } catch {
    // Silently swallow fs errors
  }
}

type BoundsSource = {
  getBounds: () => { x: number; y: number; width: number; height: number };
  getNormalBounds?: () => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized: () => boolean;
};

function readPersistableBounds(win: BoundsSource): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (typeof win.getNormalBounds === "function") {
    return win.getNormalBounds();
  }
  return win.getBounds();
}

export function manageWindowState(
  win: BrowserWindow,
  filePath: string,
  defaults: WindowState
): void {
  const state = loadWindowState(filePath, defaults);

  if (state.x !== undefined && state.y !== undefined) {
    win.setBounds({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
    });
  }

  if (state.isMaximized) {
    win.maximize();
  }

  let isMaximized = state.isMaximized;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    const bounds = readPersistableBounds(win);
    saveWindowState(filePath, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  };

  const scheduleSave = (): void => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 500);
  };

  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);

  win.on("maximize", () => {
    isMaximized = true;
    scheduleSave();
  });

  win.on("unmaximize", () => {
    isMaximized = false;
    scheduleSave();
  });

  win.on("close", () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    isMaximized = win.isMaximized();
    persist();
  });
}
