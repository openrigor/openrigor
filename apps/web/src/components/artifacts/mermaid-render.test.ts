import { describe, expect, it } from "vitest";
import { renderMermaidSVG } from "beautiful-mermaid";
import { normalizeMermaidSource } from "./mermaid-source";

const MERMAID_THEME = {
  bg: "#ffffff",
  fg: "#000000",
  accent: "#0066cc",
  muted: "#666666",
  border: "#cccccc",
  transparent: true,
} as const;

function extractSvgText(svg: string): string[] {
  return Array.from(svg.matchAll(/>([^<]{1,120})</g))
    .map((match) => match[1].trim())
    .filter(Boolean);
}

describe("beautiful-mermaid forward node references", () => {
  it("renders full labels when a node is referenced before its definition", () => {
    const code = `flowchart TD
    VYG --> SRL
    SRL["SELF-REGULATED LEARNING (Zimmerman)<br/>Goal setting and strategic planning"]`;

    const svg = renderMermaidSVG(normalizeMermaidSource(code), MERMAID_THEME);
    const text = extractSvgText(svg);

    expect(text).toContain("SELF-REGULATED LEARNING (Zimmerman)");
    expect(text).toContain("Goal setting and strategic planning");
    expect(text).not.toEqual(["VYG", "SRL"]);
  });
});
