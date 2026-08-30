"use client";

import type { GuessChoice, GuessChoiceRoute } from "@/lib/onboarding/guess";
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
 * ── One tap answers the whole group, and the group stays ────────────────────
 *
 * Picking a route confirms every course in it — both terms of a sequence — and
 * the route lights up as the answer. The group does NOT leave the screen.
 *
 * It used to. An answered group was filtered out, which read as the question
 * being consumed, and it cost the student the two things a visible answer
 * gives them: seeing what they said, and being able to change it. Correcting a
 * mis-tap meant continuing to the next screen and hunting the course down in a
 * list of twenty to remove it.
 *
 * Staying visible is also what makes switching answers correct rather than
 * additive. These are choose-ONE groups, so picking Contemporary Civilization
 * after Literature Humanities has to retract Lit Hum — otherwise the record
 * claims both, which is the one thing the group's own rule says cannot be
 * true. A vanished group had nowhere to express that.
 *
 * Hence `OptionChip` rather than `AddChip`, which is the same distinction
 * stated in components: an `AddChip` is an offer, with a leading + and no
 * pressed state, because accepting it ends it. Every other question in
 * onboarding — school, class year, major — is an `OptionChip`, and a
 * choose-one requirement is that same kind of question.
 *
 * "None yet" dismisses every route at once, which is the honest reading of a
 * student saying they have not done this requirement — and is what stops a
 * question they have already declined from coming back as suggestion chips on
 * the screen after this one. Picking a route afterwards undoes it on its own:
 * `addCourse` drops the course from `dismissedCourseIds`, since an explicit
 * add is the newer statement.
 *
 * No heading of its own: the step's question IS the heading now, and repeating
 * it here would print the same sentence twice on one screen.
 */
/** A group, plus what the student has already said about it. */
export interface AnsweredChoice {
  choice: GuessChoice;
  /** The route whose courses are on the record, if any. */
  selectedRouteId: string | null;
  /** They said "None yet" and have not since picked a route. */
  isDeclined: boolean;
}

