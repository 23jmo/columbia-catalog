/**
 * `loadActiveRegistrationWindows` — the read that lets a watched subject reach
 * the 30-second registration tier.
 *
 * The interesting assertions here are about *where the filtering happens*. The
 * window test is `occurs_at <= now < ends_at`, and it is pushed into SQL on
 * purpose so that "now" is the database's clock rather than a serverless
 * function's. A test that only checked the returned shape would pass just as
 * happily against a version that computed the cutoff locally — which is the
 * regression worth catching, because it fails only on a clock-drifted host and
 * only at the moment a window opens.
 */

import { describe, expect, it } from "vitest";

import { loadActiveRegistrationWindows } from "./crawl-store";
import type { CatalogClient } from "./client";
import type { RegistrationMilestoneRow } from "./schema";

type MilestoneFixture = Pick<
  RegistrationMilestoneRow,
  "term_code" | "label" | "occurs_at" | "ends_at"
>;

const WINDOW: MilestoneFixture = {
  term_code: "20263",
  label: "Monday–Friday. Online registration for Fall 2026 via SSOL.",
  occurs_at: "2026-08-25T04:00:00.000Z",
  ends_at: "2026-08-28T03:59:59.000Z",
};

interface Recorded {
  table: string;
  columns: string;
  filters: { op: string; column: string; value: unknown }[];
}

function fakeDb(result: { data?: MilestoneFixture[]; error?: { message: string } }) {
  const recorded: Recorded = { table: "", columns: "", filters: [] };

  const builder = {
    select(columns: string) {
      recorded.columns = columns;
      return this;
    },
    not(column: string, op: string, value: unknown) {
      recorded.filters.push({ op: `not.${op}`, column, value });
      return this;
    },
    lte(column: string, value: unknown) {
      recorded.filters.push({ op: "lte", column, value });
      return this;
    },
    gt(column: string, value: unknown) {
      recorded.filters.push({ op: "gt", column, value });
      return this;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(
        result.error ? { data: null, error: result.error } : { data: result.data ?? [], error: null },
      ).then(resolve);
    },
  };

  const client = {
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  };

  return { client: client as unknown as CatalogClient, recorded };
}

describe("loadActiveRegistrationWindows", () => {
  it("asks the database to apply its own clock", async () => {
    const { client, recorded } = fakeDb({ data: [WINDOW] });
    await loadActiveRegistrationWindows(client);

    const opens = recorded.filters.find((f) => f.column === "occurs_at");
    const closes = recorded.filters.find((f) => f.column === "ends_at" && f.op === "gt");

    // Both bounds are the literal `now()`, evaluated by Postgres. An ISO string
    // here would mean the caller's clock decided whether a window is open.
    expect(opens).toEqual({ op: "lte", column: "occurs_at", value: "now()" });
    expect(closes).toEqual({ op: "gt", column: "ends_at", value: "now()" });
  });

  it("excludes milestones that are moments rather than windows", async () => {
    const { client, recorded } = fakeDb({ data: [] });
    await loadActiveRegistrationWindows(client);

    // A milestone with no end is a point in time and cannot contain the
    // present, so it can never be a registration window.
    expect(recorded.filters).toContainEqual({ op: "not.is", column: "ends_at", value: null });
    expect(recorded.table).toBe("registration_milestones");
  });

  it("maps a row onto the window the scheduler expects", async () => {
    const { client } = fakeDb({ data: [WINDOW] });
    const windows = await loadActiveRegistrationWindows(client);

    expect(windows).toEqual([
      {
        termCode: "20263",
        label: WINDOW.label,
        opensAt: "2026-08-25T04:00:00.000Z",
        closesAt: "2026-08-28T03:59:59.000Z",
      },
    ]);
  });

  it("returns nothing rather than throwing when the calendar is unreachable", async () => {
    const { client } = fakeDb({ error: { message: "connection reset" } });

    // Tier maintenance degrades to the hot tier; a failed read must not be able
    // to stop the crawl that refreshes seat counts.
    await expect(loadActiveRegistrationWindows(client)).resolves.toEqual([]);
  });
});
