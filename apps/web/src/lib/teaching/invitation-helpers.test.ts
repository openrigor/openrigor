import { beforeEach, describe, expect, it, vi } from "vitest";

const { inviteUserByEmail, generateLink, notifyWorkspaceParticipant } =
  vi.hoisted(() => ({
    inviteUserByEmail: vi.fn(),
    generateLink: vi.fn(),
    notifyWorkspaceParticipant: vi.fn(),
  }));

vi.mock("./admin-client", () => ({
  createAdminClient: () => ({
    auth: { admin: { inviteUserByEmail, generateLink } },
  }),
  getSiteUrl: () => "https://dev.openrigor.org",
}));

vi.mock("./participant-notify", () => ({
  notifyWorkspaceParticipant,
}));

import {
  inviteWorkspaceParticipant,
  type ParticipantInviteOutcome,
} from "./invitation-helpers";

const EMAIL_EXISTS_ERROR = {
  message: "A user with this email address has already been registered",
};

describe("inviteWorkspaceParticipant", () => {
  beforeEach(() => {
    inviteUserByEmail.mockReset();
    generateLink.mockReset();
    notifyWorkspaceParticipant.mockReset();
  });

  it("sends an Auth invite for an unknown address", async () => {
    inviteUserByEmail.mockResolvedValue({ error: null });
    await expect(
      inviteWorkspaceParticipant("new@example.com")
    ).resolves.toEqual({
      emailed: true,
      notified: false,
      outcome: "emailed" satisfies ParticipantInviteOutcome,
    });
    expect(generateLink).not.toHaveBeenCalled();
    expect(notifyWorkspaceParticipant).not.toHaveBeenCalled();
  });

  it("notifies an existing user via AgentMail instead of faking emailed", async () => {
    inviteUserByEmail.mockResolvedValue({ error: EMAIL_EXISTS_ERROR });
    generateLink.mockResolvedValue({ error: null });
    notifyWorkspaceParticipant.mockResolvedValue({
      ok: true,
      messageId: "m1",
    });

    await expect(
      inviteWorkspaceParticipant("cronjev@outlook.com")
    ).resolves.toEqual({
      emailed: false,
      notified: true,
      outcome: "notified" satisfies ParticipantInviteOutcome,
    });
    expect(notifyWorkspaceParticipant).toHaveBeenCalledWith({
      email: "cronjev@outlook.com",
    });
  });

  it("keeps magic-link access working but reports no email when notify skips", async () => {
    inviteUserByEmail.mockResolvedValue({ error: EMAIL_EXISTS_ERROR });
    generateLink.mockResolvedValue({ error: null });
    notifyWorkspaceParticipant.mockResolvedValue({
      skipped: true,
      reason: "missing_api_key",
    });

    await expect(
      inviteWorkspaceParticipant("cronjev@outlook.com")
    ).resolves.toEqual({
      emailed: false,
      notified: false,
      outcome: "added_no_email" satisfies ParticipantInviteOutcome,
    });
    // Magic link still generated so acceptance keeps working.
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "cronjev@outlook.com",
      options: {
        redirectTo: "https://dev.openrigor.org/auth/confirm?next=/workspace",
      },
    });
  });

  it("reports failure when neither mail path works", async () => {
    inviteUserByEmail.mockResolvedValue({
      error: { message: "535 authentication failed" },
    });
    generateLink.mockResolvedValue({
      error: { message: "smtp timeout" },
    });
    await expect(
      inviteWorkspaceParticipant("cronjev@outlook.com")
    ).resolves.toEqual({
      emailed: false,
      notified: false,
      outcome: "failed" satisfies ParticipantInviteOutcome,
    });
  });
});
