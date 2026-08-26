# Requirements research brief

You are producing a **research dossier** for one or more Columbia degree programs
that this repo does not yet encode. You are NOT writing program `.ts` files.
Transcription is a separate, later step done by a human with your dossier in
hand. Your job is to make that step mechanical.

Stop only when you can honestly rate your dossier **9/10 confidence** against the
rubric at the bottom. Iterate until you get there, or until you can name exactly
what is blocking you from getting there.

---

## 1. Read the existing encodings FIRST

Do not start from the Bulletin. Start from what this repo already got right and
already got wrong. Read, in full:

- `lib/requirements/types.ts` — the rule language and the three verification
  tiers. This is the vocabulary your dossier must be expressible in.
- `lib/requirements/evaluate.ts` — how each rule kind is actually checked.
- `lib/requirements/programs/seas-core.ts` — the best worked example of a hard
  page. Its header is ~100 lines of reasoning about what could not be encoded
  and why. Read all of it.
- `lib/requirements/programs/seas-major-mechanical-engineering.ts` — the best
  worked example of footnote handling.
- `lib/requirements/programs/cc-major-economics.ts` and
  `lib/requirements/golden.ts` — the honors-sequence bug and how a golden
  record caught it.
- At least one program file in the same school as your target.

`npx tsx --env-file=.env.local scripts/dump-program.ts --list` lists what is
already encoded. `scripts/dump-program.ts <id> <id>` prints a program's
requirements resolved against the live catalog — including the courses it names
that our catalog cannot match. Use it on a comparable existing program to see
the shape of a good result. If `.env.local` is missing or the DB is unreachable,
say so in the dossier and continue without catalog resolution.

## 2. The rule language you must map onto

| Kind | Meaning | Tier |
|---|---|---|
| `all_of` | every named course | exact |
| `n_of` | n from a named list | exact |
| `sequence_choice` | one complete sequence from several alternatives | exact |
| `n_matching` | n courses matching a selector (subjects / number range / flag) | flagged |
| `points_matching` | points from courses matching a selector | flagged |
| `attested` | student self-certifies; nothing is checked | attested |

A `CourseSelector` supports `subjects`, `numberRange`, `flag`, `include`,
`exclude`.

**The language deliberately CANNOT say:** grade minima ("C- or higher"),
residency rules, "at most one course may double count", advisor petitions,
transfer credit equivalencies. If the Bulletin states one of these, record it in
the dossier under *Not encodable* — do not invent a rule for it.

## 3. Traps this repo has already been bitten by

Every one of these is a real bug that shipped. Check your program for each.

1. **`sequence_choice` vs `n_of { n: 2 }`.** Taking the first term of one
   sequence and the second of another is a schedule a student can actually
   build, and it satisfies nothing. If the Bulletin says "one of the following
   sequences", it is `sequence_choice`. Always.
2. **Delegated blocks that nobody picked up.** `seas-core` carries only the
   nontechnical Core and delegates math/science/computing to the department.
   `seas-major-computer-science` never picked its share up, and a student was
   shown a CS degree with no physics, no chemistry and no lab. **Read the
   department's entire Degree Track table, not just its "Major Requirements"
   block.**
3. **Footnotes.** MechE footnote 3 allows `EEEB UN2001` / `BIOL UN2005` in place
   of the third physics term. Missing it marked a complete student incomplete.
   Resolve EVERY footnote marker on the page and say what it attaches to.
4. **"Or higher" / open-ended substitutions.** Not guessable. A numeric floor
   over a subject sweeps in unapproved courses. Record the prose verbatim and
   mark it unencodable.
5. **CourseLeaf eats labels.** On the SEAS core page, a three-alternative list
   rendered as two because the third alternative's heading was dropped. If a
   list's arithmetic does not match the stated point total, suspect a lost
   label before you suspect the total.
6. **Reconcile the arithmetic.** Sum the point ranges of every block and check
   against the published total. A mismatch is a transcription error somewhere —
   find it before you write the dossier.
7. **Duplicated requirements across files.** `ECON UN1105` was encoded on both
   the SEAS core and three major files; a course held in two places is evaluated
   twice and the copies can disagree. Say explicitly which file each requirement
   belongs on.
8. **Honors / accelerated sequences.** `cc-major-economics` had a math block
   with no room for `MATH UN1207`+`UN1208` — the harder, complete path — and
   told those students to go back and take calculus. Hunt for the honors variant
   of every sequence.
9. **Courses the Bulletin names that our catalog lacks.** `EEEB UN2005` is one.
   These are real and must be flagged, not dropped: the difference between "you
   have not taken this" and "we cannot tell".

## 4. Sources

Primary: `bulletin.columbia.edu`, the **2026–2027** edition. Record the exact URL
per requirement group — groups carry their own `sourceUrl` because departments
publish blocks on different pages. The department's own site is a secondary
source; where it disagrees with the Bulletin, record BOTH and say which you
trust and why. Never treat a departmental PDF advising sheet as authoritative
over the Bulletin.

Use WebFetch / WebSearch (load them via ToolSearch first — they are deferred).

## 5. Deliverable

One file per program: `.plans/requirements-research/<school>-<kind>-<name>.md`
using this repo's id convention (`cc-major-sociology`, `seas-major-electrical-engineering`).

Structure:

```
# <Program name>
- School, kind, degree points, bulletin edition, primary source URL
- Date researched, confidence score with justification

## Requirement groups
For EACH group:
  - id, label (repo naming conventions — copy them from an existing file)
  - The Bulletin's exact rendered text, quoted
  - Proposed rule kind + the exact course codes, in `SUBJ NNNNN` bulletin form
  - sourceUrl for this specific group
  - Any note the student needs to see, in the voice the existing files use
  - Footnotes resolved
  - Catalog resolution: which codes dump-program could not match

## Point arithmetic
  Block-by-block sum vs the published total. Show the reconciliation.

## Not encodable
  Each item, the verbatim prose, and why the rule language cannot hold it.

## Open questions
  Anything you could not resolve, with what would resolve it.

## Proposed golden records
  2–3 synthetic students that would catch a wrong transcription of THIS program.
  Include at least one edge case: honors sequence, mid-sequence, transfer
  credit, or double-counting. State the expected outcome per group by hand.
```

## 6. Confidence rubric — do not stop below 9/10

Score honestly. 9/10 requires ALL of:

- [ ] Every group traced to a specific URL and the rendered text quoted verbatim
- [ ] Every footnote marker on every source page resolved and attached
- [ ] Point arithmetic reconciled against the published total, shown
- [ ] Every course code in bulletin form and checked against our catalog (or the
      failure to check stated)
- [ ] Honors/accelerated variants of every sequence hunted for explicitly
- [ ] Each of the nine traps in §3 explicitly considered, with a one-line verdict
- [ ] Everything unencodable listed rather than approximated
- [ ] Which file each requirement belongs on, stated
- [ ] Golden records written by hand from the Bulletin, not derived from any code

Below 9/10, say so and name the gap. **A dossier that says "I am at 7/10 because
the department publishes the elective list only as a PDF advising sheet" is far
more useful than one that claims 9 and quietly guessed.** Guessing is the one
unrecoverable failure here — an audit that quietly guesses is worse than no
audit, because a student plans a semester around it.
