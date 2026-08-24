/**
 * Tests for the alert sweep, centred on ONE invariant:
 *
 *   an alert is recorded as sent if and only if it was actually delivered.
 *
 * Everything else in this file is a way that invariant can break. It matters
 * more than the happy path because both failure directions are silent:
 * recording an undelivered alert drops a watcher forever with no trace, and
 * the sweep's own summary would still read like success.
 *
 * The `email_not_configured` branch is the one that had no coverage at all,
 * which is exactly backwards — it is the branch that runs in production today
 * (see .plans/BLOCKERS.md item 7), on every sweep, until a Resend key exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogClient } from "@/lib/db/client";
import type { CourseRow, PendingSeatAlertRow, SectionRow } from "@/lib/db/schema";

const sendEmailBatch = vi.fn();
const emailConfigGap = vi.fn();

vi.mock("./resend", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, sendEmailBatch, emailConfigGap };
});

const { runAlertSweep } = await import("./sweep");

const SECTION = "20263COMS4771W001";

function pendingRow(overrides: Partial<PendingSeatAlertRow> = {}): PendingSeatAlertRow {
  return {
    user_id: "user-1",
    email: "one@columbia.edu",
    section_id: SECTION,
    transition_at: "2026-08-24T05:00:00.000Z",
    enrollment_count: 109,
    enrollment_cap: 110,
    seats_open: 1,
    watcher_count: 3,
    ...overrides,
  };
}

interface FakeDb {
  client: CatalogClient;
  rpcCalls: { name: string; args: unknown }[];
  recordCalls: { p_user_ids: string[]; p_section_id: string }[];
}

/**
 * A double rather than a mock of the Supabase client: the sweep only reaches
 * for `.rpc` and `.from(...).select(...).in(...)`, and hand-writing those four
 * makes the test fail loudly if it ever reaches for a fifth.
 */
/**
 * The exact column lists `loadSectionContext` selects, pinned to the real row
 * types. An untyped fixture is how a fake drifts from the schema in silence:
 * `call_number` is `text` in Postgres, and a fixture that supplied the number
 * `13670` only failed once it reached `escapeHtml`, several frames away from
 * the mistake. Pinning the shape moves that failure to the compiler.
 */
type SectionFixture = Pick<
  SectionRow,
  "section_id" | "course_id" | "section_code" | "call_number" | "term_code"
>;
type CourseFixture = Pick<CourseRow, "course_id" | "title" | "subject_code" | "course_number">;

