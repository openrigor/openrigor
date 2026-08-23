/**
 * beautiful-mermaid resolves a bare forward reference using its id as the
 * label and does not replace it when the explicit definition appears later.
 * Move standalone definitions ahead of edges so authored diagrams retain
 * their labels without changing the source users see in the editor.
 */
export function normalizeMermaidSource(source: string): string {
  const lines = source.split(/\r?\n/);
  if (lines.length < 2) return source;

  const header = lines[0];
  const definitions: string[] = [];
  const body: string[] = [];
  const definitionLine =
    /^\s*[A-Za-z][\w-]*\s*(?:\[[^\n]*\]|\([^\n]*\)|\{[^\n]*\})\s*$/;

  for (const line of lines.slice(1)) {
    if (
      definitionLine.test(line) &&
      !line.includes("-->") &&
      !line.includes("--")
    ) {
      definitions.push(line);
    } else {
      body.push(line);
    }
  }

  return [header, ...definitions, ...body].join("\n");
}
