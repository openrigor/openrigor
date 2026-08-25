export type ParticipantNotifyPayload = {
  email: string;
  /** Supabase-generated sign-in link (magiclink action_link), if available. */
  actionLink?: string;
};

export type ParticipantNotifyResult =
  | { skipped: true; reason: string }
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

const API_BASE = "https://api.agentmail.to/v0";
const DEFAULT_INBOX = "evaluchattest@agentmail.to";
/** Replies go to the product inbox, not the AgentMail send inbox. */
const DEFAULT_REPLY_TO = "hello@openrigor.org";

function buildBody(payload: ParticipantNotifyPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "[OpenRigor] You've been added to a workspace item";
  const ctaUrl = payload.actionLink || "https://openrigor.org/workspace";

  const text = [
    "You've been added as a participant on OpenRigor.",
    "",
    payload.actionLink
      ? "Open your assignment (sign-in link):"
      : "Sign in to view your assignment:",
    ctaUrl,
    "",
    "If you were not expecting this, you can ignore this email.",
  ].join("\n");

  const html = `<p>You've been added as a participant on OpenRigor.</p>
<p><a href="${escapeHtml(ctaUrl)}">Open your assignment</a></p>
<p>If you were not expecting this, you can ignore this email.</p>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Best-effort AgentMail notification for a participant whose Auth account
 * already exists (Supabase never sends invite emails for those).
 * Missing API key skips; HTTP failures return { ok: false } (do not throw).
 */
export async function notifyWorkspaceParticipant(
  payload: ParticipantNotifyPayload,
  fetchImpl: typeof fetch = fetch
): Promise<ParticipantNotifyResult> {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    return { skipped: true, reason: "missing_api_key" };
  }

  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim() || DEFAULT_INBOX;
  const replyTo =
    process.env.PARTICIPANT_NOTIFY_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
  const { subject, text, html } = buildBody(payload);

  const url = `${API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/send`;

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [payload.email],
        reply_to: [replyTo],
        subject,
        text,
        html,
        labels: ["workspace-participant"],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `AgentMail ${res.status}: ${body.slice(0, 500)}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      message_id?: string;
    };
    return { ok: true, messageId: data.message_id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
