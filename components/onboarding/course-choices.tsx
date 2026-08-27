"use client";

import type { GuessChoice, GuessChoiceRoute } from "@/lib/onboarding/guess";

import { AddChip, ChipWrap, courseChipLines } from "./chip";

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
 * ── One tap answers the whole group ─────────────────────────────────────────
 *
 * Picking a route confirms every course in it — both terms of a sequence — and
 * the group leaves the screen, taking the routes not chosen with it. That is
 * the "and the others vanish" half, and it falls out of the data rather than
 * needing its own state: a group whose courses are confirmed is answered, and
 * `StepChoices` filters it out on the next render.
 *
 * "None yet" dismisses every route at once, which is the honest reading of a
 * student saying they have not done this requirement — and is what stops a
 * question they have already declined from coming back as suggestion chips on
 * the screen after this one.
 *
 * No heading of its own: the step's question IS the heading now, and repeating
 * it here would print the same sentence twice on one screen.
 */
export function CourseChoices({
  choices,
  onChoose,
  onDecline,
}: {
  choices: GuessChoice[];
  /** Confirms every course in the route. */
  onChoose: (route: GuessChoiceRoute) => void;
  /** Dismisses every course in every route. */
  onDecline: (choice: GuessChoice) => void;
}) {
  if (choices.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {choices.map((choice) => (
          <li key={choice.choiceId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="min-w-0 truncate text-caption-1-medium text-text-secondary">
                {choice.label}
              </h3>
              <button
                type="button"
                onClick={() => onDecline(choice)}
                className="shrink-0 rounded-sm text-caption-2-regular text-text-tertiary underline-offset-2 outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
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
                  <AddChip
                    key={route.routeId}
                    onPress={() => onChoose(route)}
                    sublabel={lines.sublabel}
                    label={`I took ${lines.label}${lines.sublabel ? ` — ${lines.sublabel}` : ""}`}
                  >
                    {lines.label}
                  </AddChip>
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
 * ── Code first, which is backwards from every other chip on this screen ─────
 *
 * The confirmed chips and the suggestion strip lead with the title, because
 * there the title IS the identifier — a list of unrelated courses, where
 * "Operating Systems I" tells you what you are looking at and the call number
 * is a detail. The options inside one choose-one group are the opposite: they
 * are siblings by construction, and their titles are near-identical.
 *
 * At phone width `COURSE_TITLE` truncates around eighteen characters, which
 * turned Art Hum and Music Hum into two buttons both reading "Masterpieces of
 * W…", and the two Environmental Biology options into two reading
 * "Environmental Biol…". Two controls that look the same and do different
 * things is a worse failure than an unlovely label. The call number is short,
 * never truncates, and is the only part of a sibling set guaranteed distinct —
 * so here it leads, and the title supports it.
 *
 * A sequence keeps its own name up front WHEN that name distinguishes it.
 * "Literature Humanities" and "Contemporary Civilization" are already short
 * and already distinct, and both halves go underneath because tapping confirms
 * both.
 *
 * The SEAS physics requirement is where that stops being true. The Bulletin
 * calls its three options "Sequence 1", "Sequence 2" and "Sequence 3", and the
 * program data is right to say so — but rendered as three buttons under the
 * question "which?", the labels answer it with an index the student has never
 * seen. The call numbers underneath were carrying the entire meaning of the
 * choice while the ordinal took the emphasis. So the single-course rule
 * extends to sequences: when the sibling labels do not tell the options apart,
 * the codes lead and the label supports — the same swap, triggered by the same
 * condition, just measured across the group instead of within one title.
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
  const codes = route.courses.map((facts) => facts.code).join(" · ");
  return labelsDistinguish(siblings)
    ? { label: route.label, sublabel: codes }
    : { label: codes, sublabel: route.label };
}

/**
 * Do this group's labels actually tell its options apart?
 *
 * The test is what remains once the numbering comes off. "Sequence 1" and
 * "Sequence 2" both reduce to "Sequence" and collide, so the labels are an
 * index rather than a description; "Literature Humanities" and "Contemporary
 * Civilization" survive intact and stay distinct, so they are descriptions.
 *
 * Cutting at the first digit rather than only a trailing one is deliberate:
 * mechanical engineering has a "Sequence 1, third term EEEB UN2001" route,
 * whose tail is a qualifier on the ordinal and not a name either.
 */
function labelsDistinguish(routes: readonly GuessChoiceRoute[]): boolean {
  const stems = routes.map((route) =>
    route.label.replace(/[\s,]*\d.*$/u, "").trim().toLowerCase(),
  );
  return new Set(stems).size === routes.length;
}
