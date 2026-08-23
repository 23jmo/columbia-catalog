"use client";

import { useCallback } from "react";

import { InstructorCard } from "@/components/course/instructor-profile";
import type { RmpSnapshot } from "@/lib/types";

/**
 * The instructor block.
 *
 * Client-side for exactly one reason: RateMyProfessor is read LIVE, at view
 * time, and never stored (spec §12 and the compliance header on
 * `app/api/rmp/[instructor]/route.ts`). Fetching it from the browser when the
 * card mounts is what makes "live and unstored" true rather than aspirational —
 * a server render could be cached by a CDN and quietly become a mirror.
 *
 * Our own reputation aggregation is a separate number and stays separate:
 * `reputation` here is the CULPA/Reddit summary and it is never combined with
 * the RMP figures beside it.
 */

export interface InstructorsPanelProps {
  /** Instructor name → the section codes they teach on this course. */
  instructors: { name: string; sectionCodes: string[]; alsoTeaches: string[] }[];
}

export function InstructorsPanel({ instructors }: InstructorsPanelProps) {
  /**
   * Live lookup. Returns null for "no usable RMP data", which the block
   * renders as a calm no-data state with a link out — never as an error.
   * Nothing is written to storage of any kind on this path.
   */
  const lookupRmp = useCallback(async (instructorName: string): Promise<RmpSnapshot | null> => {
    const response = await fetch(`/api/rmp/${encodeURIComponent(instructorName)}`, {
      // Belt and braces alongside the route's own no-store headers.
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as RmpSnapshot | null;
  }, []);

  if (instructors.length === 0) {
    return (
      <p className="text-body-regular text-text-secondary">
        No instructor is listed for this course yet. The directory usually fills this in
        closer to registration.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {instructors.map((instructor) => (
        <InstructorCard
          key={instructor.name}
          name={instructor.name}
          sectionCodes={instructor.sectionCodes}
          alsoTeaches={instructor.alsoTeaches}
          // TODO(reviews): supply the instructor summary from lib/reviews once
          // review ingest lands. Null renders the "no reviews matched" copy,
          // which is the truth today.
          reputation={null}
          lookupRmp={lookupRmp}
        />
      ))}
    </div>
  );
}
