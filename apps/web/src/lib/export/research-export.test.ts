import { describe, expect, it } from "vitest";
import {
  exportAsEvidencePacket,
  exportAsMarkdown,
  generateDisclosureAppendix,
} from "./research-export";

const provenance = {
  repository: "openrigor/private-research",
  repositoryId: 101,
  branch: "openrigor/workspace",
  commitSha: "abcdef1234567890abcdef1234567890abcdef12",
  methodName: "Constrained dialogue",
  methodVersion: "1.2.3",
  exportDate: "2026-08-26T10:15:00.000Z",
  llmMode: "shared_model" as const,
  privacyNoticeVersion: "2026-08-25",
};

describe("research export", () => {
  it("renders Markdown with every provenance field in YAML frontmatter", () => {
    const result = exportAsMarkdown(
      { content: "# Draft\n\nResearch content." },
      provenance
    );

    expect(result).toContain('repository: "openrigor/private-research"');
    expect(result).toContain("repository_id: 101");
    expect(result).toContain('branch: "openrigor/workspace"');
    expect(result).toContain(
      'commit_sha: "abcdef1234567890abcdef1234567890abcdef12"'
    );
    expect(result).toContain('method_name: "Constrained dialogue"');
    expect(result).toContain('method_version: "1.2.3"');
    expect(result).toContain('export_date: "2026-08-26T10:15:00.000Z"');
    expect(result).toContain('llm_mode: "shared_model"');
    expect(result).toContain('privacy_notice_version: "2026-08-25"');
    expect(result).toContain("# Draft\n\nResearch content.");
  });

  it("includes artifact, provenance, ledger entries, and disclosure in the packet", () => {
    const packet = exportAsEvidencePacket(
      { content: "# Evidence" },
      provenance,
      [{ id: "entry-1", status: "recorded" }]
    );

    expect(packet).toMatchObject({
      artifact: "# Evidence",
      provenance: {
        repository: "openrigor/private-research",
        repositoryId: 101,
        branch: "openrigor/workspace",
        commitSha: provenance.commitSha,
        methodName: "Constrained dialogue",
        methodVersion: "1.2.3",
        exportDate: provenance.exportDate,
        llmMode: "shared_model",
        privacyNoticeVersion: "2026-08-25",
      },
      ledgerEntries: [{ id: "entry-1", status: "recorded" }],
    });
    expect(packet.disclosureAppendix).toContain("## AI-use disclosure");
  });

  it("discloses the selected mode, notice version, method, and short commit", () => {
    const appendix = generateDisclosureAppendix(provenance);

    expect(appendix).toContain("Method: Constrained dialogue");
    expect(appendix).toContain(
      "Selected AI mode: Shared model (OpenRigor-provided)"
    );
    expect(appendix).toContain("Privacy-notice version: 2026-08-25");
    expect(appendix).toContain("Repository commit SHA: abcdef1");
    expect(appendix).toContain(
      "Artifact content and provenance metadata are stored in the user's private GitHub repository. Workspace telemetry is retained per the OpenRigor data-flow policy."
    );
    expect(appendix).toContain(
      "Data-flow details: https://openrigor.org#data-flow"
    );
  });

  it("covers the BYOK disclosure label", () => {
    expect(
      generateDisclosureAppendix({
        ...provenance,
        llmMode: "byok",
        privacyNoticeVersion: null,
      })
    ).toContain("Selected AI mode: BYOK (user-provided API key)");
  });

  it("uses N/A for the privacy notice in Markdown-only mode", () => {
    const appendix = generateDisclosureAppendix({
      ...provenance,
      llmMode: "markdown_only",
      privacyNoticeVersion: "should-not-be-used",
    });
    const markdown = exportAsMarkdown("# No inference", {
      ...provenance,
      llmMode: "markdown_only",
      privacyNoticeVersion: "should-not-be-used",
    });

    expect(appendix).toContain(
      "Selected AI mode: Markdown-only (no AI inference)"
    );
    expect(appendix).toContain("Privacy-notice version: N/A");
    expect(markdown).toContain('privacy_notice_version: "N/A"');
  });

  it("does not crash when artifact or provenance fields are missing", () => {
    expect(() => exportAsMarkdown({}, {})).not.toThrow();
    expect(() => exportAsEvidencePacket(undefined, {})).not.toThrow();
    expect(generateDisclosureAppendix({})).toContain("Method: N/A");
  });
});
