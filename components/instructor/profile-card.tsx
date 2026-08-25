"use client";

import { useState } from "react";
import { RiCheckLine, RiShareForwardLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import type { ReputationSummary, RmpSnapshot } from "@/lib/types";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";

import { InstructorProfileHero } from "./profile-hero";
import { InstructorRating } from "./rating-hero";

export interface InstructorProfileCardProps {
  data: InstructorPageData;
  reputation?: ReputationSummary | null;
  rmpSnapshot?: RmpSnapshot | null;
  backLink?: { href: string; label: string };
  className?: string;
}

export function InstructorProfileCard({
  data,
  reputation = null,
  rmpSnapshot,
  backLink,
  className,
}: InstructorProfileCardProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated — silent non-event.
    }
  }

  const handle = data.departments[0] ?? null;

  return (
    <InstructorProfileHero
      variant="page"
      name={data.name}
      subtitle={handle}
      subjectBadges={data.subjects}
      backLink={backLink}
      className={cx(className)}
      /*
        Share only. There used to be a second `CULPA` button here, which made
        three exits to the same destination on one screen: this one, the
        rating block's "Read on CULPA", and another inside the reviews card.
        The rating block's is the one that survives — it sits beside the score
        it came from and says what the reader will find, where a bare "CULPA"
        in the header says only where it goes.
      */
      actions={
        <Button
          size="small"
          variant="secondary"
          leadingIcon={copied ? RiCheckLine : RiShareForwardLine}
          onClick={share}
        >
          {copied ? "Copied" : "Share"}
        </Button>
      }
    >
      <InstructorRating
        name={data.name}
        reputation={reputation}
        rmpSnapshot={rmpSnapshot}
      />
    </InstructorProfileHero>
  );
}
