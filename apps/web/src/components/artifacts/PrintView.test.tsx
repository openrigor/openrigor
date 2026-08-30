// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintView } from "./PrintView";

afterEach(() => cleanup());

describe("PrintView readiness", () => {
  it("counts a mermaid fence inside a blockquote before reporting readiness", async () => {
    const onReady = vi.fn();
    const markdown = [
      "> ```mermaid",
      "> flowchart TD",
      ">   A --> B",
      "> ```",
    ].join("\n");

    render(<PrintView markdown={markdown} onReady={onReady} />);

    const printRoot = document.getElementById("print-root");
    expect(printRoot?.dataset.printReady).toBe("false");
    expect(onReady).not.toHaveBeenCalled();

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
