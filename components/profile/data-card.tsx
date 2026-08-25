import { RiArrowDownSLine } from "@remixicon/react";

import type { StudentProfile } from "@/lib/profile/types";
import { cx } from "@/utils/cx";
import { RecordControls } from "./record-controls";

/**
 * What this screen is, what it holds, and how to get out.
 *
 * This card is not boilerplate and it is not a footer. A page that shows a
 * degree-completion percentage next to a student's name looks exactly like a
 * registrar product, and it is not one — every figure above it comes from data
 * the student typed or confirmed. Saying so plainly, at the bottom of the page
 * where someone lands after reading their audit, is what keeps the whole
 * surface honest.
 *
 * The specifics are load-bearing rather than reassuring noise:
 *
 *   - **We cannot import your record**, and the reason is structural, not a
 *     roadmap item. Columbia's student-record endpoints need a Vergil bearer
 *     token; `AGENTS.md` forbids touching one and `vergil_api_spec.md` §15
 *     forbids centralizing education records off-device.
 *   - **No grades, no GPA.** There is no column for either
 *     (migration 0017) and no parameter for either
 *     (`app/profile/actions.ts`). The transcript importer displays grades
 *     during review and discards them.
 *   - **No transcript file.** PDFs are parsed in the browser tab. There is no
 *     upload endpoint and no storage bucket.
 *
 * ── Why the detail is behind a disclosure ──────────────────────────────────
 *
 * All three used to render as equal-weight cards in a three-column grid: 131
 * words of fine print, at full strength, every visit. Printed that insistently
 * a promise stops being read — it reads as a legal panel to scroll past, which
 * is the opposite of the intent. The claim itself is one line and always
 * visible; the reasoning is one click away and stays verbatim for the reader
 * who wants it. Nothing was deleted, only ranked.
 *
 * `<details>` rather than state: this stays a server component, works before
 * hydration, and is what a browser already knows how to do.
 */

export interface DataCardProps {
  profile: StudentProfile;
  /** False when nobody is signed in — there is nothing stored to export or erase. */
  signedIn?: boolean;
  className?: string;
}

const FACTS: { term: string; detail: string }[] = [
  {
    term: "Why we cannot import it for you",
    detail:
      "Columbia's student-record endpoints need a Vergil access token. We never handle one — not as a limitation we plan to remove, but because holding a third party's copy of your education record is the thing the rules exist to prevent.",
  },
  {
    term: "What we store",
    detail:
      "Course codes, the term you typed beside them, your declared programs, and which requirements you certified yourself. No grades. No GPA. No name or UNI from your transcript.",
  },
  {
    term: "Your transcript file",
    detail:
      "Read inside your browser tab and never uploaded. There is no endpoint that accepts it and no bucket it could land in.",
  },
];

export function DataCard({ profile, signedIn = true, className }: DataCardProps) {
  return (
    <section
      className={cx(
        "flex w-full flex-col gap-3 rounded-[20px] bg-background-secondary-default px-3.5 py-3.5",
        className,
      )}
      aria-labelledby="profile-data-heading"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-data-heading" className="text-caption-1-semibold text-text-secondary">
          Self-reported, not a registrar record
        </h2>
        {/*
          One sentence, and it is the one that matters: what a reader would
          otherwise assume about a page with a completion percentage on it.
        */}
        <p className="max-w-[68ch] text-caption-1-regular text-pretty text-text-tertiary">
          Everything here is what you entered. No grades, no GPA, no transcript file — your
          adviser and Vergil are the authorities.
        </p>
      </div>

      <details className="group">
        <summary
          className={cx(
            // min-h-10: a caption-sized line of text is a ~16px tap target.
            "inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg outline-none",
            "text-caption-1-medium text-text-secondary transition-colors duration-150",
            "hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          How this works
          <RiArrowDownSLine
            className="size-4 transition-transform duration-150 ease-out motion-reduce:transition-none group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <dl className="mt-2.5 flex flex-col gap-2.5">
          {FACTS.map((fact) => (
            <div key={fact.term} className="flex flex-col gap-0.5">
              <dt className="text-caption-1-medium text-text-primary">{fact.term}</dt>
              <dd className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
                {fact.detail}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      {/*
        Nothing is stored for a signed-out visitor, so there is nothing to
        export and nothing to erase. Two disabled buttons would only advertise
        an account they do not have.
      */}
      {signedIn ? <RecordControls profile={profile} signedIn={signedIn} /> : null}
    </section>
  );
}