export function CourseChoices({
  choices,
  onChoose,
  onDecline,
}: {
  choices: readonly AnsweredChoice[];
  /**
   * Confirms every course in the route, retracts the sibling route it
   * replaces, and un-picks it when it is already the answer.
   */
  onChoose: (choice: GuessChoice, route: GuessChoiceRoute) => void;
  /** Dismisses every course in every route. */
  onDecline: (choice: GuessChoice) => void;
}) {
  if (choices.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {choices.map(({ choice, selectedRouteId, isDeclined }) => (
          <li key={choice.choiceId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="min-w-0 truncate text-caption-1-medium text-text-secondary">
                {choice.label}
              </h3>
              {/*
                Pressed rather than hidden once chosen, for the same reason the
                routes are: it is an answer the student gave and may want back.
                `aria-pressed` because it toggles nothing off — picking a route
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
              {choice.routes.map((route) => {
                const lines = routeChipLines(route, choice.routes);
                return (
                  <OptionChip
                    key={route.routeId}
                    isSelected={route.routeId === selectedRouteId}
                    onPress={() => onChoose(choice, route)}
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
 * How one route reads on a chip.
 *
 * ── The name leads; the call numbers are the subtitle ───────────────────────
 *
 * Same rule as every other chip in onboarding, and it is the rule because a
 * student recognises a course they took by its name. The chemistry group is
 * what forced this back into line: its four options were rendering as their
 * course lists, so the primary line of each button was eight call numbers
 * joined end to end and wrapped over four lines, while the one phrase that
 * actually told the options apart — "general chemistry then organic" — sat
 * underneath in tertiary grey. The button said the least useful thing loudest.
 *
 * The Bulletin writes those labels as "Option 1 — general chemistry then
 * organic". The ordinal is a numbering artefact of the source document, not a
 * name, so `describeRoute` takes it off and the description leads.
 *
 * ── When the codes still have to lead ───────────────────────────────────────
 *
 * Some groups genuinely have no name to lead with. The Bulletin calls the SEAS
 * physics options "Sequence 1", "Sequence 2" and "Sequence 3", and the program
 * data is right to record that — but three buttons reading "Sequence 1/2/3"
 * under "which of these have you taken?" answer the question with an index the
 * student has never seen. There the call numbers ARE the distinguishing
 * content: PHYS UN1401 and PHYS UN1601 is a choice a Columbia student can
 * actually make, "Sequence 1 or Sequence 2" is not.
 *
 * Leading with the course TITLES instead was the obvious alternative and it
 * does not work: 31 of the 46 courses named across every `sequence_choice`
 * group in the catalog have no title at all, because we hold only the two
 * active terms and most of these are not currently taught. Physics Sequence 3
 * resolves to zero titles. A rule that leads with names would print blanks on
 * exactly the groups that need help most.
 *
 * So: lead with the name wherever one exists, and fall back to the codes only
 * where the source document never gave the option a name.
 */
export function routeChipLines(
  route: GuessChoiceRoute,
  siblings: readonly GuessChoiceRoute[],
): {
  label: string;
  sublabel?: string;
} {
  const [only] = route.courses;
  if (route.courses.length === 1 && only) {
    const lines = courseChipLines(only.code, only.title);
    // `courseChipLines` returns a bare code with no sublabel when it has no
    // title to show; keep that rather than printing the code twice.
    return lines.sublabel
      ? { label: lines.sublabel, sublabel: lines.label }
      : lines;
  }

  const rawCodes = route.courses.map((facts) => facts.code);
  const codes = formatCodeList(rawCodes);
  const lines = labelsDistinguish(siblings)
    ? { label: describeRoute(route.label), sublabel: codes }
    // The label is an index ("Sequence 2") and carries nothing the codes do
    // not, so it goes underneath rather than on top.
    : { label: codes, sublabel: route.label };

  // Computer engineering labels its applied-maths routes with their own call
  // numbers — "MATH UN2030 + APMA E3101" — so the two lines would say the same
  // thing in two punctuations. One line, in the punctuation every other chip
  // on the screen uses.
  return labelIsJustCodes(lines.sublabel, rawCodes) ? { label: codes } : lines;
}

/**
 * The route's name, with the source document's ordinal taken off.
 *
 * "Option 1 — general chemistry then organic" is a numbered list item, not a
 * name; the name is what follows the dash. A label with no such tail is
 * already a name ("Literature Humanities", "Honors Mathematics A and B") and
 * comes back untouched.
 */
function describeRoute(label: string): string {
  const tail = /^(?:option|sequence|track|path)\s+[\dA-Za-z]+\s*(?:[—–-]|,)\s*(.+)$/iu.exec(
    label.trim(),
  );
  const rest = tail?.[1]?.trim();
  if (!rest) return label;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * A route's courses as one readable line.
 *
 * The subject is printed once and then only while it keeps changing, so the
 * biology chemistry option reads
 *
 *     CHEM UN1403, UN1404, UN1500, UN1501, UN2443, UN2444, UN2493, UN2494
 *
 * rather than repeating "CHEM" eight times. That repetition was most of the
 * width of the longest option and all of why it read as a block of noise; a
 * mixed route still names each subject as it changes ("MATH UN2030, APMA
 * E3101"), because there the subject is the part that differs.
 */
function formatCodeList(codes: readonly string[]): string {
  const parts: string[] = [];
  let previousSubject = "";
  for (const code of codes) {
    const separator = code.indexOf(" ");
    const subject = separator === -1 ? code : code.slice(0, separator);
    const number = separator === -1 ? "" : code.slice(separator + 1);
    if (number && subject === previousSubject) {
      parts.push(number);
      continue;
    }
    parts.push(code);
    previousSubject = subject;
  }
  return parts.join(", ");
}

/**
 * Is this label just the route's own call numbers?
 *
 * Compared against the RAW codes rather than the formatted line. The formatted
 * line has already dropped the repeated subject, so "MATH UN2030 + MATH
 * UN2010" would not match "MATH UN2030, UN2010" — and those are exactly the
 * routes this needs to catch. Punctuation and case are ignored, because the
 * question is whether the two lines carry the same information, not whether
 * the Bulletin joined them with a plus and we joined them with a comma.
 */
function labelIsJustCodes(label: string, codes: readonly string[]): boolean {
  const bare = (value: string) => value.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return bare(label) === codes.map(bare).join("");
}

/**
 * Do this group's labels actually tell its options apart?
 *
 * The test runs on the DESCRIBED label, so "Option 1 — general chemistry then
 * organic" is compared as "General chemistry then organic" and passes. What
 * fails is a label that is only an ordinal.
 *
 * `isPureIndex` catches those outright, and one is enough to disqualify the
 * whole group: a set where one button reads "Third term PHYS BC3001" and its
 * neighbour reads "Sequence 2" is not a set of names, it is a set of names and
 * numbers, and the student has to compare the codes anyway.
 *
 * The stem test then catches the rest. Cutting at the first digit rather than
 * only a trailing one is deliberate: mechanical engineering has a "Sequence 2,
 * third term EEEB UN2001" route, whose tail is a qualifier on the ordinal and
 * not a name either.
 */
function labelsDistinguish(routes: readonly GuessChoiceRoute[]): boolean {
  if (routes.some((route) => isPureIndex(route.label))) return false;
  const stems = routes.map((route) =>
    describeRoute(route.label).replace(/[\s,]*\d.*$/u, "").trim().toLowerCase(),
  );
  return new Set(stems).size === routes.length;
}

/** "Sequence 1", "Sequence A", "Option 3" — a list position, and nothing else. */
function isPureIndex(label: string): boolean {
  return /^(?:option|sequence|track|path)\s+[A-Za-z0-9]+$/iu.test(label.trim());
}
