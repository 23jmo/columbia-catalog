"use client";

import type { GuessChoice, GuessFacts } from "@/lib/onboarding/guess";
import { cx } from "@/utils/cx";

import { ChipWrap, OptionChip, courseChipLines } from "./chip";

/**
 * The body of the choose-one step. See `step-choices.tsx` for why it is a step.
 *
 * ── Why these are not just more suggestion chips ────────────────────────────
 *
 * The suggestion strip on the screen after this one answers "what else have
 * you probably taken" and shows eight. These questions used to share it, and
 * what a choose-one requirement does to eight slots is the reason they no
 * longer do: the SEAS Core sequence alone has four 1000-level courses — both
 * halves of Lit Hum and both halves of CC — so one question took half the
 * strip, and pushed Physics to slot 11 and Linear Algebra to slot 17. Seven
 * requirements were competing for eight slots with sixteen chips.
 *
 * Splitting them out was never only a space fix. A choose-one group is a
 * different KIND of claim: we are confident the student satisfied it and
 * genuinely do not know how, which is a question, not a suggestion. Asked as a
 * question it costs one tap and cannot be wrong; offered as eight independent
 * chips it reads as eight separate guesses, most of which we know are false,
 * since a student who did Lit Hum did not also do CC.
 *
 * ── One chip per course, and the group stays ───────────────────────────────
 *
 * The underlying data models each option as a ROUTE — a whole sequence, both
 * terms of Lit Hum together — and this screen used to render it that way, one
 * button per route. A student who had done one term of a sequence, or who had
 * switched sequences partway, could not answer at all, and the ones who could
 * were being asked to recognise "Sequence 2" rather than a class they sat in.
 *
 * So the routes are flattened to their courses (`choiceCourses`) and each gets
 * its own chip. Selection is free: tapping records that one course, tapping it
 * again takes it back off. See `choiceCourses` for why that does not weaken the
 * requirement, and `toggleCourse` in `step-choices.tsx` for why nothing else in
 * the group is cleared.
 *
 * The group does NOT leave the screen once answered.
 *
 * It used to. An answered group was filtered out, which read as the question
 * being consumed, and it cost the student the two things a visible answer
 * gives them: seeing what they said, and being able to change it. Correcting a
 * mis-tap meant continuing to the next screen and hunting the course down in a
 * list of twenty to remove it.
 *
 * Hence `OptionChip` rather than `AddChip`, which is the same distinction
 * stated in components: an `AddChip` is an offer, with a leading + and no
 * pressed state, because accepting it ends it. Every other question in
 * onboarding — school, class year, major — is an `OptionChip`, and a
 * choose-one requirement is that same kind of question.
 *
 * "None yet" dismisses every course in the group at once, which is the honest
 * reading of a student saying they have not done this requirement — and is what
 * stops a question they have already declined from coming back as suggestion
 * chips on the screen after this one. Ticking a course afterwards undoes it on
 * its own: `addCourse` drops the course from `dismissedCourseIds`, since an
 * explicit add is the newer statement.
 *
 * No heading of its own: the step's question IS the heading now, and repeating
 * it here would print the same sentence twice on one screen.
 */
/** A group, plus what the student has already said about it. */
export interface AnsweredChoice {
  choice: GuessChoice;
  /** Course ids from this group that are on the record. */
  selectedCourseIds: readonly string[];
  /** They said "None yet" and have not since picked a course. */
  isDeclined: boolean;
}

