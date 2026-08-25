/**
 * The alert sweep.
 *
 * ── Why a sweep and not a database trigger ─────────────────────────────────
 *
 * The obvious design is a trigger on `enrollment_snapshots` that fires an
 * email the instant a section opens. It is the wrong one here. A trigger runs
 * inside the ingest transaction, so a slow or failing email provider would
 * stall — or roll back — a catalog write that is otherwise perfectly good, and
 * an ingest run that writes 160 sections would hold that transaction open
 * across 160 network calls to a third party.
 *
 * So the transition is *detected* in SQL (`sections_opened_since`, which uses
 * LAG and `has_open_seat` so heartbeat rows with the same open/closed state
 * are not treated as openings) and *delivered* out of band by this sweep. The
 * cost is latency bounded by the cron interval; the benefit is that email
 * never sits in the write path of the catalog.
 *
 * ── The ordering that matters ──────────────────────────────────────────────
 *
 * Read pending → send → record sent. Never record first. If the process dies
 * between send and record, a watcher gets the same alert twice on the next
 * sweep; if it were the other way round they would get it zero times and we
 * would have no record that anything went wrong. For a seat alert, duplicate
 * beats missing, and it is not close.
 *
 * ── The window ─────────────────────────────────────────────────────────────
 *
 * `pending_seat_alerts` takes a `since`, and dedupe against `alerts_sent` is
 * keyed on the exact transition timestamp — so a longer window is safe, just
 * more work. It is set well wider than the cron interval so that a few missed
 * ticks (a deploy, a provider outage, an unset API key) are recovered rather
 * than dropped. Past the window an unsent alert is abandoned on purpose: a
 * seat that opened six hours ago is not news, and emailing about it would send
 * people sprinting at a class that filled again long before.
 */

import { termLabel } from "@/lib/constants";
import { requireServiceRoleClient, type CatalogClient } from "@/lib/db/client";
import type { PendingSeatAlertRow } from "@/lib/db/schema";
import type { TermCode } from "@/lib/types";

import { renderSeatOpenedEmail } from "./render";
import type { EmailConfigGap } from "./resend";
import { describeEmailConfigGap, emailConfigGap, sendEmailBatch, RESEND_BATCH_LIMIT } from "./resend";

/**
 * How far back a sweep looks. Comfortably wider than the cron interval so a
 * handful of missed ticks recover, narrow enough that a stale opening is not
 * resurrected. See the header.
 */
export const ALERT_WINDOW_MINUTES = 90;

export interface AlertSweepSummary {
  /** Watcher × section pairs owed an email at the start of the sweep. */
  pending: number;
  /** Emails Resend accepted. */
  sent: number;
  /** Emails Resend rejected, or that never left because of a transport error. */
  failed: number;
  /** Rows written to `alerts_sent`. Should equal `sent`. */
  recorded: number;
  /** Distinct sections involved. */
  sections: number;
  elapsedMs: number;
  stoppedBecause: "complete" | "email_not_configured" | "deadline";
  /**
   * Set only alongside `stoppedBecause: "email_not_configured"`, naming which
   * variable to go set. `stoppedBecause` stays a single value because the
   * sweep's behaviour is identical either way — nothing sends, nothing is
   * recorded — and the difference is purely operational.
   */
  emailConfigGap?: EmailConfigGap;
}

export interface AlertSweepOptions {
  /** Injected in tests; defaults to the service-role client. */
  db?: CatalogClient;
  /** Wall-clock budget. The caller is usually a cron with a hard ceiling. */
  deadlineMs?: number;
  /** Absolute base URL for the secondary "full course page" link. */
  siteUrl?: string | null;
}

interface SectionContext {
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  callNumber: string;
  termCode: TermCode;
  courseId: string;
}

/**
 * Course code, section code and call number for the sections in this sweep.
 *
 * `pending_seat_alerts` returns seat numbers but not identity — it is a
 * fairness-and-dedupe query, not a catalog read. Rather than widening it,
 * the two catalog tables are read here in two round trips. Sections whose
 * lookup fails are dropped from the sweep rather than emailed with a blank
 * course name: an alert that cannot say which class it is about is worse than
 * silence, because the reader cannot act on it and cannot ignore it either.
 */
async function loadSectionContext(
  db: CatalogClient,
  sectionIds: string[],
): Promise<Map<string, SectionContext>> {
  const context = new Map<string, SectionContext>();
  if (sectionIds.length === 0) return context;

  const { data: sections, error: sectionsError } = await db
    .from("sections")
    .select("section_id, course_id, section_code, call_number, term_code")
    .in("section_id", sectionIds);
  if (sectionsError) throw new Error(`alert sweep: sections read failed: ${sectionsError.message}`);

  const courseIds = [...new Set((sections ?? []).map((row) => row.course_id))];
  if (courseIds.length === 0) return context;

  const { data: courses, error: coursesError } = await db
    .from("courses")
    .select("course_id, title, subject_code, course_number")
    .in("course_id", courseIds);
  if (coursesError) throw new Error(`alert sweep: courses read failed: ${coursesError.message}`);

  const byCourseId = new Map(courses?.map((row) => [row.course_id, row]) ?? []);

  for (const section of sections ?? []) {
    const course = byCourseId.get(section.course_id);
    if (!course) continue;
    context.set(section.section_id, {
      courseCode: `${course.subject_code} ${course.course_number}`,
      courseTitle: course.title,
      sectionCode: section.section_code,
      callNumber: section.call_number,
      termCode: section.term_code as TermCode,
      courseId: section.course_id,
    });
  }

  return context;
}

