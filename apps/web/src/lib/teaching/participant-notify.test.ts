import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyWorkspaceParticipant } from "./participant-notify";

const originalKey = process.env.AGENTMAIL_API_KEY;
const originalInbox = process.env.AGENTMAIL_INBOX_ID;

describe("notifyWorkspaceParticipant", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.AGENTMAIL_INBOX_ID;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.AGENTMAIL_API_KEY;
    } else {
      process.env.AGENTMAIL_API_KEY = originalKey;
    }
    if (originalInbox === undefined) {
      delete process.env.AGENTMAIL_INBOX_ID;
    } else {
      process.env.AGENTMAIL_INBOX_ID = originalInbox;
    }
  });

  it("skips without an API key", async () => {
    delete process.env.AGENTMAIL_API_KEY;
    await expect(
      notifyWorkspaceParticipant({ email: "a@example.com" }, fetchMock)
    ).resolves.toEqual({ skipped: true, reason: "missing_api_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a participant email via AgentMail", async () => {
    process.env.AGENTMAIL_API_KEY = "test-key";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message_id: "m1" }), { status: 200 })
    );

    await expect(
      notifyWorkspaceParticipant(
        {
          email: "a@example.com",
          methodTitle: "Essay",
          course: "History",
          dueDate: "2026-09-01",
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
      labels: string[];
    };
    expect(body.to).toEqual(["a@example.com"]);
    expect(body.reply_to).toEqual(["hello@openrigor.org"]);
    expect(body.subject).toContain("Essay");
    expect(body.text).toContain("https://openrigor.org/workspace");
    expect(body.labels).toContain("workspace-participant");
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
