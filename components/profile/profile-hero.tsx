import {
  RiBookMarkedLine,
  RiCheckboxCircleLine,
  RiGraduationCapLine,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { Stat, StatStrip } from "@/components/shell/stat";
import {
  pageHeroBodyClass,
  pageHeroCoverClass,
  pageHeroSectionClass,
} from "@/components/shell/page-hero-layout";
import type { ProfileAudit } from "@/lib/profile/audit";
import type { StudentProfile } from "@/lib/profile/types";
import { SCHOOL_LABEL } from "@/lib/requirements/types";
import { cx } from "@/utils/cx";
import { ProfileCover } from "./cover";
import { DegreeSetup } from "./degree-setup";
import { initialsOf, percentLabel } from "./format";

/**
 * The identity hero — the BoardUI ai-profile card, with its headline figure
 * replaced by the only number this screen exists to produce.
 *
 * Geometry is the template's: a 165px cover, a 124px top pad that drops the
 * 80px avatar so it straddles the cover edge, and the action control pulled
 * 34px up onto the cover.
 *
 * ── What the headline figure is, and what it is not ─────────────────────────
 *
 * It is the mean completion across every program the student is audited
 * against, weighted inside each program by what its groups actually ask for.
 * It is NOT a claim about graduating. Under it, in words rather than colour,
 * sits the count of requirements we could check *exactly* versus the ones that
 * are green because the student ticked a box — because a single 74% with no
 * qualifier is precisely the false-authority number that would get someone to
 * their last term one course short.
 *
 * A student with no declared program sees no percentage at all. Rendering 0%
 * would read as "you have done nothing" when the truth is "we have not been
 * told what you are doing".
 */

export interface ProfileHeroProps {
  profile: StudentProfile;
  audit: ProfileAudit;
  /** 0–1 across every audited program. Ignored when nothing is declared. */
  progress: number;
  /** Programs offered in the declare-your-degree control. */
  programOptions: { id: string; name: string; kind: string; school: string }[];
  /** False when nobody is signed in. */
  signedIn?: boolean;
  className?: string;
}

export function ProfileHero({
  profile,
  audit,
  progress,
  programOptions,
  signedIn = true,
  className,
}: ProfileHeroProps) {
  /*
   * A signed-out visitor has no name, and "Your profile" would initial down to
   * "YP" — a monogram for a person who does not exist. The avatar falls back to
   * a glyph instead, and the cover is seeded from the route so the page still
   * has an identity rather than a grey band.
   */
  const name = profile.displayName ?? profile.email?.split("@")[0] ?? null;
  const heading = name ?? "Your profile";
  const hasPrograms = audit.programs.length > 0;

  const groups = audit.programs.flatMap((result) => result.groups);
  const satisfied = groups.filter((group) => group.status === "satisfied");
  const attestedGreen = satisfied.filter((group) => group.verification === "attested");
  const checkedGreen = satisfied.length - attestedGreen.length;

  const plannedCount = profile.courses.filter((course) => course.source === "plan").length;
  const completedCount = profile.courses.length - plannedCount;

  // A statistic needs something to be a statistic about. See the strip below.
  const hasSomethingToCount = hasPrograms || profile.courses.length > 0;

  return (
    <section
      className={cx(pageHeroSectionClass("card"), className)}
      aria-labelledby="profile-hero-name"
    >
      <div className={pageHeroCoverClass()}>
        <ProfileCover seed={name ?? "lionplan-profile"} className="min-h-full min-w-full" />
      </div>

      <div className={pageHeroBodyClass()}>
        <span className="flex size-20 items-center justify-center rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default">
          {name ? (
            <span className="text-display-4-medium text-text-secondary">
              {initialsOf(name)}
            </span>
          ) : (
            <RiGraduationCapLine className="size-9 text-foreground-icon-tertiary" aria-hidden />
          )}
        </span>

        <div className="relative flex w-full items-start gap-[15px]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 id="profile-hero-name" className="text-title-2-medium truncate text-text-primary">
              {heading}
            </h1>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {profile.school ? (
                <p className="text-headline-medium truncate text-text-secondary">
                  {SCHOOL_LABEL[profile.school]}
                </p>
              ) : (
                <p className="text-headline-medium text-text-tertiary">No school declared</p>
              )}
              {profile.classYear ? (
                <Chip variant="caption" color="soft">
                  Class of {profile.classYear}
                </Chip>
              ) : null}
              {audit.programs
                .filter((result) => result.program.kind !== "core")
                .map((result) => (
                  <Chip key={result.program.id} variant="caption" color="neutral">
                    {result.program.name}
                  </Chip>
                ))}
            </div>
          </div>

          {/*
            `DegreeSetup` documents the house convention that an unavailable
            action stays visible and explains itself, so a reader learns the
            feature exists. This surface is the one place that argument does not
            hold: the sentence directly below the heading already says "sign in
            and declare a degree" in words, and the card under it is the control
            that gets you there. Rendered anyway, it put a greyed-out pill on
            the cover edge — a third offer of the same thing, and the only one
            that does nothing when pressed.
          */}
          {signedIn ? (
            <div className="absolute -top-[34px] right-1 flex items-center justify-end gap-2.5">
              <DegreeSetup
                profile={profile}
                programOptions={programOptions}
                signedIn={signedIn}
              />
            </div>
          ) : null}
        </div>

        {/*
          The headline. Present only once there is a program to measure against
          — see the file header for why an undeclared profile shows no figure.
        */}
        {hasPrograms ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-display-3-semibold -tracking-[0.02em] tabular-nums text-text-primary">
                {percentLabel(progress)}
              </span>
              <span className="text-body-regular text-text-secondary">
                of {audit.programs.length === 1 ? "your program" : "your programs"}, by what each
                requirement asks for
              </span>
            </div>
            {/*
              `max-w-[68ch]`: at the full width of the hero this ran to about
              150 characters on one line, which is unreadable at caption size
              and made the qualifier look like a legal footer rather than the
              gloss on the figure above it.

              The "nothing here is a registrar record" sentence it used to end
              on now lives only in `DataCard`, which is a heading about exactly
              that and sits at the bottom of the page where a reader goes
              looking for it. Said in both places it was said in neither.
            */}
            <p className="max-w-[68ch] text-caption-1-regular text-pretty text-text-tertiary">
              {checkedGreen} requirement{checkedGreen === 1 ? "" : "s"} we could check against the
              Bulletin
              {attestedGreen.length > 0
                ? `, and ${attestedGreen.length} that ${attestedGreen.length === 1 ? "is" : "are"} complete because you said so.`
                : "."}
            </p>
          </div>
        ) : (
          /*
            One line, not a paragraph. This used to spend 34 words describing
            the audit the reader cannot see yet, next to a sign-in card that
            already makes the same offer and four statistics that all read
            zero. Saying it once, shortest, is what makes it read as a state
            rather than a pitch — and the promise about grades and transcript
            files it used to carry now lives in `DataCard`, where a reader
            looking for it will actually go.
          */
          <p className="text-body-regular text-pretty text-text-secondary">
            {signedIn
              ? "Declare your school and major to see what is left."
              : "Sign in and declare a degree to see what is left."}
          </p>
        )}

        {/*
          Four zeros are not a summary.

          With nothing declared and nothing on the record this strip rendered
          "0 / 0 / 0 of 0 / 0" under four icons and four captions — the most
          visually prominent block on the page, carrying no information at all,
          on exactly the visit where the reader is deciding whether this screen
          is worth their time. It appears once there is something to count.
        */}
        {hasSomethingToCount ? (
          /*
            Three, not four. The fourth was "Still outstanding", and its value
            is `groups.length - satisfied.length` — the same fact the stat next
            to it already prints as "12 · of 24", and the same fact the card
            immediately below prints as its own headline. Three statements of
            one number inside seven hundred pixels; the two that carry a label
            and a list stayed.
          */
          <StatStrip className="sm:grid-cols-3">
          <Stat
            icon={RiBookMarkedLine}
            label="Courses on record"
            value={completedCount}
            detail={
              plannedCount > 0 ? `plus ${plannedCount} planned` : "all self-reported"
            }
          />
          <Stat
            icon={RiGraduationCapLine}
            label="Points earned"
            value={Math.round(audit.totalPoints * 10) / 10}
            detail={
              audit.unmatchedCourseIds.length > 0
                ? `${audit.unmatchedCourseIds.length} not in our catalog`
                : "from the catalog"
            }
          />
          <Stat
            icon={RiCheckboxCircleLine}
            label="Requirements done"
            value={satisfied.length}
            tone={audit.remaining.length > 0 ? "accent" : "default"}
            detail={`of ${groups.length}`}
          />
          </StatStrip>
        ) : null}
      </div>
    </section>
  );
}