/** Pending alerts grouped by section, because `record_alerts_sent` is per-section. */
function groupBySection(rows: PendingSeatAlertRow[]): Map<string, PendingSeatAlertRow[]> {
  const grouped = new Map<string, PendingSeatAlertRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.section_id);
    if (existing) existing.push(row);
    else grouped.set(row.section_id, [row]);
  }
  return grouped;
}

export async function runAlertSweep(options: AlertSweepOptions = {}): Promise<AlertSweepSummary> {
  const startedAt = Date.now();
  const db = options.db ?? requireServiceRoleClient();
  const deadlineMs = options.deadlineMs ?? 40_000;
  const siteUrl = (options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

  const summary: AlertSweepSummary = {
    pending: 0,
    sent: 0,
    failed: 0,
    recorded: 0,
    sections: 0,
    elapsedMs: 0,
    stoppedBecause: "complete",
  };

  const since = new Date(startedAt - ALERT_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await db.rpc("pending_seat_alerts", { p_since: since });
  if (error) throw new Error(`pending_seat_alerts failed: ${error.message}`);

  const pending = data ?? [];
  summary.pending = pending.length;
  if (pending.length === 0) {
    summary.elapsedMs = Date.now() - startedAt;
    return summary;
  }

  // Checked after reading rather than before, so an unconfigured deployment
  // still reports how much mail it is failing to send. Silence here would look
  // identical to "nothing opened".
  const configGap = emailConfigGap();
  if (configGap) {
    summary.stoppedBecause = "email_not_configured";
    summary.emailConfigGap = configGap;
    summary.failed = pending.length;
    summary.elapsedMs = Date.now() - startedAt;
    console.error(
      `alert sweep: ${pending.length} alert(s) owed but not sent — ${describeEmailConfigGap(configGap)}`,
    );
    return summary;
  }

  const bySection = groupBySection(pending);
  const context = await loadSectionContext(db, [...bySection.keys()]);

  for (const [sectionId, rows] of bySection) {
    if (Date.now() - startedAt > deadlineMs) {
      summary.stoppedBecause = "deadline";
      break;
    }

    const section = context.get(sectionId);
    if (!section) {
      summary.failed += rows.length;
      continue;
    }
    summary.sections += 1;

    // One transition per section per sweep (the SQL already takes the latest),
    // so every row here shares a transition timestamp and seat reading.
    const transitionAt = rows[0].transition_at;

    // Chunked because Resend caps a batch, and because a section with hundreds
    // of watchers should record its first chunk even if a later one fails.
    for (let offset = 0; offset < rows.length; offset += RESEND_BATCH_LIMIT) {
      const chunk = rows.slice(offset, offset + RESEND_BATCH_LIMIT);
      const messages = chunk.map((row) => {
        const rendered = renderSeatOpenedEmail({
          courseCode: section.courseCode,
          courseTitle: section.courseTitle,
          sectionCode: section.sectionCode,
          callNumber: section.callNumber,
          termCode: section.termCode,
          enrollmentCount: row.enrollment_count,
          enrollmentCap: row.enrollment_cap,
          seatsOpen: row.seats_open,
          observedAt: row.transition_at,
          watcherCount: row.watcher_count,
          courseUrl: siteUrl ? `${siteUrl}/course/${section.courseId}` : null,
        });
        return { to: row.email, ...rendered };
      });

      const outcomes = await sendEmailBatch(messages);
      const deliveredUserIds: string[] = [];
      outcomes.forEach((outcome, index) => {
        if (outcome.ok) deliveredUserIds.push(chunk[index].user_id);
        else summary.failed += 1;
      });
      summary.sent += deliveredUserIds.length;

      if (deliveredUserIds.length > 0) {
        const { data: recorded, error: recordError } = await db.rpc("record_alerts_sent", {
          p_user_ids: deliveredUserIds,
          p_section_id: sectionId,
          p_transition_at: transitionAt,
          p_reason: "seat_opened",
          p_channel: "email",
        });
        // A failed record means the next sweep resends. Logged, not thrown:
        // the remaining sections still deserve their emails.
        if (recordError) {
          console.error(
            `alert sweep: record_alerts_sent failed for ${sectionId} (${termLabel(section.termCode)}): ${recordError.message}`,
          );
        } else {
          summary.recorded += typeof recorded === "number" ? recorded : 0;
        }
      }
    }
  }

  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}
