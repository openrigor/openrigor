import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyWorkspaceParticipant } from "./participant-notify";

const originalValues = {
  AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY,
  AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID,
  PARTICIPANT_NOTIFY_REPLY_TO: process.env.PARTICIPANT_NOTIFY_REPLY_TO,
};

describe("notifyWorkspaceParticipant", () => {
  const fetchMock = vi.fn();

  const restoreEnv = (
    key: keyof typeof originalValues,
    value: string | undefined
  ) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.AGENTMAIL_INBOX_ID;
    delete process.env.PARTICIPANT_NOTIFY_REPLY_TO;
  });

  afterEach(() => {
    restoreEnv("AGENTMAIL_API_KEY", originalValues.AGENTMAIL_API_KEY);
    restoreEnv("AGENTMAIL_INBOX_ID", originalValues.AGENTMAIL_INBOX_ID);
    restoreEnv(
      "PARTICIPANT_NOTIFY_REPLY_TO",
      originalValues.PARTICIPANT_NOTIFY_REPLY_TO
    );
  });

  it("skips without an API key", async () => {
    delete process.env.AGENTMAIL_API_KEY;
    await expect(
      notifyWorkspaceParticipant({ email: "a@example.com" }, fetchMock)
    ).resolves.toEqual({ skipped: true, reason: "missing_api_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a participant email with the sign-in link via AgentMail", async () => {
    process.env.AGENTMAIL_API_KEY = "test-key";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message_id: "m1" }), { status: 200 })
    );

    await expect(
      notifyWorkspaceParticipant(
        {
          email: "a@example.com",
          actionLink:
            "https://supabase.openrigor.org/auth/v1/verify?token=tok&type=magiclink&redirect_to=https%3A%2F%2Fdev.openrigor.org",
        },
        fetchMock
      )
    ).resolves.toEqual({ ok: true, messageId: "m1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.agentmail.to/v0/inboxes/evaluchattest%40agentmail.to/messages/send"
    );
    const body = JSON.parse(String(init.body)) as {
      to: string[];
      reply_to: string[];
      subject: string;
      text: string;
      html: string;
      labels: string[];
    };
    expect(body.to).toEqual(["a@example.com"]);
    expect(body.reply_to).toEqual(["hello@openrigor.org"]);
    expect(body.subject).toContain("[OpenRigor]");
    expect(body.text).toContain("token=tok&type=magiclink");
    expect(body.html).toContain("type=magiclink&amp;redirect_to=");
    expect(body.labels).toContain("workspace-participant");
  });

  it("falls back to the workspace URL when no action link is available", async () => {
    process.env.AGENTMAIL_API_KEY = "test-key";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await expect(
      notifyWorkspaceParticipant({ email: "a@example.com" }, fetchMock)
    ).resolves.toEqual({ ok: true, messageId: undefined });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toContain("https://openrigor.org/workspace");
  });

  it("reports HTTP failures without throwing", async () => {
    process.env.AGENTMAIL_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      notifyWorkspaceParticipant({ email: "a@example.com" }, fetchMock)
    ).resolves.toEqual({
      ok: false,
      error: expect.stringContaining("AgentMail 429"),
    });
  });
});
