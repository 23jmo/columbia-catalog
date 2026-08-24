/**
 * Term rows, read for their calendar bounds.
 *
 * `buildTerm()` in lib/constants derives everything a term needs from its code
 * — season, year, labels — except the two things a code cannot imply: the
 * first and last day of instruction. Those come from Columbia's published
 * academic calendar, so they live in the database, and a `Term` that has been
 * through here is the difference between an `.ics` bounded by real dates and
 * one bounded by a per-season guess (see lib/schedule/term-dates.ts).
 *
 * Returns null rather than throwing, and rather than falling back to a
 * synthetic term. A caller that wanted the synthetic one can build it; a
 * caller handed a synthetic term wearing a real one's shape cannot tell the
 * difference, and `termBounds` reports `isAuthoritative` precisely so that
 * distinction survives.
 */

import type { Term, TermCode } from "@/lib/types";

import { createAnonServerClient, getBrowserClient, isConfigured } from "./client";
import { rowToTerm } from "./schema";

function readClient() {
  if (!isConfigured()) return null;
  return typeof window === "undefined" ? createAnonServerClient() : getBrowserClient();
}

/** One term, with whatever calendar bounds have been ingested for it. */
export async function getTerm(termCode: TermCode): Promise<Term | null> {
  const db = readClient();
  if (!db) return null;

  const { data, error } = await db
    .from("terms")
    .select("*")
    .eq("term_code", termCode)
    .maybeSingle();

  if (error || !data) return null;
  return rowToTerm(data);
}
