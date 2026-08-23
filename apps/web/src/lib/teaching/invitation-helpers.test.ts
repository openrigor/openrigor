import { beforeEach, describe, expect, it, vi } from "vitest";

const { inviteUserByEmail, generateLink } = vi.hoisted(() => ({
  inviteUserByEmail: vi.fn(),
  generateLink: vi.fn(),
}));

vi.mock("./admin-client", () => ({
  createAdminClient: () => ({
    auth: { admin: { inviteUserByEmail, generateLink } },
  }),
  getSiteUrl: () => "https://dev.evaluchat.org",
}));

import { inviteWorkspaceParticipant } from "./invitation-helpers";

describe("inviteWorkspaceParticipant", () => {
  beforeEach(() => {
    inviteUserByEmail.mockReset();
    generateLink.mockReset();
  });

  it("sends an Auth invite for an unknown address", async () => {
    inviteUserByEmail.mockResolvedValue({ error: null });
    await expect(
      inviteWorkspaceParticipant("new@example.com")
    ).resolves.toEqual({ emailed: true });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("falls back to a magic link when the address is already registered", async () => {
    inviteUserByEmail.mockResolvedValue({
      error: {
        message: "A user with this email address has already been registered",
      },
    });
    generateLink.mockResolvedValue({ error: null });
    await expect(
      inviteWorkspaceParticipant("cronjev@outlook.com")
    ).resolves.toEqual({ emailed: true });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "cronjev@outlook.com",
      options: {
        redirectTo: "https://dev.evaluchat.org/auth/confirm?next=/workspace",
      },
    });
  });

  it("does not fail the caller when neither mail path works", async () => {
    inviteUserByEmail.mockResolvedValue({
      error: { message: "535 authentication failed" },
    });
    generateLink.mockResolvedValue({
      error: { message: "smtp timeout" },
    });
    await expect(
      inviteWorkspaceParticipant("cronjev@outlook.com")
    ).resolves.toEqual({ emailed: false });
  });
});
