import { describe, expect, it } from "vitest";
import type { RepositoryStatus } from "@opencanvas/shared/research-repository";
import { REPOSITORY_LAYOUT_V2_COPY } from "@/components/research-repository/copy";
import {
  shortRepositoryCommit,
  shouldShowRepositoryConnect,
  statusLabel,
} from "./research-repository-status";

const status = (
  state: RepositoryStatus["state"],
  reason?: RepositoryStatus["reason"],
  layoutVersion?: string
) =>
  ({
    workspaceId: "wi_repository",
    repositoryId: 101,
    state,
    reason,
    layoutVersion,
    checkedAt: "2026-08-22T10:00:00.000Z",
  }) as RepositoryStatus;

describe("ResearchRepositoryStatus", () => {
  it("shortens the displayed head SHA", () => {
    expect(shortRepositoryCommit("a".repeat(40))).toBe("aaaaaaa");
  });

  it.each([
    status("disconnected", "disconnected"),
    status("blocked", "permission_lost"),
    status("read_only", "authorization_required"),
  ])("offers GitHub reconnection for missing access", (repositoryStatus) => {
    expect(shouldShowRepositoryConnect(repositoryStatus)).toBe(true);
  });

  it("does not offer reconnection for a healthy repository", () => {
    expect(shouldShowRepositoryConnect(status("ready"))).toBe(false);
  });

  it("explains why a legacy repository is read-only", () => {
    expect(
      statusLabel(status("read_only", "unsupported_layout_major", "1.0"))
    ).toBe(
      "Read-only: this repository uses the previous layout; it is readable but no longer writable."
    );
  });

  it("collapses a reason that repeats the state into the state alone", () => {
    expect(statusLabel(status("disconnected", "disconnected"))).toBe(
      "disconnected"
    );
  });

  it("keeps distinct reason words next to the state", () => {
    expect(statusLabel(status("blocked", "permission_lost"))).toBe(
      "blocked · permission lost"
    );
    expect(statusLabel(status("read_only", "authorization_required"))).toBe(
      "read only · authorization required"
    );
  });

  it("labels ready repositories without a repeated word", () => {
    expect(statusLabel(status("ready"))).toBe("ready");
    expect(statusLabel(status("ready", undefined, "2.0"))).toBe(
      `ready · ${REPOSITORY_LAYOUT_V2_COPY}`
    );
  });

  it("labels a missing status as unavailable", () => {
    expect(statusLabel(undefined)).toBe("unavailable");
  });
});