export function CourseChoices({
  choices,
  onToggle,
  onDecline,
}: {
  choices: readonly AnsweredChoice[];
  /** Puts one course on the record, or takes it back off. */
  onToggle: (course: GuessFacts) => void;
  /** Dismisses every course in the group. */
  onDecline: (choice: GuessChoice) => void;
}) {
  if (choices.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {choices.map(({ choice, selectedCourseIds, isDeclined }) => (
          <li key={choice.choiceId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="min-w-0 truncate text-caption-1-medium text-text-secondary">
                {choice.label}
              </h3>
              {/*
                Pressed rather than hidden once chosen, for the same reason the
                chips are: it is an answer the student gave and may want back.
                `aria-pressed` because it toggles nothing off — ticking a course
                is what clears it — so it reports state without promising a
                second tap will undo it.
              */}
              <button
                type="button"
                aria-pressed={isDeclined}
                onClick={() => onDecline(choice)}
                className={cx(
                  "shrink-0 rounded-sm text-caption-2-regular underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  isDeclined
                    ? "text-accent-500"
                    : "text-text-tertiary hover:text-text-primary hover:underline",
                )}
              >
                None yet
              </button>
            </div>

            {/*
              `justify-start`, unlike the suggestion strip. These are the
              options for one question and they read as a row that begins under
              its heading; centring them would float each group's chips to a
              different x and lose the association with the label above.
            */}
            <ChipWrap className="justify-start gap-1.5 overflow-visible px-2.5 pt-2 sm:gap-2">
              {choiceCourses(choice).map((course, _index, courses) => {
                const lines = chipLinesFor(course, courses);
                return (
                  <OptionChip
                    key={course.courseId}
                    isSelected={selectedCourseIds.includes(course.courseId)}
                    onPress={() => onToggle(course)}
                    sublabel={lines.sublabel}
                    sublabelLines={2}
                    label={`I took ${lines.label}${lines.sublabel ? ` — ${lines.sublabel}` : ""}`}
                  >
                    {lines.label}
                  </OptionChip>
                );
              })}
            </ChipWrap>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Every course a group offers, once each, in the order the Bulletin lists them.
 *
 * ── Why the sequences are flattened ─────────────────────────────────────────
 *
 * The program data models these as ROUTES, and it is right to: `sequence_choice`
 * exists because "one of Lit Hum I+II or CC I+II" cannot be written as a count
 * over four courses without also accepting Lit Hum I plus CC I. That is a real
 * constraint and the audit engine still enforces it.
 *
 * But it is a constraint on the REQUIREMENT, not on the question being asked
 * here. This screen asks a student which classes they have already taken, and
 * a student knows that one course at a time. Asked as routes, the Physics group
 * offered three buttons whose meaning was "I did this whole two-term sequence",
 * which is a bigger claim than the question needs and one a student halfway
 * through a sequence could not answer at all. Asked as courses, it is six
 * buttons and every one of them is a fact they can confirm on sight.
 *
 * A course reachable by two routes appears once. Mechanical Engineering's
 * physics routes all begin with PHYS UN1401 and differ only in the third term,
 * so undeduplicated the group would print the same chip three times.
 *
 * The cost is that a half-finished sequence can now be recorded, and that is
 * the honest outcome: it is what the student actually took, and the audit says
 * the requirement is unmet rather than the screen refusing to hear it.
 */
export function choiceCourses(choice: GuessChoice): GuessFacts[] {
  const seen = new Set<string>();
  const courses: GuessFacts[] = [];
  for (const route of choice.routes) {
    for (const facts of route.courses) {
      if (seen.has(facts.courseId)) continue;
      seen.add(facts.courseId);
      courses.push(facts);
    }
  }
  return courses;
}

/**
 * How one course reads on a chip.
 *
 * The name leads and the call number is the subtitle, which is the rule
 * everywhere else in onboarding and the reason is that nobody recognises a
 * class they took from its number. `courseChipLines` already returns that
 * shape, including the known-titles fallback and the registrar-casing repair,
 * and a course with no title anywhere comes back as a bare code rather than
 * printing the code twice.
 *
 * The exception is a group where two courses carry the SAME title. Applied
 * Mathematics lists "Partial Differential Equations" twice, as MATH UN3028 and
 * APMA E4200, and "Probability Theory" twice, as STAT GU4203 and MATH GU4155.
 * Name-first those are two buttons a student cannot tell apart, and there the
 * call number is the part that differs, so it goes on top.
 */
export function chipLinesFor(
  course: GuessFacts,
  siblings: readonly GuessFacts[],
): { label: string; sublabel?: string } {
  const lines = courseChipLines(course.code, course.title);
  if (!lines.sublabel || titlesDistinguish(siblings)) return lines;
  return { label: lines.sublabel, sublabel: lines.label };
}

/**
 * Whether a group's courses have names that tell them apart.
 *
 * Decided group-wide, so one group never mixes two chip shapes, and only on
 * the titles that EXIST — a course with no title renders as a bare code and is
 * never confusable with a named one. That distinction matters: the Linear
 * Algebra group has two untitled courses among six, and blocking on those would
 * send the whole group back to leading with call numbers.
 */
function titlesDistinguish(siblings: readonly GuessFacts[]): boolean {
  const named: string[] = [];
  for (const sibling of siblings) {
    const lines = courseChipLines(sibling.code, sibling.title);
    if (lines.sublabel) named.push(lines.label.toLowerCase());
  }
  return new Set(named).size === named.length;
}
