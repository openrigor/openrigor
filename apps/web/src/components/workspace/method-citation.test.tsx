// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateApa,
  generateBibtex,
  type MethodCitationMethod,
} from "@/lib/methods/citation";
import { MethodCitation } from "./method-citation";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const completeMethod: MethodCitationMethod = {
  name: "Constrained dialogic drafting",
  version: "1.2.0",
  profiles: [{ author: "Jane Doe" }],
  publication_date: "2025-06-14",
  publisher: "OpenRigor Research",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MethodCitation", () => {
  it("renders BibTeX and APA controls for complete metadata", () => {
    render(<MethodCitation method={completeMethod} />);

    expect(screen.getByTestId("method-citation")).toBeTruthy();
    expect(screen.getByTestId("bibtex-citation").textContent).toContain(
      generateBibtex(completeMethod)
    );
    expect(screen.getByTestId("apa-citation").textContent).toContain(
      generateApa(completeMethod)
    );
    expect(
      screen.getByRole("button", { name: "Copy BibTeX citation" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy APA citation" })
    ).toBeTruthy();
  });

  it("omits the citation control when publication date is missing", () => {
    render(
      <MethodCitation
        method={{ ...completeMethod, publication_date: undefined }}
      />
    );

    expect(screen.queryByTestId("method-citation")).toBeNull();
    expect(screen.queryByText("Citation unavailable")).toBeNull();
  });

  it("copies each rendered citation format", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MethodCitation method={completeMethod} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Copy BibTeX citation" })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(generateBibtex(completeMethod))
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy APA citation" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(generateApa(completeMethod))
    );
  });
});
