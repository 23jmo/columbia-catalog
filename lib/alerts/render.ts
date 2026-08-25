/**
 * The seat-opened email.
 *
 * ── What this email is for ─────────────────────────────────────────────────
 *
 * It has exactly one job: get the reader from their inbox into Vergil with the
 * call number already in hand, in as few seconds as possible. Every decision
 * below follows from that.
 *
 *   · The call number is in the subject line, because during a scramble the
 *     notification preview on a lock screen may be all the reader sees before
 *     they start typing.
 *
 *   · The primary link is Vergil, not our own course page. Sending them to us
 *     first would add a hop to a page whose only useful button is the one
 *     that goes to Vergil anyway.
 *
 *   · The watcher count is stated plainly. Spec §14 refuses to stagger
 *     notifications — deciding who gets a head start into a class is not a
 *     role this product takes — so the honest thing is to say how many other
 *     people got this same email at the same moment.
 *
 *   · The seat reading carries its observation time, like every other seat
 *     number in this product. An email that says "a seat opened" without
 *     saying when we looked is a claim we cannot stand behind by the time it
 *     is read.
 *
 * ── Why both HTML and text ─────────────────────────────────────────────────
 *
 * A text/plain alternative is what keeps this out of a spam folder as much as
 * it is an accessibility measure, and a spam-foldered seat alert is worse than
 * no seat alert — it is a promise we appeared to keep.
 */

import { termLabel, vergilSectionUrl } from "@/lib/constants";
import type { TermCode } from "@/lib/types";

export interface SeatOpenedEmailInput {
  /** e.g. "COMS 4118" — how the reader thinks about the class. */
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  callNumber: string;
  termCode: TermCode;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  seatsOpen: number | null;
  /** When the reading that triggered this alert was observed. */
  observedAt: string;
  /** Including the reader. Stated upfront, deliberately. */
  watcherCount: number;
  /** Absolute URL of our own course page, for the secondary link. */
  courseUrl: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Minimal escaping — every interpolated value below is catalog text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seatLine(input: SeatOpenedEmailInput): string {
  const open = input.seatsOpen;
  const count = input.enrollmentCount;
  const cap = input.enrollmentCap;

  // "1 seat open" is worth saying precisely; anything vaguer is worth saying
  // vaguely rather than inventing a number we did not read.
  const openPart =
    open === null ? "A seat opened" : `${open} ${open === 1 ? "seat is" : "seats are"} open`;
  const ofPart = count !== null && cap !== null ? ` (${count} of ${cap} enrolled)` : "";
  return `${openPart}${ofPart}.`;
}

function observedLine(observedAt: string): string {
  const when = new Date(observedAt);
  if (Number.isNaN(when.getTime())) return "Seat count read from the Directory of Classes.";
  const formatted = when.toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `Read from the Directory of Classes at ${formatted} ET.`;
}

function watcherLine(watcherCount: number): string {
  if (watcherCount <= 1) return "You are the only person watching this section.";
  return `${watcherCount} people are watching this section. Everyone was emailed at the same time.`;
}

export function renderSeatOpenedEmail(input: SeatOpenedEmailInput): RenderedEmail {
  const heading = `${input.courseCode} ${input.sectionCode} — ${input.courseTitle}`;
  const registerUrl = vergilSectionUrl(input.termCode, input.callNumber);
  const term = termLabel(input.termCode);

  const subject = `Seat open: ${input.courseCode} ${input.sectionCode} · call number ${input.callNumber}`;

  const text = [
    heading,
    term,
    "",
    seatLine(input),
    observedLine(input.observedAt),
    "",
    `Call number: ${input.callNumber}`,
    `Register: ${registerUrl}`,
    input.courseUrl ? `Course details: ${input.courseUrl}` : null,
    "",
    watcherLine(input.watcherCount),
    "",
    "You are receiving this because you watched this section on LionPlan.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `<!-- Inline styles only: Gmail strips <style> blocks. -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#18181b;">
  <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">Seat open · ${escapeHtml(term)}</p>
  <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;">${escapeHtml(heading)}</h1>
  <p style="margin:0 0 4px;font-size:15px;line-height:1.5;">${escapeHtml(seatLine(input))}</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(observedLine(input.observedAt))}</p>
  <p style="margin:0 0 20px;font-size:15px;">Call number <strong style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;">${escapeHtml(input.callNumber)}</strong></p>
  <p style="margin:0 0 24px;">
    <a href="${escapeHtml(registerUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:15px;font-weight:500;">Register in Vergil</a>
  </p>
  ${
    input.courseUrl
      ? `<p style="margin:0 0 24px;font-size:14px;"><a href="${escapeHtml(input.courseUrl)}" style="color:#3f3f46;">See the full course page</a></p>`
      : ""
  }
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
  <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(watcherLine(input.watcherCount))}</p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">You are receiving this because you watched this section on LionPlan.</p>
</div>`;

  return { subject, html, text };
}
