"use client";

import {
  RiCompass3Line,
  RiGraduationCapLine,
  RiScales3Line,
  RiSparkling2Line,
  type RemixiconComponentType,
} from "@remixicon/react";
import { cx } from "@/utils/cx";

/**
 * What to ask, when you do not yet know that you can ask.
 *
 * ── These are the pitch ────────────────────────────────────────────────────
 *
 * The product exists because Vergil cannot get a student from "I'm a sophomore
 * CS major interested in AI" to "here are six classes". An empty box makes the
 * same demand Vergil does — know what you want before you start — so the empty
 * state has to do the arguing, and the only argument available is four
 * questions a search box visibly cannot answer.
 *
 * Each one is chosen for that: none can be typed into a keyword search and get
 * a useful result back, and each maps to a different tool path through the
 * agent — requirements, taste, the two together, and the schedule.
 */

const STARTERS: { icon: RemixiconComponentType; text: string }[] = [
  {
    icon: RiGraduationCapLine,
    text: "What should I take next term?",
  },
  {
    icon: RiScales3Line,
    text: "Which one class knocks out the most requirements?",
  },
  {
    icon: RiCompass3Line,
    text: "Something like the courses I liked, outside my major",
  },
  {
    icon: RiSparkling2Line,
    text: "What's still left in my Core?",
  },
];

export function Starters({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {STARTERS.map((starter) => (
        <li key={starter.text}>
          <button
            type="button"
            onClick={() => onAsk(starter.text)}
            className={cx(
              "flex w-full items-center gap-2.5 rounded-2xl border border-border-table",
              "bg-background-primary-default px-3.5 py-3 text-left",
              "transition-colors hover:bg-background-primary-hover",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <starter.icon
              aria-hidden
              className="size-4 shrink-0 text-foreground-icon-tertiary"
            />
            <span className="min-w-0 text-caption-1-regular text-text-secondary">
              {starter.text}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
