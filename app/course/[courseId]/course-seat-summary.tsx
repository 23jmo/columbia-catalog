"use client";

import { SeatBadge, aggregateSeatFigures } from "@/components/catalog/seat-badge";
import { SeatState } from "@/components/course/seat-state";
import type { Section } from "@/lib/types";

/**
 * Above-the-fold seat state for the whole course.
 *
 * A client boundary for a purely presentational block, which needs a word of
 * explanation: `aggregateSeatFigures` is exported from a `"use client"` module,
 * so a server component can render `SeatBadge` but cannot call the aggregator
 * that feeds it. Re-implementing the aggregation server-side would fork the
 * rule for "how many sections still have room" across two files — the exact
 * kind of quiet divergence that makes two screens disagree about a number.
 * Crossing the boundary here is the cheaper correctness.
 *
 * One section renders the full seat block; several render the totals with the
 * OLDEST provenance stamp among them, because the weakest reading is the
 * honest one to advertise for a total.
 */

export function CourseSeatSummary({ sections }: { sections: Section[] }) {
  if (sections.length === 1) return <SeatState section={sections[0]} />;

  const figures = aggregateSeatFigures(sections);
  return <SeatBadge figures={figures} layout="stacked" />;
}
