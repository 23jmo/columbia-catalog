# Sociology

- **School / kind:** Columbia College (`CC`) / `major`
- **Proposed program id:** `cc-major-sociology`
- **Proposed `name`:** `"Sociology"`
- **Proposed `department`:** `"Sociology"`
- **`degreePoints`:** none (only meaningful on `kind: "core"`).
- **Published major total:** "a minimum of **30-31 points**" — but see *Point arithmetic*, which does not reconcile.
- **Bulletin edition:** 2026–2027
- **Primary source URL:** https://bulletin.columbia.edu/columbia-college/departments-instruction/sociology/#requirementstextcontainer
- **Date researched:** 2026-08-26
- **Confidence:** **9/10** — justification at the bottom.

---

## Headline findings, before the groups

Two of the three things the assignment flagged as risks turn out **not to
exist**, and saying so plainly is more useful than encoding around them.

1. **There is no "one course from each of N areas" structure.** The Columbia
   College Sociology major has no distribution requirement, no subfields, no
   areas. I read the entire Requirements tab of the Bulletin (it is 110 lines of
   HTML and contains exactly three tables — major, minor, legacy concentration)
   and cross-checked the General Studies edition and its PDF, which are
   identical. Nothing published names an area list. Per the brief: I have not
   approximated an area list I cannot find published, because there is none to
   find.

2. **The methods requirement is a single named course.** `SOCI UN3010 METHODS
   FOR SOCIAL RESEARCH`, printed as one of three required core courses. It is
   `all_of` (exact tier) — **not** `n_matching`, **not** `attested`. There is
   no "select a methods course" indirection of the kind that broke
   `cc-major-economics`, and `SOCI UN3020 Social Statistics` is an *example
   elective*, not a second methods option.

3. **The real risk on this page is the word "examples."** The elective list is
   introduced with "Some examples of electives include:" and then names twelve
   courses. Transcribing those twelve as `n_of { n: 6 }` would be the biggest
   possible error on this page — trap #4, an open-ended list read as a closed
   one — and would report a student with six perfectly good sociology electives
   as having none. The elective requirement is a *count of courses in the
   department*, and must be `n_matching`.

---

## Requirement groups

Four groups. `SOURCE` throughout is the URL above; the whole major is published
in one table on one page, so every group carries the same `sourceUrl`.

---

### 1. `soci-core` — "Core Courses"

**Bulletin text, verbatim (rendered):**

> **Core Courses**
> The following three courses are required (10 points):
> SOCI UN1000 — THE SOCIAL WORLD
> SOCI UN3000 — SOCIAL THEORY
> SOCI UN3010 — METHODS FOR SOCIAL RESEARCH

(The table's Points column is rendered empty for every row on this page; the
"10 points" figure comes only from the comment line. See *Point arithmetic*.)

**Proposed rule:** `all_of ["SOCI UN1000", "SOCI UN3000", "SOCI UN3010"]`

