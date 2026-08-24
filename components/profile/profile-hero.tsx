import {
  RiBookMarkedLine,
  RiCheckboxCircleLine,
  RiGraduationCapLine,
  RiListCheck3,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { Stat, StatStrip } from "@/components/shell/stat";
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

  return (
    <section
      className={cx(
        "relative w-full overflow-hidden rounded-3xl border border-border-ai-profile-card",
        className,
      )}
      aria-labelledby="profile-hero-name"
    >
      <div className="absolute inset-x-0 top-0 h-[165px] overflow-hidden rounded-t-[23px] bg-background-tertiary-default">
        <ProfileCover seed={name ?? "columbia-catalog-profile"} />
      </div>

      <div className="relative flex w-full flex-col gap-[15px] px-4 pt-[124px] pb-4">
        <span className="flex size-20 items-center justify-center rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default">
          {name ? (
            <span className="text-[30px] leading-[42.5px] font-medium text-text-secondary">
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

          <div className="absolute -top-[34px] right-1 flex items-center justify-end gap-2.5">
            <DegreeSetup
              profile={profile}
              programOptions={programOptions}
              signedIn={signedIn}
            />
          </div>
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
            <p className="text-caption-1-regular text-pretty text-text-tertiary">
              {checkedGreen} requirement{checkedGreen === 1 ? "" : "s"} we could check against the
              Bulletin
              {attestedGreen.length > 0
                ? `, and ${attestedGreen.length} that ${attestedGreen.length === 1 ? "is" : "are"} complete because you said so.`
                : "."}{" "}
              Nothing here is a registrar record — see below.
            </p>
          </div>
        ) : (
          <p className="text-body-regular text-pretty text-text-secondary">
            {signedIn
              ? "Tell us your school and major and this becomes a live degree audit. Everything you enter stays yours: no grades, no GPA, no transcript file."
              : "Sign in and tell us your school and major, and this becomes a live degree audit — what the Core still wants, what your major still wants, and what to take next term to move it."}
          </p>
        )}

        <StatStrip>
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
            detail={`of ${groups.length}`}
          />
          <Stat
            icon={RiListCheck3}
            label="Still outstanding"
            value={audit.remaining.length}
            tone={audit.remaining.length > 0 ? "accent" : "default"}
            detail={hasPrograms ? "listed below" : "declare a program"}
          />
        </StatStrip>
      </div>
    </section>
  );
}
