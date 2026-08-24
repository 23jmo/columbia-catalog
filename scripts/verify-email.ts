/**
 * Prove the seat-alert transport works, before a seat ever opens.
 *
 *   npx tsx --env-file=.env.local scripts/verify-email.ts you@example.com
 *
 * WHY THIS EXISTS. Everything in the alert path is covered by tests except the
 * one step that leaves the machine: the POST to Resend. That step is gated on
 * two environment variables somebody has to set by hand (.plans/BLOCKERS.md
 * #7), and the failure it produces when they are wrong is quiet — the sweep
 * reports `email_not_configured`, records nothing, and looks exactly like a
 * term in which no seat happened to open. Without this script the only way to
 * learn the credential is wrong is to miss a real alert.
 *
 * So this sends ONE message, rendered by the same `renderSeatOpenedEmail` the
 * sweep uses, through the same `sendEmailBatch`, and prints what came back. It
 * touches no database and no Columbia host: the section it describes is
 * obviously fake, because a real course code in a test email is a message
 * somebody will act on.
 *
 * Exit code is 0 only if Resend accepted the message and returned an id.
 */

import { renderSeatOpenedEmail } from "../lib/alerts/render";
import {
  describeEmailConfigGap,
  emailConfigGap,
  sendEmailBatch,
} from "../lib/alerts/resend";

/**
 * A section that cannot be confused for a real one. `TEST` is already the
 * disabled placeholder subject in the crawl queue (BLOCKERS #9), so nothing
 * downstream will ever resolve this to a course somebody could try to register
 * for.
 */
const FAKE = {
  courseCode: "TEST 0000",
  courseTitle: "TRANSPORT CHECK — NOT A REAL COURSE",
  sectionCode: "001",
  callNumber: "00000",
  termCode: "20263" as const,
  enrollmentCount: 109,
  enrollmentCap: 110,
  seatsOpen: 1,
  watcherCount: 1,
};

async function main(): Promise<void> {
  const recipient = process.argv[2];
  if (!recipient || !recipient.includes("@")) {
    console.error("usage: npx tsx --env-file=.env.local scripts/verify-email.ts <recipient>");
    process.exitCode = 2;
    return;
  }

  const gap = emailConfigGap();
  if (gap) {
    console.error(`Not configured: ${describeEmailConfigGap(gap)}`);
    console.error(`\nSee .plans/BLOCKERS.md #7 for the two ways to get a key.`);
    console.error(
      `\nQuickest: a Resend API key plus ALERT_FROM_EMAIL=onboarding@resend.dev,\n` +
        `which needs no domain and delivers to the address that owns the key —\n` +
        `so pass that same address as the recipient here.`,
    );
    process.exitCode = 1;
    return;
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const rendered = renderSeatOpenedEmail({
    ...FAKE,
    observedAt: new Date().toISOString(),
    courseUrl: siteUrl ? `${siteUrl}/search` : null,
  });

  console.log(`from    ${process.env.ALERT_FROM_EMAIL}`);
  console.log(`to      ${recipient}`);
  console.log(`subject ${rendered.subject}\n`);

  const [outcome] = await sendEmailBatch([{ to: recipient, ...rendered }]);
  if (outcome?.ok) {
    console.log(`Accepted by Resend, id ${outcome.id}`);
    console.log(`\nThe transport works. Seat alerts will send the moment a watched`);
    console.log(`section opens a seat — no further configuration.`);
    return;
  }

  console.error(`Rejected: ${outcome?.error ?? "no outcome returned"}`);
  if (outcome?.error?.includes("403") || outcome?.error?.includes("testing emails")) {
    console.error(
      `\nThat is the shared-sender restriction, not a broken key:\n` +
        `onboarding@resend.dev only delivers to the address that owns the\n` +
        `Resend account. Either send to that address, or verify a domain and\n` +
        `set ALERT_FROM_EMAIL to something on it.`,
    );
  }
  process.exitCode = 1;
}

void main();
