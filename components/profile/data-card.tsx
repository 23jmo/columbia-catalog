import { RiShieldCheckLine } from "@remixicon/react";

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
 */

export interface DataCardProps {
  profile: StudentProfile;
  /** False when nobody is signed in — there is nothing stored to export or erase. */
  signedIn?: boolean;
  className?: string;
}

export function DataCard({ profile, signedIn = true, className }: DataCardProps) {
  return (
    <section
      className={cx(
        "flex w-full flex-col gap-3 rounded-[20px] bg-background-secondary-default px-3.5 py-4",
        className,
      )}
      aria-labelledby="profile-data-heading"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg bg-stat-card-icon-background">
          <RiShieldCheckLine className="size-4.5 text-foreground-icon-primary" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="profile-data-heading" className="text-headline-semibold text-text-primary">
            This is your record, not the registrar&rsquo;s
          </h2>
          <p className="text-caption-1-regular text-pretty text-text-secondary">
            Every course above is one you entered or confirmed. Nothing here has been checked
            against Columbia, and a degree audit from us is a planning aid — your adviser and
            Vergil are the authorities.
          </p>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        <Fact
          term="Why we cannot import it for you"
          detail="Columbia's student-record endpoints need a Vergil access token. We never handle one — not as a limitation we plan to remove, but because holding a third party's copy of your education record is the thing the rules exist to prevent."
        />
        <Fact
          term="What we store"
          detail="Course codes, the term you typed beside them, your declared programs, and which requirements you certified yourself. No grades. No GPA. No name or UNI from your transcript."
        />
        <Fact
          term="Your transcript file"
          detail="Read inside your browser tab and never uploaded. There is no endpoint that accepts it and no bucket it could land in."
        />
      </dl>

      <RecordControls profile={profile} signedIn={signedIn} />
    </section>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2lg bg-background-primary-default p-3">
      <dt className="text-caption-1-medium text-text-primary">{term}</dt>
      <dd className="text-caption-2-regular text-pretty text-text-tertiary">{detail}</dd>
    </div>
  );
}
