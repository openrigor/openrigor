// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintView, countMermaidCodeBlocks } from "./PrintView";

afterEach(() => cleanup());

describe("PrintView readiness", () => {
  it("counts a mermaid fence inside a blockquote", () => {
    const markdown = [
      "> ```mermaid",
      "> flowchart TD",
      ">   A --> B",
      "> ```",
    ].join("\n");
    expect(countMermaidCodeBlocks(markdown)).toBe(1);
    expect(countMermaidCodeBlocks("```mermaid\nflowchart TD\n```")).toBe(1);
    expect(countMermaidCodeBlocks("```js\nconst a = 1;\n```")).toBe(0);
  });

  it("reports readiness once a blockquote mermaid fence renders", async () => {
    const onReady = vi.fn();
    const markdown = [
      "> ```mermaid",
      "> flowchart TD",
      ">   A --> B",
      "> ```",
    ].join("\n");

    render(<PrintView markdown={markdown} onReady={onReady} />);

    const printRoot = document.getElementById("print-root");
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(printRoot?.dataset.printReady).toBe("true");
    expect(
      printRoot?.querySelector('[data-print-mermaid="true"]')
    ).not.toBeNull();
  });

  it("counts a capitalized Mermaid fence toward readiness", async () => {
    const onReady = vi.fn();
    const markdown = ["```Mermaid", "flowchart TD", "  A --> B", "```"].join(
      "\n"
    );

    render(<PrintView markdown={markdown} onReady={onReady} />);

    const printRoot = document.getElementById("print-root");
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(printRoot?.dataset.printReady).toBe("true");
    expect(
      printRoot?.querySelector('[data-print-mermaid="true"]')
    ).not.toBeNull();
  });

  it("waits for lazy Mermaid content before reporting readiness", async () => {
    const onReady = vi.fn();
    const markdown = [
      "# Printable diagram",
      "",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
    ].join("\n");

    render(<PrintView markdown={markdown} onReady={onReady} />);

    const printRoot = document.getElementById("print-root");
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(printRoot?.dataset.printReady).toBe("true");
    expect(printRoot?.querySelector("svg")).not.toBeNull();
    expect(
      printRoot?.querySelector('[data-print-mermaid="true"]')
    ).not.toBeNull();
  });
});