Exact tier. Three named courses, no alternatives, no "or higher", no honors
variant (hunted — see trap #8).

**Proposed note:**
> All three, and all three are prerequisites for the rest of the major: Social Theory and Methods both want The Social World first, and the Senior Seminar cannot be taken until Methods is finished. Each carries a required 0-point discussion section (SOCI UN1100, SOCI UN3001, SOCI UN3011) that is not matched here. The Bulletin calls this block 10 points; its own course listings put all three at 4 points, which is 12 — see the note on the major total.

**sourceUrl:** `SOURCE`
**Footnotes:** none attach to this block. (The page's only footnote marker is on
the elective block.)
**Catalog resolution:** all three resolve — `SOCI UN1000` THE SOCIAL WORLD
(4 pt), `SOCI UN3000` SOCIAL THEORY (4 pt), `SOCI UN3010` METHODS FOR SOCIAL
RESEARCH (4 pt).

---

### 2. `soci-electives` — "Sociology Electives"

**Bulletin text, verbatim (rendered):**

> **Elective Courses**
> Select six courses (20-21 points) in the Department of Sociology, to include at least three lecture courses (2000- or 3000-level, 3 points each) and at least two seminars (4 points each). The sixth course could be either a lecture course (to a total of 30 points) or a seminar (to a total of 31 points). For students taking the two-semester Senior Seminar, the sixth course must be a seminar. Some examples of electives include: \*
> SOCI UN3020 — Social Statistics
> SOCI UN3213 — Sociology of African American Life
> SOCI UN3235 — Social Movements
> SOCI UN3490 — MISTAKE, MISCONDUCT, DISASTER
> SOCI UN3285 — ISRAELI SOC & ISR-PLS CONFLICT
> SOCI UN3264 — The Changing American Family
> SOCI UN3900 — Societal Adaptations to Terrorism
> SOCI UN3914 — INEQUALITY, POVERTY & MOBILITY
> SOCI UN3931 — Sociology of the Body
> SOCI UN3974 — SOCI OF SCHOOLS,TEACH,LEARNING
> SOCI UN3995 — Senior Seminar
> SOCI UN3996 — SENIOR SEMINAR
>
> \* These may include the two-semester *Senior Seminar* (SOCI UN3995-SOCI UN3996).

**Proposed rule:**

```
n_matching, n: 6, select: {
  subjects: ["SOCI"],
  numberRange: [1000, 4999],
  excludeGroups: ["soci-core"],
  exclude: [
    "SOCI UN1100",   // The Social World — discussion section, 0 points
    "SOCI UN2211",   // AI in Society — discussion section, 0 points
    "SOCI UN3001",   // Social Theory — discussion section, 0 points
    "SOCI UN3011",   // Methods for Social Research — discussion section, 0 points
    "SOCI UN3103",   // Power, Politics & Society — discussion section, 0 points
    "SOCI UN3676",   // Organizing Innovation — discussion section, 0 points
  ],
}
```

**Why `n_matching` over the subject and not `n_of` over the twelve.** "Some
examples of electives include" — the twelve named courses are illustrations, not
the eligible set. Our catalog holds ~90 SOCI rows in the 1000–4999 band; a
student can legitimately take six that appear nowhere on that list of twelve.
`n_of` over the twelve would report almost every real sociology major as unmet.
This is trap #4 in its purest form, and the same call `cc-major-history` made
for its nine-course rule.

**Why `excludeGroups: ["soci-core"]`.** The core courses carry the `SOCI`
subject and sit inside 1000–4999, so without this every student's three required
core courses fill three of the six elective slots and the major reads three
courses shorter than it is published to be. This is the
`cc-major-biology`/`upper-level-electives` fix applied preemptively. The
Bulletin's arithmetic settles that it is right: 10 (or 12) core points **plus**
20–21 elective points sums to the published total, so the six are additional to
the three.

**Why the six `exclude` codes.** `SOCI UN1100`, `UN2211`, `UN3001`, `UN3011`,
`UN3103` and `UN3676` are 0-point discussion sections welded to lectures — the
same shape as `APMA E2001` on the mechanical engineering plan grid. Every
student who takes The Social World, Social Theory and Methods is *automatically
registered* for three of them, and a bare subject selector would hand them three
free electives. They are excluded by code rather than by range because they are
scattered across the band (1100, 2211, 3001, 3011, 3103, 3676) and no contiguous
`numberRange` separates them. This is not an approximation: every one of the six
carries 0 or null points in our catalog and the requirement specifies 3 or 4
points for each of its six slots, so none of them can satisfy any slot.
**Verified individually against the catalog on 2026-08-26.**

**Why `numberRange: [1000, 4999]`.** Cuts the graduate program — our catalog
holds 30+ `SOCI ...GR` rows at 5000–9999 (Proseminar, Field Work, MPhil Thesis
Writing) which an undergraduate major takes none of. The same guard
`cc-major-psychology` added on 2026-08-24 for the same reason. The `GU 4000`
band stays in, correctly: the Bulletin's own Sociology course listing prints
`SOCI GU4043` and `SOCI GU4801`. 1000-level stays in too: the department's own
minor list offers `SOCI UN1203` as an elective example, so 1000-level electives
are real.

**Proposed note:**
> Six more courses in the Department of Sociology, on top of the three core courses. At least three must be lecture courses at the 2000 or 3000 level and at least two must be seminars — a split this audit cannot check, so the two groups below are yours to confirm. The twelve courses the Bulletin prints are examples, not the whole list: any Sociology course counts. The required discussion sections attached to lecture courses carry no points and are not counted here. If you take the two-semester Senior Seminar, your sixth course must be a seminar.

**sourceUrl:** `SOURCE`

**Footnotes resolved:** the page's **only** footnote marker is the `*` on this
block's comment line. It reads, in full: "These may include the two-semester
*Senior Seminar* (SOCI UN3995-SOCI UN3996)." It attaches to the example list,
and its content is that the Senior Seminar pair may be used as electives — which
the selector already allows, since both carry the `SOCI` subject. Carried in the
note as the "sixth course must be a seminar" clause. No other `<sup>` or
`sc_footnotes` element exists anywhere on the Requirements tab (verified against
the raw HTML).

**Catalog resolution.** The selector is a shape, not a list, so `dump-program`
prints no unmatched codes for it — but the twelve *example* codes matter for the
note and for anyone tempted to enumerate them. Checked 2026-08-26:

| Code | In catalog? |
|---|---|
| `SOCI UN3020` Social Statistics | **no** |
| `SOCI UN3213` Sociology of African American Life | **no** (Barnard's `SOCI BC3214` SOC OF AFRICAN AMERICAN LIFE does resolve) |
| `SOCI UN3235` Social Movements | yes (3 pt) |
| `SOCI UN3490` Mistake, Misconduct, Disaster | **no** |
| `SOCI UN3285` Israeli Soc & Isr-Pls Conflict | yes (3 pt) |
| `SOCI UN3264` The Changing American Family | **no** |
| `SOCI UN3900` Societal Adaptations to Terrorism | **no** |
| `SOCI UN3914` Inequality, Poverty & Mobility | yes (4 pt) |
| `SOCI UN3931` Sociology of the Body | **no** (Barnard's `SOCI BC3933` SOCIOLOGY OF THE BODY does resolve) |
| `SOCI UN3974` Soci of Schools, Teach, Learning | **no** |
| `SOCI UN3995` Senior Seminar | resolves, **with the wrong title** — see below |
| `SOCI UN3996` Senior Seminar | yes (3–4 pt) |

Seven of the twelve have no catalog row. Because the rule is a selector rather
than an enumeration, **none of this makes any requirement unsatisfiable** — it
only means those particular courses did not run in a covered term. Worth stating
in the file's header so a reader is not surprised.

**⚠ A catalog/Bulletin conflict on `SOCI UN3995`.** The Bulletin's course search
returns `SOCI UN3995` as **"Senior Seminar", 4 points** ("Students undertake
independent research projects and compose a senior thesis…"), and the
department's honors prose names "the two-semester Senior Seminar (SOCI UN3995-SOCI
UN3996)". Our catalog's `SOCI3995UN` row is titled **"INDIVIDL STUDY I"** with
null points. Note also that `SOCI UN3995` has no description in the Bulletin's
own *Courses* tab (only `UN3996` does), and our catalog separately holds
`SOCI UN3988`/`UN3989` "Senior Thesis Seminar I/II" and `SOCI UN3998`/`UN3999`
"Individual Study I/II". Something is renumbered or mis-titled on one side. This
does not affect any proposed rule — no group names `UN3995` — but it should be
recorded, and it should be looked at before anyone encodes an honors track.

---

### 3. `soci-lecture-courses` — "Lecture Courses"

**Bulletin text, verbatim** (the same comment line as above, this clause):

> …to include at least three lecture courses (2000- or 3000-level, 3 points each)…

**Proposed rule:** `attested`

**Why it cannot be counted.** Two independent reasons, either one sufficient:

- **"Lecture" is not a property of a course number in this department.**
  `SOCI UN3235` Social Movements (3 pt) is a lecture and `SOCI UN3914`
  Inequality, Poverty & Mobility (4 pt) is a seminar; both are `SOCI UN39xx`.
  There is no band, no flag, and no `sc_courselist` attribute that separates
  them. The only signal is the point value — 3 for lectures, 4 for seminars —
  and it is not reliable either: `SOCI UN1000`, `SOCI UN3000` and `SOCI UN3010`
  are 4-point *lectures*.
- **`CourseSelector` has no points field.** Even if the 3-vs-4 signal were
  reliable, the language cannot express it. (`cc-major-psychology` records the
  same limitation for its "3 or more points" floor.)

A `numberRange: [2000, 3999]` approximation would be worse than nothing: it
matches every seminar in the department too, and would report a student with
three seminars and no lectures as having satisfied the lecture requirement —
the exact failure mode `attested` exists to prevent.

**Proposed note:**
> At least three of your six electives must be lecture courses at the 2000 or 3000 level, normally 3 points each. Whether a Sociology course is a lecture or a seminar is not something a course number tells you — the department's 3000-level range holds both — so this one is yours to confirm.

**sourceUrl:** `SOURCE`

---

### 4. `soci-seminars` — "Seminars"

**Bulletin text, verbatim** (same comment line):

> …and at least two seminars (4 points each). The sixth course could be either a lecture course (to a total of 30 points) or a seminar (to a total of 31 points). For students taking the two-semester Senior Seminar, the sixth course must be a seminar.

**Proposed rule:** `attested`

Same two reasons as `soci-lecture-courses`. Additionally, the third sentence is
a requirement *conditional on how another requirement was satisfied* ("for
students taking the two-semester Senior Seminar…"), which the language cannot
express at all — the same shape as the MechE `APMA E2101` consequence, and
handled the same way, in the note.

**Proposed note:**
> At least two of your six electives must be seminars, normally 4 points each. If you take the two-semester Senior Seminar (SOCI UN3995–SOCI UN3996), your sixth elective must also be a seminar. As with the lecture requirement, no course number tells you whether a Sociology course is a seminar, so this one is yours to confirm.

**sourceUrl:** `SOURCE`

---

### Groups deliberately NOT proposed

- **A Senior Seminar group.** `SOCI UN3995`–`UN3996` is optional: it appears in
  the elective *examples* and in the departmental-honors paragraph, never as a
  requirement. Encoding it would put a red requirement on the screen of every
  student who is not going for honors.
- **A statistics/methods elective group.** `SOCI UN3020 Social Statistics` is an
  example elective. The methods requirement is `SOCI UN3010`, in `soci-core`.
- **A departmental-honors group.** GPA thresholds and a thesis; honors is not a
  graduation requirement. See *Not encodable*.

---

## Point arithmetic

**The reconciliation fails, the failure is the Bulletin's, and it is isolated to
one number.** Shown in full because trap #6 says a mismatch means a
transcription error somewhere — I went looking, and the error is not mine.

### As the Bulletin states it (internally consistent)

| Block | Bulletin's stated points |
|---|---|
| Core Courses (3 courses) | 10 |
| Elective Courses (6 courses) | 20–21 |
| **Stated total** | **30–31** ✓ matches "a minimum of 30-31 points" |

The elective figure checks out exactly against its own breakdown:
3 lectures × 3 pt = 9, plus 2 seminars × 4 pt = 8, plus a sixth course at 3 or 4
→ **20 or 21**, and the page even names the two resulting totals ("to a total of
30 points" / "to a total of 31 points"). No lost label there (trap #5 cleared for
that block).

### As the Bulletin's own course listings price the courses

| Course | Points, from the Bulletin's course listing on the same page |
|---|---|
| `SOCI UN1000` THE SOCIAL WORLD | **4.00** |
| `SOCI UN3000` SOCIAL THEORY | **4.00** |
| `SOCI UN3010` METHODS FOR SOCIAL RESEARCH | **4.00** |
| **Actual core total** | **12** |

**12 ≠ 10.** Actual major total is therefore 12 + 20/21 = **32–33 points**, not
30–31.

Our catalog agrees with the Bulletin's course listings: all three at 4 points.
The GS edition of the same page, and its PDF, repeat "10 points" verbatim, so
this is not a CC-page typo — it is the same stale figure in both editions.

**Most likely cause, stated as a hypothesis, not a finding:** "10 points" is a
leftover from when The Social World and Social Theory were 3-point courses
(3 + 3 + 4 = 10). The elective sentence still describes lecture courses as "3
points each" while the department's own required lectures now run at 4, which
points the same way.

**Consequence for the transcription: none.** Every proposed rule counts
*courses*, not points — `all_of` over three named courses and `n_matching` with
`n: 6`. No group's behaviour depends on the disputed number. It belongs in the
file header and in the `soci-core` note so a student reading "30-31 points" on
the Bulletin and seeing a different number on their transcript knows why.

---

## Not encodable

1. **Lecture vs seminar.** "at least three lecture courses (2000- or 3000-level,
   3 points each) and at least two seminars (4 points each)" — not derivable from
   a course code; `CourseSelector` has no points field. Held as two `attested`
   groups rather than approximated.
2. **The conditional sixth course.** "For students taking the two-semester Senior
   Seminar, the sixth course must be a seminar." — a requirement whose content
   depends on how another requirement was satisfied. The language has no
   conditionals.
3. **The point floor per elective.** The six electives are specified at 3 or 4
   points each. `SOCI GU4043` WORKSHP ON WEALTH & INEQUALITY is 1 point and
   `SOCI UN3998`/`UN3999` INDIVIDUAL STUDY are 1–6, all of which the selector
   will happily count. No points field on `CourseSelector`. Named in the note.
4. **Departmental honors.** "In order to be considered for departmental honors,
   majors must have a minimum GPA of 3.6 overall and 3.8 in courses in the
   Department of Sociology. In addition, students must produce an exceptional
   honors thesis in the two-semester Senior Seminar… Normally no more than 10% of
   graduating majors receive departmental honors in a given academic year." —
   GPA minima, and honors is not a graduation requirement anyway.
5. **The Senior Seminar's admission gate.** "In order to register for the Senior
   Seminar, students must have completed SOCI UN3010 METHODS FOR SOCIAL RESEARCH
   and have had their research project accepted by the faculty member teaching
   the Senior Seminar. Submissions of research projects are due by May 1
   preceding the seminar." — prerequisite ordering plus a faculty decision.
6. **Whether an independent-study course counts as an elective.** The Bulletin
   says nothing either way, so nothing is excluded on a guess. Open question 2.

---

## The nine traps — one-line verdicts

1. **`sequence_choice` vs `n_of {n:2}`.** The only sequence-shaped thing on the
   page is the two-semester Senior Seminar `SOCI UN3995`–`UN3996`, and it is
   **optional**, so it is not encoded at all. If anyone later encodes an honors
   track, it must be `all_of`/`sequence_choice` — half of a two-term thesis
   sequence satisfies nothing. **Clear, with a warning left behind.**
2. **Delegated blocks nobody picked up.** None. Sociology states its whole major
   in one table and delegates nothing — no mathematics, no statistics, no
   outside-department coursework at all. `SOCI UN3020 Social Statistics` is an
   elective example, not a delegated statistics requirement. I checked the
   Overview tab as well as the Requirements tab for a stray requirement; there is
   none. **Clear.**
3. **Footnotes.** Exactly **one** footnote marker exists on the entire
   Requirements tab: the `*` on the elective comment, resolving to "These may
   include the two-semester *Senior Seminar* (SOCI UN3995-SOCI UN3996)."
   Located in the raw HTML (`<sup>*</sup>` + `<dl class="sc_footnotes">`),
   attached, and carried. The minor and concentration tables have none.
   **Resolved.**
4. **"Or higher" / open-ended substitutions.** The dominant hazard on this page:
   "**Some examples of electives include:**" introduces a list of twelve that is
   explicitly not closed. Encoded as `n_matching` over the subject, never as
   `n_of` over the twelve. **Handled.**
5. **CourseLeaf eats labels.** Checked: the elective block's arithmetic
   (9 + 8 + 3/4 = 20/21) matches its stated point range exactly, so no
   alternative is missing there. Worth noting that the **Points column is empty
   on all three tables on this page** — every `hourscol` cell renders blank — so
   the only point figures anywhere are in prose. That is a rendering habit, not a
   lost label, but it is why the 10-vs-12 problem is invisible from the table.
   **Clear.**
6. **Reconcile the arithmetic.** Done, in full, above. The elective block
   reconciles; **the core block does not** — stated 10, published course values
   12. Located precisely, cause hypothesised, and shown not to affect any rule.
   **Found, unresolvable from published sources.**
7. **Duplicated requirements across files.** No existing program file names a
   single `SOCI` course (`grep` over `lib/requirements/` returns nothing), so
   there is nothing to collide with today. The live exposure is *within* the
   Sociology page: the major, the minor and the legacy concentration all require
   `SOCI UN1000` and `SOCI UN3000`, and the major and concentration share all
   three core courses. If the minor or concentration is ever encoded, the core
   list must be a shared const (the `ECON_CORE` pattern in
   `cc-major-economics.ts`), not three copies. **Clear now; flagged for later.**
8. **Honors / accelerated sequences.** Hunted explicitly. There is **no honors
   or accelerated variant of any required course** — no honors Social Theory, no
   accelerated Methods, no alternate numbering. The department's honors path is a
   GPA threshold plus a thesis in the optional Senior Seminar, which is not a
   variant of a requirement. **Clear.**
9. **Courses the Bulletin names that our catalog lacks.** Seven of the twelve
   example electives have no catalog row (`SOCI UN3020`, `UN3213`, `UN3490`,
   `UN3264`, `UN3900`, `UN3931`, `UN3974`), plus three more named only on the
   minor's list (`UN3212`, `UN3915`, `UN3985`). Because the elective rule is a
   selector rather than an enumeration, **no requirement is made unsatisfiable**
   — but the header should say so. Separately, `SOCI UN3995` resolves in our
   catalog under a title that disagrees with the Bulletin. **Flagged.**

---

## Which file each requirement belongs on

**All four groups go on a single new file,
`lib/requirements/programs/cc-major-sociology.ts`,** registered in
`lib/requirements/programs/index.ts`. Nothing on this page belongs on any
existing file, and nothing on any existing file needs to change.

Two future files are implied by the same Bulletin page and are **out of scope
here** — flagged so that whoever writes them does not copy the core list:

- `cc-minor-sociology` — `SOCI UN1000` + `SOCI UN3000` + three electives
  (10 points, "the elective courses must be 3 or 4 units"). Note it does **not**
  require Methods.
- `cc-concentration-sociology` — the same three core courses + three electives
  (20 points), "one of which must be a seminar". The Bulletin files it under an
  `<h2>` reading "**For students who entered Columbia in or before the 2023-24
  academic year**", so it is a legacy program and should carry that in its
  header if it is ever encoded.

---

## Open questions

1. **Do Barnard `SOCI ...BC` courses count toward the six electives?**
   This is **the most important open question for this program**, because it
   decides whether roughly 40 of the ~90 matchable SOCI rows in our catalog
   count — including a large share of the 4-point seminars a student needs two
   of. The Bulletin says only "in the Department of Sociology" and never
   mentions Barnard; its twelve examples are all `UN`. Two pieces of evidence
   point to **yes**: (a) the Columbia College Bulletin's own Sociology *Courses*
   tab lists five Barnard courses (`SOCI BC3219`, `BC3916`, `BC3920`, `BC3925`,
   `BC3946`) among the department's offerings, and its faculty roster
   intermixes Barnard sociologists without a separate section; (b) a search-index
   snippet of `sociology.columbia.edu/content/undergraduate-program-sociology`
   states that Barnard courses "are considered fully equivalent for purposes of
   the major", that "lecture and seminar courses (i.e. BC39##) can fill
   electives", and that there is "no limit on the number of courses that may be
   taken at Barnard."
   **I could not verify (b) myself** — `sociology.columbia.edu` returns HTTP 403
   to every automated fetch (Cloudflare interstitial), so that text is a search
   index's rendering of a page I never loaded. I have therefore written the rule
   as plain `subjects: ["SOCI"]`, which *does* include the `BC` rows (the same
   choice `cc-major-history` and `cc-major-psychology` made for their subjects),
   and flagged it here rather than adding a `BC` exclusion on a guess. Note that
   `n_matching` is the `flagged` tier precisely because it is "correct today, not
   provably correct" — which is the honest label for this decision.
   *What would resolve it:* a human loading the department's undergraduate
   program page, or one sentence from the DUS.

2. **Do independent-study and study-abroad courses count as electives?**
   `SOCI UN3998`/`UN3999` INDIVIDUAL STUDY I/II (1–6 pt) and `SOCI UN3991`/
   `SOCI UN3996` `...OC` (Supervised Study in France / Cuba) all match the
   selector. The Bulletin says nothing about them either way, so nothing is
   excluded. Compare `cc-major-biology`, where the Bulletin *does* say
   "BIOL UN3500 cannot be used" and the exclusion is therefore warranted. If the
   department says these do not count, add them to `exclude`.

3. **`SOCI UN3995`: which course is it?** Bulletin course search says "Senior
   Seminar, 4 points"; our catalog says "INDIVIDL STUDY I", null points; and our
   catalog separately holds `SOCI UN3988`/`UN3989` "Senior Thesis Seminar I/II",
   which the Bulletin never mentions. No proposed rule depends on it, but it
   should be settled before any honors track is encoded.

4. **Is the 30–31 point total wrong, or are the course point values?** See
   *Point arithmetic*. Resolving it needs the registrar or the DUS, not another
   page.

---

## Proposed golden records

Hand-written from the Bulletin. Expectations stated by hand, not computed.

### `soci-core-is-not-electives` — the regression record

> Sociology major who has finished all three core courses and taken no other
> sociology course.

```
programId: "cc-major-sociology"
taken: ["SOCI UN1000", "SOCI UN3000", "SOCI UN3010"]
expect:
  "soci-core":      { status: "satisfied", completed: 3 }
  "soci-electives": { status: "unmet",     completed: 0 }   ← THE ASSERTION
```

*Why:* a bare `n_matching { n: 6, select: { subjects: ["SOCI"] } }` counts the
three core courses as three of the six electives and reports this student
`3/6 IN PROGRESS` on a requirement they have not begun — a three-course
overstatement of a nine-course major. Only `excludeGroups: ["soci-core"]` gets
it right. This is the `cc-major-biology` elective bug in a new department, and
it is the single most likely way this transcription goes wrong.

### `soci-discussion-sections-are-not-courses` — the 0-point trap

> Sociology major registered for the three core courses **and their required
> discussion sections**, plus two real electives.

```
programId: "cc-major-sociology"
taken: [
  "SOCI UN1000", "SOCI UN1100",   // The Social World + its discussion
  "SOCI UN3000", "SOCI UN3001",   // Social Theory + its discussion
  "SOCI UN3010", "SOCI UN3011",   // Methods + its discussion
  "SOCI UN3235", "SOCI UN3914"    // two genuine electives
]
expect:
  "soci-core":      { status: "satisfied",   completed: 3 }
  "soci-electives": { status: "in_progress", completed: 2 }   ← THE ASSERTION
```

*Why:* every Columbia sociology major is auto-registered for these three
discussion sections. Without the `exclude` list they read as three more
electives and this student is scored 5/6 instead of 2/6 — one course from being
told a nine-course major is finished. Note the record asserts **2**, not just
"in progress": a group can be correctly in-progress and still be lying about the
count.

### `soci-electives-beyond-the-examples` — the edge case (open-ended list)

> Sociology major who has finished the core and six electives, **none of which
> is one of the twelve courses the Bulletin prints as examples** — including one
> Barnard seminar and one GU-level course.

```
programId: "cc-major-sociology"
taken: [
  "SOCI UN1000", "SOCI UN3000", "SOCI UN3010",
  "SOCI UN3203",   // Power, Politics & Society (3 pt lecture)
  "SOCI UN3217",   // Law & Society (3 pt lecture)
  "SOCI UN3302",   // Sociology of Gender (3 pt lecture)
  "SOCI UN3901",   // Sociology of Culture (4 pt seminar)
  "SOCI UN3968",   // Immigration, Race, and Asian Americans (4 pt seminar)
  "SOCI GU4801"    // Israel and the Palestinians (4 pt)
]
expect:
  "soci-core":            { status: "satisfied", completed: 3 }
  "soci-electives":       { status: "satisfied", completed: 6 }   ← THE ASSERTION
  "soci-lecture-courses": { status: "unmet" }    // attested, unticked
  "soci-seminars":        { status: "unmet" }    // attested, unticked
expectSatisfiedCount: 2
```

*Why:* this is the student an `n_of` over the twelve examples fails completely —
six real sociology electives, zero matches, a finished major reported as not
started. It also pins two secondary behaviours: a `GU 4000`-level course counts
(it is inside `[1000, 4999]` and the Bulletin's own course tab lists it), and the
two `attested` groups stay unmet until the student ticks them, so
`expectSatisfiedCount` is 2 rather than 4.
*If open question 1 resolves against Barnard,* swap `SOCI GU4801` for another
`UN` course and add a fourth record asserting that a `SOCI ...BC` course does
**not** count.

---

## Sources

**Primary (Bulletin, 2026–2027).**

- Sociology (Columbia College) — https://bulletin.columbia.edu/columbia-college/departments-instruction/sociology/
  Requirements tab read in full from the raw CourseLeaf HTML (lines 476–586 of
  the served document), including heading levels and footnote elements.
- Sociology (General Studies), and its PDF — cross-check only. Word-for-word
  identical requirement text, including the "10 points" figure.
- Bulletin course search, for `SOCI UN3995`.
- Columbia College departments index — confirms Sociology has one department
  page and no separate program page.

**Unreachable.** `sociology.columbia.edu` (all paths) returns HTTP 403 to
automated fetches. This holds the department's own undergraduate program page,
which is the only place the Barnard-equivalence question appears to be answered.
Stated rather than worked around.

**Catalog.** `.env.local` present, database reachable. Every code above checked
against the live `courses` table on 2026-08-26; the full 147-row `SOCI` listing
was pulled to identify the 0-point discussion sections and the graduate band.

---

## Confidence: 9/10

| Rubric item | Status |
|---|---|
| Every group traced to a URL, rendered text quoted verbatim | ✅ four groups, one page, verbatim including the elective comment line |
| Every footnote marker on every source page resolved | ✅ exactly one exists; located in the raw HTML, resolved, attached |
| Point arithmetic reconciled against the published total, shown | ⚠️ shown in full; the elective block reconciles, the core block does not (10 stated vs 12 published). The failure is the Bulletin's, is located precisely, and affects no rule. |
| Every course code in bulletin form and checked against the catalog | ✅ all core codes, all twelve examples, all six exclusions, plus the full SOCI listing |
| Honors/accelerated variants hunted explicitly | ✅ none exist; honors is a GPA-plus-thesis track, recorded |
| Nine traps considered with a verdict | ✅ above |
| Everything unencodable listed rather than approximated | ✅ six items, including the "areas" structure that does not exist |
| Which file each requirement belongs on, stated | ✅ one new file; the minor and legacy concentration flagged for later with a shared-const warning |
| Golden records hand-written from the Bulletin | ✅ three, one of them the open-list edge case |

**What is holding it at 9 rather than 10:** two things, both named above and
neither guessed at. (1) The Barnard question — I have written `subjects: ["SOCI"]`,
which includes Barnard, on the strength of the Bulletin's own course listing plus
a departmental page I could not load. (2) The core block's point total does not
reconcile against the Bulletin's own course values, and no published source
resolves it. Neither changes a rule kind; both change what a student reads. If
the Barnard question came back "no", the selector would need a mechanism it does
not have — `CourseSelector` cannot filter on the school qualifier, which is
exactly why `cc-major-psychology`'s residency rule is `attested` — and this
dossier would drop to 7 with a named blocker.
