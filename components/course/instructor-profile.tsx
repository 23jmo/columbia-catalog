"use client";

import Link from "next/link";
import { RiArrowRightSLine, RiGraduationCapLine } from "@remixicon/react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Chip } from "@/components/base/badges/chip";
import { InstructorLink } from "@/components/instructor/instructor-link";
import { instructorSlug } from "@/lib/data/instructors";
import type { ReputationSummary } from "@/lib/types";
import { cx } from "@/utils/cx";
import type { RmpLookup } from "./contracts";
import { initialsOf } from "./format";
import { ReputationBlock } from "./reputation";
import { RmpBlock } from "./rmp-block";

/**
 * One instructor teaching this course, with everything we know about them kept
 * visibly separate: our own aggregated reputation on one side, RateMyProfessor
 * — live, attributed, unstored — on the other. They are never merged, because
 * they measure different populations answering different questions.
 */

export interface InstructorCardProps {
  name: string;
  /** Section codes this person teaches for the course being viewed. */
  sectionCodes: string[];
  /** Other courses in the catalog this person teaches. */
  alsoTeaches: string[];
  reputation: ReputationSummary | null;
  lookupRmp?: RmpLookup;
  className?: string;
}

export function InstructorCard({
  name,
  sectionCodes,
  alsoTeaches,
  reputation,
  lookupRmp,
  className,
}: InstructorCardProps) {
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-3">
        <Avatar size="lg" initials={initialsOf(name)} color="blue" />
        <div className="min-w-0 flex-1">
          {/*
            The name is the way in. This card is a summary of one person on one
            course; their full profile — every section, the term's teaching
            calendar, classroom load, and both review sources — lives at
            `/instructor/[slug]`, and a student who has just read two numbers
            about someone is exactly the person who wants it.
          */}
          <p className="text-headline-semibold text-balance text-text-primary">
            <InstructorLink name={name} />
          </p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            {sectionCodes.length > 0
              ? `Teaching section${sectionCodes.length > 1 ? "s" : ""} ${sectionCodes.join(", ")}`
              : "Listed on this course"}
          </p>
          {alsoTeaches.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RiGraduationCapLine
                className="size-3.5 shrink-0 text-foreground-icon-tertiary"
                aria-hidden
              />
              <span className="text-caption-2-regular text-text-tertiary">Also teaches</span>
              {alsoTeaches.slice(0, 4).map((code) => (
                <Chip key={code} variant="caption" color="soft">
                  {code}
                </Chip>
              ))}
              {alsoTeaches.length > 4 ? (
                <span className="text-caption-2-regular text-text-tertiary">
                  +{alsoTeaches.length - 4} more
                </span>
              ) : null}
            </div>
          ) : null}

          <Link
            href={`/instructor/${instructorSlug(name)}`}
            className="mt-2 inline-flex w-fit items-center gap-0.5 rounded-lg text-caption-1-medium text-accent-600 outline-none transition-colors duration-150 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            View full profile
            <RiArrowRightSLine aria-hidden className="size-3.5 shrink-0" />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReputationBlock
          title="Instructor quality"
          subtitle="Aggregated from CULPA and Reddit reviews of this person."
          summary={reputation}
        />
        <RmpBlock instructorName={name} lookup={lookupRmp} />
      </div>
    </div>
  );
}
