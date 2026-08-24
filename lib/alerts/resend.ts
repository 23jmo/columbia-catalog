/**
 * Resend transport.
 *
 * Spoken to over `fetch` rather than the `resend` npm package, for two
 * reasons. The API is one POST with a JSON body — a dependency buys nothing
 * but a version to keep current — and more importantly the alert sweep runs on
 * a cron with no human watching, so the failure surface should be one we can
 * read end to end.
 *
 * ── Configuration is optional on purpose ───────────────────────────────────
 *
 * `RESEND_API_KEY` is not provisioned yet (see .plans/BLOCKERS.md #2). Every
 * entry point here answers honestly when it is missing instead of throwing:
 * the sweep reports `email_not_configured`, records nothing as sent, and the
 * pending alerts stay pending. When the key appears, the first sweep after it
 * delivers the backlog — provided it is still inside the sweep window.
 */

/** Resend's documented ceiling for one `/emails/batch` request. */
export const RESEND_BATCH_LIMIT = 100;

const RESEND_ENDPOINT = "https://api.resend.com/emails/batch";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOutcome {
  ok: boolean;
  id?: string;
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && fromAddress());
}

/**
 * The From header. Configuration rather than a constant, because the value that
 * works in production is not one this repository can know.
 *
 * A verified sending domain is required to reach *arbitrary* recipients, which
 * is what shipping to students needs. It is not required to start: Resend's
 * shared `onboarding@resend.dev` sender works with only an API key and delivers
 * to the account owner's own address, which is enough to exercise the whole
 * path end to end. Nothing here validates the domain, so either value works.
 */
function fromAddress(): string | null {
  return process.env.ALERT_FROM_EMAIL ?? null;
}

/**
 * Sends up to `RESEND_BATCH_LIMIT` distinct emails in one request and returns
 * one outcome per message, positionally aligned with the input.
 *
 * Distinct emails, not one email with many recipients: a seat alert names the
 * section and the recipient's own watch, and putting thirty classmates in a To
 * header would leak exactly the "who is watching this" list that spec §14 says
 * is not ours to publish.
 *
 * Never throws. A transport failure comes back as every outcome being `ok:
 * false`, which the caller turns into "not recorded as sent" — the alert stays
 * owed rather than being silently consumed.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<SendOutcome[]> {
  if (messages.length === 0) return [];

  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey || !from) {
    return messages.map(() => ({ ok: false, error: "email_not_configured" }));
  }
  if (messages.length > RESEND_BATCH_LIMIT) {
    return messages.map(() => ({ ok: false, error: "batch_too_large" }));
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        messages.map((message) => ({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        })),
      ),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return messages.map(() => ({ ok: false, error }));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`;
    return messages.map(() => ({ ok: false, error }));
  }

  // Success shape is `{ data: [{ id }, ...] }` in request order. A shorter
  // array than we sent would mean we cannot tell which message it describes,
  // so anything past its end is reported as not sent rather than guessed at.
  const payload = (await response.json().catch(() => null)) as { data?: { id?: string }[] } | null;
  const ids = payload?.data ?? [];

  return messages.map((_, index) => {
    const id = ids[index]?.id;
    return id ? { ok: true, id } : { ok: false, error: "no_id_returned" };
  });
}
