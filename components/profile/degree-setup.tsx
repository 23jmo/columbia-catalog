"use client";

import { useMemo, useState, useTransition } from "react";
import { RiEditLine, RiGraduationCapLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { saveDegreeAction } from "@/app/profile/actions";
import type { StudentProfile } from "@/lib/profile/types";
import { SCHOOL_LABEL, type School } from "@/lib/requirements/types";
import { cx } from "@/utils/cx";
import { ProfileModal } from "./profile-modal";

/**
 * Declare your school, your class year, and your majors/minors.
 *
 * ── Why school is a separate control from program ───────────────────────────
 *
 * The Core is resolved from the school, never picked (see `programsFor` in
 * `lib/profile/audit.ts`). A Columbia College student cannot elect out of the
 * Core, so listing it among the checkboxes would imply they could — and a
 * student who left it unticked would get an audit that silently omits half
 * their degree. Picking a school therefore adds the Core implicitly, and the
 * dialog says so in words.
 *
 * ── Why the program list is honest about where it came from ─────────────────
 *
 * Authored programs were transcribed from the Bulletin by a person and are
 * pinned by a test. Parsed ones came out of the CourseLeaf reader and nobody
 * has read them. Both are offered — coverage matters — but the row says which
 * it is, because a student should know whether they are trusting a
 * transcription or a scraper.
 */

export interface ProgramOption {
  id: string;
  name: string;
  kind: string;
  school: string;
  origin?: "authored" | "parsed";
}

export interface DegreeSetupProps {
  profile: StudentProfile;
  programOptions: ProgramOption[];
  /**
   * False when nobody is signed in. The control still renders — the house
   * convention (see `CourseActions` in `components/course/contracts.ts`) is
   * that an unavailable action explains itself rather than disappearing, so a
   * reader learns the feature exists and what it costs.
   */
  signedIn?: boolean;
  className?: string;
}

const SCHOOL_ORDER: School[] = ["CC", "SEAS", "GS", "BC"];

const KIND_LABEL: Record<string, string> = {
  major: "Major",
  minor: "Minor",
  concentration: "Concentration",
  core: "Core",
};

export function DegreeSetup({
  profile,
  programOptions,
  signedIn = true,
  className,
}: DegreeSetupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [school, setSchool] = useState<School | null>(profile.school);
  const [classYear, setClassYear] = useState(profile.classYear ?? "");
  const [programIds, setProgramIds] = useState<string[]>(profile.programIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
   * Only the chosen school's programs, plus anything already saved.
   *
   * The "plus already saved" half matters: a student who switched schools would
   * otherwise see their old major silently vanish from the list while it was
   * still on their record and still being audited. It stays visible so they can
   * untick it deliberately.
   */
  const visible = useMemo(() => {
    const selected = new Set(programIds);
    return programOptions
      .filter((option) => option.kind !== "core")
      .filter((option) => !school || option.school === school || selected.has(option.id));
  }, [programOptions, programIds, school]);

  const toggle = (id: string) => {
    setProgramIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveDegreeAction({
        school,
        classYear: classYear.trim() === "" ? null : classYear.trim(),
        programIds,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not save.");
        return;
      }
      setIsOpen(false);
    });
  };

  const hasDegree = profile.school != null || profile.programIds.length > 0;

  return (
    <>
      <Button
        size="small"
        variant={hasDegree ? "secondary" : "primary"}
        leadingIcon={hasDegree ? RiEditLine : RiGraduationCapLine}
        onClick={() => setIsOpen(true)}
        disabled={!signedIn}
        title={signedIn ? undefined : "Sign in to declare your degree — it has to be saved somewhere."}
        className={className}
      >
        {hasDegree ? "Edit degree" : "Declare degree"}
      </Button>

      <ProfileModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Your degree"
        description="This decides which requirements we audit you against. Change it whenever — nothing else on your record moves."
        footer={
          <>
            <Button size="small" variant="secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button size="small" disabled={isPending} onClick={submit}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-medium text-text-primary">School</legend>
            <p className="text-caption-1-regular text-text-tertiary">
              Picking a school adds its Core automatically — it is not optional, so it is not a
              checkbox.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SCHOOL_ORDER.map((option) => {
                const selected = school === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSchool(selected ? null : option)}
                    className={cx(
                      "flex flex-col items-start gap-0.5 rounded-2lg border p-2.5 text-left transition-colors duration-150 ease",
                      "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                      selected
                        ? "border-accent-500 bg-background-secondary-default"
                        : "border-border-button-default hover:bg-background-secondary-hover",
                    )}
                  >
                    <span className="text-body-medium text-text-primary">{option}</span>
                    <span className="text-caption-2-regular text-text-tertiary">
                      {SCHOOL_LABEL[option]}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Input
            label="Class year"
            placeholder="2028"
            value={classYear}
            onChange={setClassYear}
            hint="Display only. We never use it to decide what counts."
            inputMode="numeric"
            maxLength={4}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-medium text-text-primary">
              Majors, minors and concentrations
            </legend>
            {visible.length === 0 ? (
              <p className="text-caption-1-regular text-pretty text-text-tertiary">
                {school
                  ? "We have not transcribed any programs for this school yet. The Core above still audits, and everything else on this page still works."
                  : "Choose a school to see its programs."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {visible.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-2lg p-2 transition-colors duration-150 ease hover:bg-background-secondary-hover"
                  >
                    <Checkbox
                      isSelected={programIds.includes(option.id)}
                      onChange={() => toggle(option.id)}
                      aria-label={option.name}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-medium text-text-primary">{option.name}</span>
                      <span className="text-caption-2-regular text-text-tertiary">
                        {KIND_LABEL[option.kind] ?? option.kind} · {option.school}
                        {option.origin === "parsed"
                          ? " · read automatically from the Bulletin, not yet checked by a person"
                          : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {error ? (
            <p className="text-caption-1-regular text-text-error-primary" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ProfileModal>
    </>
  );
}