function fakeDb(options: {
  pending: PendingSeatAlertRow[];
  sectionRows?: SectionFixture[];
  courseRows?: CourseFixture[];
  recordError?: string;
}): FakeDb {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const recordCalls: { p_user_ids: string[]; p_section_id: string }[] = [];

  const sectionRows = options.sectionRows ?? [
    {
      section_id: SECTION,
      course_id: "COMS4771W",
      section_code: "001",
      call_number: "13670",
      term_code: "20263",
    },
  ];
  const courseRows = options.courseRows ?? [
    { course_id: "COMS4771W", title: "MACHINE LEARNING", subject_code: "COMS", course_number: 4771 },
  ];

  const client = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === "pending_seat_alerts") return { data: options.pending, error: null };
      if (name === "record_alerts_sent") {
        const typed = args as { p_user_ids: string[]; p_section_id: string };
        recordCalls.push(typed);
        if (options.recordError) return { data: null, error: { message: options.recordError } };
        return { data: typed.p_user_ids.length, error: null };
      }
      throw new Error(`unexpected rpc: ${name}`);
    },
    from: (table: string) => ({
      select: () => ({
        in: async () => {
          if (table === "sections") return { data: sectionRows, error: null };
          if (table === "courses") return { data: courseRows, error: null };
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    }),
  } as unknown as CatalogClient;

  return { client, rpcCalls, recordCalls };
}

describe("runAlertSweep", () => {
  beforeEach(() => {
    sendEmailBatch.mockReset();
    emailConfigGap.mockReset();
    emailConfigGap.mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports nothing to do without consulting the transport", async () => {
    const db = fakeDb({ pending: [] });
    const summary = await runAlertSweep({ db: db.client });
    expect(summary.stoppedBecause).toBe("complete");
    expect(summary.pending).toBe(0);
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  describe("when email is not configured", () => {
    beforeEach(() => emailConfigGap.mockReturnValue("both"));

    it("counts what it could not send instead of reporting success", async () => {
      const db = fakeDb({ pending: [pendingRow(), pendingRow({ user_id: "user-2" })] });
      const summary = await runAlertSweep({ db: db.client });
      // "complete" here would be indistinguishable from "nothing opened",
      // which is the whole reason this branch reports a distinct reason.
      expect(summary.stoppedBecause).toBe("email_not_configured");
      expect(summary.pending).toBe(2);
      expect(summary.failed).toBe(2);
      expect(summary.sent).toBe(0);
    });

    it("names which variable is missing, so the reason is actionable", async () => {
      emailConfigGap.mockReturnValue("from_address");
      const db = fakeDb({ pending: [pendingRow()] });
      const summary = await runAlertSweep({ db: db.client });
      // `stoppedBecause` says the sweep did nothing; this says why, and the
      // two causes need different fixes in different dashboards.
      expect(summary.emailConfigGap).toBe("from_address");
    });

    it("records nothing, so the next sweep still owes the alert", async () => {
      const db = fakeDb({ pending: [pendingRow()] });
      const summary = await runAlertSweep({ db: db.client });
      expect(summary.recorded).toBe(0);
      expect(db.recordCalls).toHaveLength(0);
      expect(db.rpcCalls.map((call) => call.name)).toEqual(["pending_seat_alerts"]);
    });

    it("does not send anything", async () => {
      const db = fakeDb({ pending: [pendingRow()] });
      await runAlertSweep({ db: db.client });
      expect(sendEmailBatch).not.toHaveBeenCalled();
    });
  });

  it("records exactly the recipients the transport accepted", async () => {
    const db = fakeDb({
      pending: [
        pendingRow({ user_id: "delivered", email: "a@columbia.edu" }),
        pendingRow({ user_id: "rejected", email: "b@columbia.edu" }),
      ],
    });
    // Positionally aligned with the input, as sendEmailBatch documents.
    sendEmailBatch.mockResolvedValue([{ ok: true, id: "m1" }, { ok: false, error: "bounced" }]);

    const summary = await runAlertSweep({ db: db.client });

    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
    expect(db.recordCalls).toHaveLength(1);
    // The rejected watcher must not be booked as notified -- they would never
    // be retried, and the summary would still say one alert went out.
    expect(db.recordCalls[0].p_user_ids).toEqual(["delivered"]);
  });

  it("records nothing when the transport rejects every recipient", async () => {
    const db = fakeDb({ pending: [pendingRow(), pendingRow({ user_id: "user-2" })] });
    sendEmailBatch.mockResolvedValue([
      { ok: false, error: "email_not_configured" },
      { ok: false, error: "email_not_configured" },
    ]);

    const summary = await runAlertSweep({ db: db.client });

    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(2);
    expect(db.recordCalls).toHaveLength(0);
  });

  it("counts a send as sent even when booking it fails, so the retry duplicates rather than drops", async () => {
    const db = fakeDb({ pending: [pendingRow()], recordError: "deadlock detected" });
    sendEmailBatch.mockResolvedValue([{ ok: true, id: "m1" }]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runAlertSweep({ db: db.client });

    expect(summary.sent).toBe(1);
    expect(summary.recorded).toBe(0);
    // The header's ordering rule: duplicate beats missing. An unrecorded send
    // is resent next sweep, which is the failure we choose.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("treats a section it cannot describe as failed rather than emailing a blank", async () => {
    const db = fakeDb({ pending: [pendingRow()], sectionRows: [] });
    const summary = await runAlertSweep({ db: db.client });
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("passes the recipient's own address and the section's identity to the renderer", async () => {
    const db = fakeDb({ pending: [pendingRow({ email: "watcher@columbia.edu" })] });
    sendEmailBatch.mockResolvedValue([{ ok: true, id: "m1" }]);

    await runAlertSweep({ db: db.client, siteUrl: "https://example.test/" });

    const messages = sendEmailBatch.mock.calls[0][0] as { to: string; subject: string }[];
    expect(messages).toHaveLength(1);
    // One message per watcher, addressed only to them -- spec §14 forbids
    // revealing the watcher list, and a shared To header would do exactly that.
    expect(messages[0].to).toBe("watcher@columbia.edu");
    expect(messages[0].subject).toContain("COMS");
  });
});
