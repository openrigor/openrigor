/** Basename for UI labels (renderer has no Node `path`). */
export function displayPath(filePath: string | null): string {
  if (!filePath || filePath.trim().length === 0) {
    return "Untitled";
  }
  const parts = filePath.split(/[/\\]/);
  const base = parts[parts.length - 1];
  return base && base.length > 0 ? base : "Untitled";
}
