# Applied Mathematics (B.S.)

- **Proposed program id:** `seas-major-applied-mathematics`
- **School:** SEAS (`school: "SEAS"`) · **Kind:** `major` ·
  **Department:** `"Applied Physics and Applied Mathematics"`
- **Degree points:** 128 school-wide. It belongs on `seas-core`, where
  `degreePoints: 128` already sits, and **not** on this file. The published
  Applied Mathematics track sums to ~119 and is *not intended* to reach 128:
  128 is a credit floor the student tops up with their own elective credit, not
  the sum of the prescribed track. **Settled 2026-08-26 — see *Point
  arithmetic*.**
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/applied-physics-applied-mathematics/undergraduate-programs/applied-mathematics-bs/`
  - Curriculum tab: `…/applied-mathematics-bs/#curriculumtextcontainer`
  - Degree Track tab: `…/applied-mathematics-bs/#degreetracktextcontainer`
  - Department index (establishes that this is a program, not a track):
    `…/applied-physics-applied-mathematics/undergraduate-programs/`
  - Bulletin-hosted PDF degree chart, linked from the Degree Track tab:
    `…/applied-mathematics-bs/2026-2027_Engineering_Bulletin_Charts_APAM.pdf`
- **Date researched:** 2026-08-26
- **Confidence: 10/10** (was 9/10 until 2026-08-26). Every group is traced to a
  URL with the rendered text
  quoted; all seven Degree Track footnotes are resolved and attached; every
  course code was checked twice — against our catalog by direct query and
  against the Bulletin's own course-inventory endpoint
  (`bulletin.columbia.edu/ribbit/index.cgi?page=getcourse.rjs&code=…`), which
  found two codes the Bulletin prints that do not exist in its own database.
  The structural question (own file vs shared APAM file) is answered with
  reasoning below.

  **Raised from 9/10 to 10/10 on 2026-08-26.** The one item held back was the
  point arithmetic — the track summing to ~119 against a published 128. That is
  now settled from primary sources: 128 is a *minimum credit floor* that the
  Bulletin states separately from the program requirements, so the prescribed
  track is not supposed to sum to it. No requirement block is missing. See
  *Point arithmetic*. Open questions 2–4 remain recorded, but each is a defect
  in what the Bulletin prints (a course code absent from the Bulletin's own
  database, two same-titled records, an unstated level floor) rather than a gap
  in the reading of it.

---

## The structural question, answered first

**Applied Mathematics is a program in its own right, not a track.** The
department index page says so in one sentence: *"The Department of Applied
Physics and Applied Mathematics offers three undergraduate programs: applied
physics, applied mathematics, and materials science."* Each has its own
`…/undergraduate-programs/<name>-bs/` page with its own Curriculum tab, its own
eight-semester Degree Track grid, its own footnote set and its own PDF chart.
`Applied Mathematics (BS)` and `Applied Physics (BS)` are siblings, and there is
a fourth page, `Double Major in Applied Physics and Applied Mathematics`, which
exists precisely because they are two programs.

**Recommendation: one self-contained `seas-major-applied-mathematics.ts`. Do not
create a shared APAM-common file.** Four reasons, in descending order of force:

1. **The Bulletin does not share the block; it duplicates it.** I diffed the
   Applied Physics and Applied Mathematics grids cell by cell. The
   first-and-second-year block is republished in full on each page, and it is
   *not* identical — Applied Physics carries a footnote on `ENGI E1006` ("With
   permission of faculty adviser, students demonstrating familiarity with
   computational mathematics using Python may waive course requirement…") that
   Applied Mathematics does not, and Applied Mathematics carries footnotes 2 and
   3 on physics cells that Applied Physics does not. A shared file would have to
   pick one page's footnotes and would be wrong for the other program.
2. **It would re-create trap #7, one level up.** A shared program would mean two
   programs both claiming `MATH UN1101`. `evaluateProgram` evaluates each
   program independently and `crossCountedCourseIds` reports overlap as
   something to confirm with an adviser — so the student would see calculus
   twice, with a "counting toward 2 requirements" warning on a course that is
   one requirement.
3. **`excludeGroups` cannot cross a program boundary.** `types.ts` is explicit:
   "Ids of groups in the **SAME program** whose matched courses cannot also
   count here." The `math-apma-stat-elective` group below *must* exclude the
   calculus and ODE groups or it is vacuous. Split across two files, it cannot.
4. **The repo already made this choice four times.** `seas-major-mechanical-
   engineering`, `seas-major-biomedical-engineering`,
   `seas-major-operations-research` and `seas-major-computer-science` each carry
   their own `calculus`, `physics` and chemistry groups. The convention is
   settled; Applied Mathematics is not the case to break it on.

The cost is that the shared block will be transcribed a fifth time and a
sixth (when Applied Physics is encoded). That is a real cost and the right one:
`seas-coverage.test.ts` is the place to assert that the five SEAS majors agree
where their pages agree.

---

## How this program differs from the four SEAS majors already encoded

| Block | The other four | **Applied Mathematics** |
|---|---|---|
| Physics | 2 terms (OR, SEAS-CS) or 3 (MechE, BME) | **3 terms for sequences 1 and 2, 2 for sequence 3** — and the third-year lab is sequence-dependent |
| Science laboratory | one `n_of` over PHYS + CHEM labs | `PHYS UN1494` **or** `PHYS UN3081` only, plus an open-ended "or a lab course in Astronomy, Astrophysics, Biology, or Chemistry" |
| Chemistry | a lecture or a sequence | **one course of chemistry *or* biology, with "or higher" on two of the three options** |
| `ELEN E1201` | required (MechE, BME) | **not required** |
| Major core | flat `all_of` lists | **four of the six core courses carry named one-for-one substitutions** — encoding them as `all_of` would be the single biggest error available on this page |

---

## Requirement groups

### 1. `calculus` — "Calculus"

**Bulletin, Degree Track grid, verbatim:**

> Semester I — `MATH UN1101`[1] CALCULUS I
> Semester II — `MATH UN1102`[1] CALCULUS II
> Semester III/IV — `APMA E2000` & `APMA E2001` (taken Semester III or IV)[1]
> MULTV. CALC. FOR ENGI ＆ APP SCI

- **Rule:** `all_of` — `MATH UN1101`, `MATH UN1102`, `APMA E2000`
- **sourceUrl:** `…/applied-mathematics-bs/#degreetracktextcontainer`
- **Note:** "All three. APMA E2000 carries a required 0-point recitation,
  APMA E2001, which is not matched here. Students with advanced standing may
  start the calculus sequence higher up on Advanced Placement credit, which
  leaves nothing on your record to match."
- **Footnote 1** (attached to `MATH UN1101`, `MATH UN1102`, `APMA E2000` and the
  ODE cell): *"Students with advanced standing may start the calculus sequence
  at a higher level (see Advanced Placement Credit Chart, in which case students
  are suggested to add linear algebra in the first two years."* Verbatim,
  including the unclosed parenthesis. Not encodable — AP credit leaves no course
  on a record. Put it in the note, the way `seas-core` does for `ECON UN1105`.
- **Catalog:** all three ✓.
- **Trap #8 checked:** no honors calculus variant is offered on this page.
  `MATH UN1207`/`UN1208` are not named; the escape hatch for strong students is
  AP placement, per footnote 1.

### 2. `differential-equations` — "Differential Equations"

**Bulletin, Degree Track grid (Semester IV), verbatim:** "ODE[1],[4]" — the cell
carries no course code at all.

**Footnote 4, verbatim:**

> Applied mathematics majors should satisfy their ODE requirement with the
> Mathematics Department (ordinarily `MATH UN2030` ORDINARY DIFFERENTIAL
> EQUATIONS). Students who take `APMA E2101` INTRO TO APPLIED MATHEMATICS prior
> to declaring their major in applied mathematics may use this course to satisfy
> their ODE requirement with the permission of the faculty adviser.

- **Rule:** `n_of { n: 1 }` — `MATH UN2030`, `APMA E2101`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "Ordinarily MATH UN2030. APMA E2101 counts only if you took it
  before declaring the major and your faculty adviser permits it — a condition
  this audit cannot see, so it is counted here without checking it."
- **Catalog:** both ✓ (3.0 each).
- **Note the asymmetry, and record it rather than encode it.** `APMA E2101` is
  conditionally acceptable ("prior to declaring their major … with the
  permission of the faculty adviser"). The language has no conditionals. I
  recommend including it — the recoverable direction is to count a course the
  Bulletin names and let an adviser rule it out, rather than to refuse a course
  the Bulletin names.

### 3. `linear-algebra` — "Linear Algebra"

**Bulletin, Degree Track grid (Semester V), verbatim:** "`APMA E3101`[5]
APPLIED MATH I: LINEAR ALGEBRA".

**Footnote 5, first clause, verbatim:** *"`MATH UN2010` LINEAR ALGEBRA or
`COMS W3561` may be substituted for `APMA E3101` APPLIED MATH I: LINEAR
ALGEBRA"*.

- **Rule:** `n_of { n: 1 }` — `APMA E3101`, `MATH UN2010`, `COMS W3561`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "Applied Math I, or one of the two substitutes the Bulletin names.
  COMS W3561 is printed by the Bulletin but does not exist in the Bulletin's own
  course database or in our catalog, so it will not match."
- **Catalog:** `APMA E3101` 3.0 ✓, `MATH UN2010` 3.0 ✓, **`COMS W3561` MISS**.
- **`COMS W3561` is almost certainly a Bulletin typo for `COMS W3251`.** The
  Bulletin's own course endpoint returns an empty `<courseinfo/>` for
  `COMS W3561` — it is not a course *anywhere in the Bulletin*, not merely
  absent from our four-term catalog. `COMS W3251` COMPUTATIONAL LINEAR ALGEBRA
  (4.00 points) does exist, and it is offered as a linear-algebra option on both
  the Operations Research page (footnote 1) and the SEAS Computer Science page.
  Both the HTML page and the PDF chart print `W3561`, so the error is upstream
  of CourseLeaf. **Transcriber's decision, flagged rather than made:** keep
  `COMS W3561` as printed, and consider adding `COMS W3251` alongside it. Adding
  it can only turn a green light on for a student who took Computational Linear
  Algebra, which is what the department plainly means; but it is an inference,
  so it needs a comment naming it as one. Note `COMS W3251` is also **MISS** in
  our catalog (it is already kept, for this reason, in
  `seas-major-operations-research`), so nothing changes for matching today.

### 4. `partial-differential-equations` — "Partial Differential Equations"

**Bulletin (Semester VI), verbatim:** "`APMA E3102`[5] APPLIED MATHEMATICS II:
PDE'S".
**Footnote 5, second clause:** *"`MATH UN3028` PARTIAL DIFFERENTIAL EQUATIONS or
`APMA E4200` PARTIAL DIFFERENTIAL EQUATIONS may be substituted for `APMA E3102`
APPLIED MATHEMATICS II: PDE'S"*.

- **Rule:** `n_of { n: 1 }` — `APMA E3102`, `MATH UN3028`, `APMA E4200`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "Applied Math II, or either of the two PDE courses the Bulletin
  accepts in its place."
- **Catalog:** all three ✓ (3.0 each).

### 5. `complex-variables` — "Complex Variables"

**Bulletin (Semester V), verbatim:** "`APMA E4204`[5] FUNCTNS OF A COMPLEX
VARIABLE".
**Footnote 5, third clause:** *"`MATH UN3007` COMPLEX VARIABLES may be
substituted for `APMA E4204` FUNCTNS OF A COMPLEX VARIABLE"*.

- **Rule:** `n_of { n: 1 }` — `APMA E4204`, `MATH UN3007`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Catalog:** both ✓ (3.0 each).

### 6. `analysis` — "Modern Analysis"

**Bulletin (Semester VII), verbatim:** "`MATH GU4061`[5] INTRO MODERN ANALYSIS
I".
**Footnote 5, fourth clause:** *"`MATH UN2500` ANALYSIS AND OPTIMIZATION may be
substituted for `MATH GU4061` INTRO MODERN ANALYSIS I"*.

- **Rule:** `n_of { n: 1 }` — `MATH GU4061`, `MATH UN2500`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Catalog:** both ✓ (3.0 each).

> **Groups 3–6 are the single most important thing on this page.** The grid
> prints six APMA/MATH core courses as flat rows and hides four one-for-one
> substitutions in a single footnote. Transcribed as one
> `all_of [APMA E3101, APMA E3102, APMA E4204, APMA E4300, APMA E4101,
> MATH GU4061]` — which is exactly what the grid looks like — a student who took
> `MATH UN2010`, `MATH UN3028`, `MATH UN3007` and `MATH UN2500` (all Mathematics
> Department courses, all explicitly blessed) would be shown **four unmet
> requirements** and told to retake four courses. That is the MechE footnote-3
> failure, four times over on one page.

### 7. `applied-mathematics-core` — "Applied Mathematics Core"

**Bulletin, verbatim:**

> Semester V — `APMA E4300` COMPUT MATH:INTRO-NUMERCL METH
> Semester VI — `APMA E4101` APPL MATH III:DYNAMICAL SYSTMS

- **Rule:** `all_of` — `APMA E4300`, `APMA E4101`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "Numerical Methods and Dynamical Systems. These are the two core
  courses the Bulletin offers no substitute for."
- **Footnotes:** none on either cell — checked, and this is the point: the four
  neighbouring rows carry `[5]` and these two do not.
- **Catalog:** both ✓ (3.0 each).

### 8. `seminars` — "Applied Mathematics Seminar"

**Bulletin, Curriculum tab, verbatim:**

> Students are required to register for the Applied Mathematics Seminar during
> both the junior year (`APMA E4901` for 0 point) and senior year (`APMA E4903`
> for 3 or 4 points). During the junior year, the student attends the seminar
> lectures, and during the senior year, they attend the seminar lectures as well
> as tutorial problem sessions and present their research.

**Degree Track grid:** `APMA E4901` in Semester V, `APMA E4903` in Semester VII.

- **Rule:** `all_of` — `APMA E4901`, `APMA E4903`
- **sourceUrl:** `…/applied-mathematics-bs/#curriculumtextcontainer`
- **Note:** "Both seminars — the junior-year seminar for 0 points and the
  senior-year seminar for 3 or 4."
- **Catalog:** `APMA E4901` 0.0 ✓, `APMA E4903` 3.0–4.0 ✓.
- **Deliberate departure from the SEAS convention on 0-point courses.** MechE,
  BME and OR all *decline* to require their 0-point companions (`APMA E2001`,
  `ECON UN1155`), because those are recitations welded to a lecture and a record
  showing only the lecture is the normal case. `APMA E4901` is different: it is a
  standalone course a student registers for in a different year from
  `APMA E4903`, and the Curriculum tab says "required to register for … during
  both". Require it, and say in the header why this 0-point course is not like
  the others.
- **Double-major note (not encodable, worth a line in the header):** the Double
  Major page says students take both senior seminars but **not** the junior
  seminars — so `APMA E4901` is waived for that population. There is no
  double-major program in this repo and no way to express the waiver.

### 9. `probability` — "Probability (Group A)"

**Bulletin, Degree Track grid (Semester VI), verbatim:** "Course from Group A[7]".
**Footnote 7, verbatim:** *"One course from Group A (Probability) and one course
from Group B (Applied Probability/Statistics) required for graduation."*

**Group A course list, verbatim from the `sc_courselist` table:**

> `IEOR E3658` PROBABILITY FOR ENGINEERS — 3.00
> **or** `IEOR E4150` INTRO-PROBABILITY ＆ STATISTICS
> `STAT GU4203` PROBABILITY THEORY — 3.00
> `MATH GU4155` PROBABILITY THEORY — 3.00

- **Rule:** `n_of { n: 1 }` — `IEOR E3658`, `IEOR E4150`, `STAT GU4203`,
  `MATH GU4155`
- **sourceUrl:** `…#degreetracktextcontainer` (the Group A table is rendered
  inside the Degree Track tab's footnote block)
- **Note:** "One course from Group A. The Bulletin renders IEOR E4150 as an
  `or`-alternative to IEOR E3658; either satisfies this."
- **Catalog:** all four ✓ (3.0 each).
- **PDF chart disagreement, resolved.** The chart's footnote 2 writes
  "**MATH W4155**: Probability theory". `MATH W4155` returns an empty record
  from the Bulletin's own course endpoint; `MATH GU4155` returns a real one and
  is in our catalog. **Trust the HTML Bulletin page.** Record both in the
  header.

### 10. `applied-probability` — "Applied Probability / Statistics (Group B)"

**Group B course list, verbatim:**

> `IEOR E3106` STOCHASTIC SYSTEMS AND APPLICATIONS — 3.00
> `IEOR E4106` STOCHASTIC MODELS — 3.00
> `STAT GU4204` STATISTICAL INFERENCE — 3.00
> `STAT GU4207` ELEMENTARY STOCHASTIC PROCESS — 3.00
> `COMS W4771` MACHINE LEARNING — 3.00

- **Rule:** `n_of { n: 1 }` — `IEOR E3106`, `IEOR E4106`, `STAT GU4204`,
  `STAT GU4207`, `COMS W4771`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One course from Group B, taken in semester VII."
- **Catalog:** all five ✓ (`STAT GU4207` has null points in our catalog against
  the Bulletin's 3.00 — harmless for an `n_of` rule).

### 11. `physics` — "Physics"

**Bulletin, Degree Track grid, verbatim:**

> Semester I — "Choose one of the following Physics courses depending on
> sequence:" `PHYS UN1401` (Sequence 1) / `PHYS UN1601` (Sequence 2) /
> `PHYS UN2801` (Sequence 3)
> Semester II — `PHYS UN1402` (Sequence 1) / `PHYS UN1602` (Sequence 2) /
> `PHYS UN2802` (Sequence 3)
> Semester III — `PHYS UN1403` (Sequence 1)[2] / `PHYS UN2601` (Sequence 2) /
> `PHYS UN3081` (Sequence 3)[3]

- **Rule:** `sequence_choice`
  - `"Sequence 1"` — `PHYS UN1401`, `PHYS UN1402`, `PHYS UN1403`
  - `"Sequence 1, third term PHYS BC3001"` — `PHYS UN1401`, `PHYS UN1402`,
    `PHYS BC3001`
  - `"Sequence 2"` — `PHYS UN1601`, `PHYS UN1602`, `PHYS UN2601`
  - `"Sequence 3"` — `PHYS UN2801`, `PHYS UN2802`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One complete physics sequence. Sequences 1 and 2 run three terms;
  sequence 3 is Accelerated Physics and the grid gives it a laboratory rather
  than a third lecture, which is the next requirement. Transfer students who did
  not finish the physics requirement before enrolling may substitute
  PHYS BC3001 for the third term of sequence 1, and that path is encoded."
- **Footnote 2, verbatim** (on the `PHYS UN1403` cell): *"Transfer students who
  have not fulfilled the physics requirement prior to enrolling at Columbia may
  substitute this course with `PHYS BC3001` CLASSICAL WAVES - LECTURE LAB."*
  → the fourth sequence above. This is exactly MechE's footnote-3 handling:
  a per-term alternative has no home in a rule whose branches are whole course
  lists, so it becomes its own branch.
- **Footnote 3, verbatim** (on the `PHYS UN3081` cell in Semester III *and* on
  the `PHYS UN1494` cell in Semester IV): *"Or a lab course in Astronomy,
  Astrophysics, Biology, or Chemistry."* → group 12, and *Not encodable*.
- **Catalog:** all seven ✓ (`PHYS BC3001` 5.0, a Barnard course, present).
- **Trap #1:** three parallel sequences pinned to terms by number. As
  `n_of { n: 3 }` a student could satisfy this with `UN1401` + `UN1602` +
  `UN2601`, which is buildable and completes nothing. `sequence_choice`.
- **Trap #8:** sequence 2 (`UN1601`/`UN1602`/`UN2601`) and sequence 3
  (`UN2801`/`UN2802` Accelerated Physics) are the honors routes; both encoded.
- **Do not put `PHYS UN3081` in sequence 3.** It appears in the Semester III
  sequence-3 slot, but it is a laboratory and it is the sequence-3 half of group
  12. Listing it in both groups would be trap #7 inside a single file: one
  course paying for two requirements, evaluated independently, able to disagree.
  Sequence 3 is transcribed with two courses, as printed — matching how
  `seas-major-biomedical-engineering` and `seas-major-mechanical-engineering`
  each handle their own two-course sequence 3.

### 12. `physics-laboratory` — "Physics Laboratory"

**Bulletin, verbatim:**

> Semester III — `PHYS UN3081` (Sequence 3)[3] INTERMEDIATE LABORATORY WORK
> Semester IV — `PHYS UN1494` (Tracks 1 and 2)[3] INTRO TO EXPERIMENTAL PHYS-LAB

- **Rule:** `n_of { n: 1 }` — `PHYS UN1494`, `PHYS UN3081`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One physics laboratory. PHYS UN1494 goes with sequences 1 and 2 and
  PHYS UN3081 with sequence 3 — the audit does not tie the laboratory to the
  sequence you chose, so check the pairing with your adviser. A footnote also
  allows 'a lab course in Astronomy, Astrophysics, Biology, or Chemistry' in
  place of either, which names no courses and is not encoded."
- **Catalog:** `PHYS UN1494` 3.0 ✓, `PHYS UN3081` 2.0 ✓.
- **Vocabulary slip in the Bulletin, worth recording:** the Semester IV cell says
  "(**Tracks** 1 and 2)" where every other cell on the page says "Sequence".
  The Applied Physics page says "(Sequences 1 and 2)" in the same cell. Same
  thing; note it so a future reader does not go hunting for a track structure.

### 13. `chemistry-or-biology` — "Chemistry or Biology"

**Bulletin, Degree Track grid (Semesters I and II), verbatim:**

> "Choose one of the following Chemistry/Biology courses (taken Semester I or
> II):"
> `CHEM UN1403` (or higher) — GENERAL CHEMISTRY I-LECTURES
> `BIOL UN2001` — ENVIRONMENTAL BIOLOGY I
> `BIOL UN2005` (or higher) — INTRO BIO I: BIOCHEM,GEN,MOLEC

(The Semester II copy of the same cell drops the "(or higher)" from
`BIOL UN2005` and is otherwise identical. It is the same requirement printed
twice because it may be taken in either term, exactly as `ENGL CC1010` is.)

- **Rule:** `n_of { n: 1 }` — `CHEM UN1403`, `BIOL UN2001`, `EEEB UN2001`,
  `BIOL UN2005`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One lecture course in chemistry or biology, taken in semester I or
  II. The Bulletin allows 'CHEM UN1403 or higher' and 'BIOL UN2005 or higher';
  only the two named courses are matched, so a higher course will not go green
  automatically."
- **Trap #4 — the "or higher" is on two of the three options.** Recorded
  verbatim, not encoded. A `numberRange` over CHEM or BIOL would sweep in
  courses the department has not approved, and this is a checkable requirement
  worth keeping honest — the same argument
  `seas-major-mechanical-engineering` makes about "or higher" on its physics
  footnote.
- **`BIOL UN2001` vs `EEEB UN2001` — a live Bulletin ambiguity, resolved by
  including both.** The APAM pages print `BIOL UN2001` with the title
  "ENVIRONMENTAL BIOLOGY I". The SEAS Computer Science page prints
  `EEEB UN2001` for the same course and the same title. Checking the Bulletin's
  own course endpoint, **both codes exist**:
  - `BIOL UN2001` ENVIRONMENTAL BIOLOGY I — 4.00 points, empty description, no
    Core designation. **Not in our catalog.**
  - `EEEB UN2001` ENVIRONMENTAL BIOLOGY I — 3.00 points, full description,
    "CC/GS: Partial Fulfillment of Science Requirement". **In our catalog, 3.0.**

  `EEEB UN2001` is the one the registrar schedules and the one the rest of this
  repo already uses (`seas-major-mechanical-engineering`,
  `seas-major-computer-science`). `BIOL UN2001` looks like a dormant shell
  record. **Include both**: `BIOL UN2001` because it is what this page prints,
  and `EEEB UN2001` because it is what a student's transcript will say. Comment
  the decision — it is a judgement, not a transcription.
- **Catalog:** `CHEM UN1403` 4.0 ✓, `BIOL UN2005` 4.0 ✓, `EEEB UN2001` 3.0 ✓,
  **`BIOL UN2001` MISS**.

### 14. `computing` — "Introductory Computing"

**Bulletin, Degree Track grid, all four of Semesters I–IV, verbatim:**
"`ENGI E1006` (taken Semester I, II, III, or IV) — INTRO TO COMP FOR ENG/APP
SCI".

- **Rule:** `all_of` — `ENGI E1006`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "Required, with no alternative and no waiver on this page. The
  Applied Physics page carries a Python-proficiency waiver footnote on the same
  course; the Applied Mathematics page does not."
- **Footnotes: none.** Checked directly against the HTML — the Applied Physics
  page has `ENGI E1006`[2] on all four rows and this page has a bare
  `ENGI E1006`. That difference matters and belongs in the header.
- **Catalog:** ✓ 3.0.

### 15. `engineering-foundations` — "The Art of Engineering"

**Bulletin, verbatim (Semesters I and II):** "`ENGI E1102` (taken Semester I or
II) — THE ART OF ENGINEERING".

- **Rule:** `all_of` — `ENGI E1102`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note (copy `seas-major-operations-research` verbatim):** "Principles of
  Economics is also required, and is tracked on the Liberal Arts Core rather
  than repeated here."
- **Catalog:** ✓ (points are **null** in our catalog against the Bulletin's
  4.00 — a catalog defect, harmless to an `all_of`).
- Group id and label follow `seas-major-operations-research` and
  `seas-major-computer-science`, which both use `engineering-foundations` /
  "The Art of Engineering" for exactly this one-course group.

### 16. `undergraduate-research` — "Undergraduate Research"

**Bulletin, Degree Track grid (Semester VIII), verbatim:** "`APMA E3900` (With
an adviser's permission, an approved technical elective may be substituted) —
UNDERGRAD RES IN APPLIED MATH".

- **Rule:** `all_of` — `APMA E3900`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "3 points of undergraduate research in the final semester. The
  Bulletin allows an approved technical elective in its place with an adviser's
  permission, which names no course and is not checked."
- **Catalog:** ✓ 0.0–4.0 (variable credit; the chart budgets 3).
- The substitution clause goes under *Not encodable*.

### 17. `math-apma-stat-elective` — "MATH, APMA or STAT elective"

**Bulletin, Degree Track grid (Semester VIII), verbatim:** "Courses designated
MATH, APMA, or STAT". **PDF chart:** "Courses designated MATH, APMA, or STAT
(3)".

- **Rule:** `points_matching { points: 3, select: { subjects: ["MATH", "APMA",
  "STAT"], excludeGroups: [...] } }`
- **`excludeGroups` is mandatory here or the group is vacuous.** Every single
  required course in this major except `ENGI E1006`, `ENGI E1102`, the physics
  block and the chemistry/biology course is a MATH, APMA or STAT course. Without
  exclusions, a student who had taken exactly the required curriculum and not
  one extra course scores 3/3 and is told a requirement is finished that they
  have not started — the identical bug found in
  `seas-major-computer-science`'s `cs-electives` on 2026-08-24. Exclude:
  `calculus`, `differential-equations`, `linear-algebra`,
  `partial-differential-equations`, `complex-variables`, `analysis`,
  `applied-mathematics-core`, `seminars`, `probability`, `applied-probability`,
  `undergraduate-research`.
  (`probability` and `applied-probability` are in the list because
  `STAT GU4203`, `MATH GU4155`, `STAT GU4204` and `STAT GU4207` are all matched
  by this selector — the same oversight that was missed on the first pass of
  the CS fix and caught by the vacuity audit.)
- **Points, not a course count**, because `APMA E3900` and `APMA E4903` are
  variable-credit and the requirement is published as a point figure.
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "3 points of MATH, APMA or STAT coursework beyond the courses that
  already satisfy your other requirements."
- **Open risk, flagged not fixed:** the Bulletin puts **no level floor** on this
  row. Transcribed as printed, a leftover 1000-level MATH course would count.
  I recommend transcribing it as printed and saying so in the note rather than
  inventing a `numberRange` — but a transcriber who disagrees should record the
  choice as an inference. See *Open questions*.

### 18. `technical-electives` — "Technical Electives" (`attested`)

**Bulletin, Curriculum tab, verbatim:**

> Of the 27 points of elective content in the third and fourth years, at least
> 15 points of technical courses approved by the adviser must be taken. The
> remaining points of electives are intended primarily as an opportunity to
> complete the absolutely mandatory four-year, 27-point nontechnical requirement
> for the B.S. degree, but if this 27-point nontechnical requirement has been met
> already, then any type of coursework can satisfy these elective points.

**Footnote 6, verbatim:**

> Any course in science, math, or engineering at the 3000 level or above
> qualifies as a technical elective, except for required or elective courses in
> the minor in entrepreneurship and innovation which do not count as technical
> electives unless authorized by an adviser. Elective courses may be chosen from
> other departments in SEAS and Arts and Sciences, e.g., the Departments of
> Mechanical Engineering, Electrical Engineering, Mathematics, and Statistics.

**Degree Track grid** also carries "Complete Required Technical Electives
(Student's choice) (taken Semester I, II, III, or IV)" in each of the first four
semesters — the PDF chart shows this is a **single 3-point block** spanning the
first two years, not 3 points per semester, exactly as `ENGL CC1010` and
`ENGI E1006` are printed once per eligible term.

- **Rule:** `attested`
- **sourceUrl:** `…/applied-mathematics-bs/#curriculumtextcontainer`
- **Attestation note (draft):** "18 points of technical electives — 3 in the
  first two years and at least 15 of the 27 elective points in the third and
  fourth years. A technical elective is any science, math or engineering course
  at the 3000 level or above, approved by your adviser; courses in the minor in
  entrepreneurship and innovation do not count unless your adviser authorises
  them. 'Science, math, or engineering' is a category of departments rather
  than a set of subject codes, so this one is yours to confirm."
- **Why `attested` and not `points_matching`.** Footnote 6 looks encodable —
  "3000 level or above" is a `numberRange`. It is not: "any course in science,
  math, or engineering" is a prose department category, precisely the case
  `seas-major-computer-science` reasoned through for its General Technical
  Electives ("'Any SEAS department' is not a subject code — it is a dozen of
  them, and the list is given as prose department names"). Two further blockers
  specific to this page: the exclusion is defined by *membership of a minor*,
  which no course record carries, and the governing standard is "approved by the
  adviser". Follow the CS precedent.

### 19. Nothing else. The nontechnical block is `seas-core`.

The grid also prints `ENGL CC1010`, `HUMA CC1001`/`COCI CC1101`/Global Core,
`HUMA UN1121 or UN1123`, `HUMA CC1002`/`COCI CC1102`/Global Core,
`ECON UN1105`, "Nontech Electives", `PHED UN1001` and `PHED UN1002`. **Every one
is already a group on `seas-core`.** Do not repeat any of them.

---

## Which file each requirement belongs on

| Requirement | File | Why |
|---|---|---|
| Calculus, ODE, linear algebra, PDEs, complex variables, analysis, the APMA core, seminars, Groups A and B, physics, physics lab, chemistry/biology, undergraduate research, the MATH/APMA/STAT elective, technical electives | **`seas-major-applied-mathematics`** | `seas-core` delegates "math, science, computing, the major's own track" to the department file. |
| `ENGI E1006` | **`seas-major-applied-mathematics`** | Department-specific: required with no waiver here, waivable on the Applied Physics page. |
| **`ENGI E1102`** | **`seas-major-applied-mathematics`** | `seas-core`: "it is encoded on each major rather than here, because a course held in both places is evaluated twice and the two copies can disagree." All four existing SEAS majors carry it. |
| **`ECON UN1105`** | **`seas-core` only** | It is `seas-core`'s `principles-of-economics`. It appears on this grid (Semester IV) and **must not** be copied here — the 2026-08-24 de-duplication. |
| `ENGL CC1010`, Lit Hum / CC / Global Core, Art or Music Hum, List B electives, `PHED UN1001`/`UN1002` | **`seas-core`** | The shared 27-point nontechnical Core. |

---

## Point arithmetic

**The Bulletin publishes no first/second-year total for any APAM program.** The
ChemE chart prints one ("TOTAL POINTS: 17 17 17 17"); the Applied Mathematics
and Applied Physics charts print totals for the third and fourth years only.
So the reconciliation below is mine, built from the chart's own printed point
values, and it does **not** close.

**Third and fourth years** (chart totals: 15 · 15 · 16 · 15 = **61**)

| Sem | Blocks | Sum |
|---|---|---|
| V | `APMA E3101` 3 + `APMA E4204` 3 + `APMA E4300` 3 + `APMA E4901` 0 + tech 3 + nontech 3 | **15** ✓ |
| VI | `APMA E3102` 3 + `APMA E4101` 3 + Group A 3 + tech 3 + nontech 3 | **15** ✓ |
| VII | `MATH GU4061` 3 + `APMA E4903` 4 + Group B 3 + tech 3 + nontech 3 | **16** ✓ |
| VIII | `APMA E3900` 3 + MATH/APMA/STAT 3 + tech 6 + nontech 3 | **15** ✓ |

Two cross-checks inside those 61 points, both of which **do** close:

- **Elective content**: tech 3+3+3+6 = 15, nontech 3+3+3+3 = 12, total **27** —
  exactly the Curriculum tab's "27 points of elective content in the third and
  fourth years, at least 15 points of technical courses".
- **The 27-point nontechnical requirement**: `ENGL CC1010` 3 + Lit Hum/CC I 4 +
  Lit Hum/CC II 4 + Art or Music Hum 3 + `ECON UN1105` 4 = 18, plus 9 of those
  12 nontechnical elective points = **27**, leaving 3 free — which is precisely
  what the Curriculum tab says happens ("if this 27-point nontechnical
  requirement has been met already, then any type of coursework can satisfy
  these elective points").

**First and second years** (no published total; sequence 1, chart values)

| Block | Points |
|---|---|
| `MATH UN1101` 3 + `MATH UN1102` 3 + `APMA E2000` 4 + `APMA E2001` 0 + ODE 3 | 13 |
| `PHYS UN1401` 3 + `PHYS UN1402` 3 + `PHYS UN1403` 3 + `PHYS UN1494` 3 | 12 |
| `CHEM UN1403` (chart says 3) | 3 |
| `ENGL CC1010` | 3 |
| Lit Hum I 4 + Lit Hum II 4 + Art or Music Hum 3 + `ECON UN1105` 4 (+ `UN1155` 0) | 15 |
| `ENGI E1006` | 3 |
| `ENGI E1102` | 4 |
| `PHED UN1001` 1 + `PHED UN1002` 1 | 2 |
| Required technical elective, student's choice | 3 |
| **First and second years** | **58** |

**Degree total as printed: 58 + 61 = 119.** Taking the most expensive branch
everywhere (physics sequence 2 at 3.5/3.5/3.5, `BIOL UN2005` at 4 in place of
chemistry, Global Core at 4 each) it reaches about **121–122**. The published
requirement is **128**.

**Settled 2026-08-26: there is no gap to close.** The track is not supposed to
sum to 128. What settles it, all from `bulletin.columbia.edu`:

> "The general requirement for the Bachelor of Science degree is the completion
> of a **minimum of 128 academic credits** with a minimum cumulative
> grade-point average (GPA) of 2.0 (C) at the time of graduation. The program
> requirements, specified elsewhere in this bulletin, **include** the
> first-year/sophomore course requirements, the major departmental
> requirements, and technical and nontechnical elective requirements."
>
> — SEAS *Junior and Senior Programs*,
> `https://bulletin.columbia.edu/columbia-engineering/undergraduate-studies/undergraduate-programs/junior-senior-programs/`

128 is a **credit floor**, and the sentence enumerates the program requirements
as a separate list of things the degree *includes*. Nothing anywhere claims the
prescribed track equals 128. A track that lands below the floor is the expected
shape, not a transcription error — the balance is unprescribed credit the
student supplies.

Three corroborating checks, all re-verified against the Bulletin-hosted PDFs:

- **APAM really does omit the first/second-year total**, and the reason is
  visible on the chart. Its years 1–2 prescribe ~14 points a term; ChemE's
  prescribe 17, because ChemE loads three department courses (`CHEN E1000`,
  `E2100`, `E3020`) and an 11-point elective block into the same two years that
  Applied Mathematics leaves as a single 3-point technical elective. APAM omits
  the row because there is slack in it to omit.
- **ChemE's "TOTAL POINTS 17 17 17 17" is footnoted**, and the footnote reads
  "Taking the first track in each row and E1102 in Semester II." It is one
  illustrative branch, not a requirement, so its landing exactly on 68 + 60 =
  128 is a property of that branch rather than a rule APAM violates.
- **The arithmetic itself was never wrong.** Every third/fourth-year semester
  matches the chart's printed total (15 · 15 · 16 · 15 = 61, with Semester VII's
  16 assuming `APMA E4903` at 4), and both internal cross-checks — the 27
  elective points and the 27 nontechnical points — close exactly. Those closures
  are the ones that matter, because they are checks against totals the Bulletin
  actually publishes.

**Trap 6 in the BRIEF ("reconcile the arithmetic against the published total")
applies to a published *block* total, not to a school-wide credit floor.**
Applying it to 128 is what manufactured this as an anomaly. The two block
totals on this page — 27 and 27 — both reconcile.

**Repo impact: none.** `degreePoints` is a display field on `kind: "core"`
programs; `cc-core.ts` states the design directly — "`degreePoints` records the
total as a number to display; nothing audits against it." `seas-core.ts:112`
already carries `degreePoints: 128`. This file should carry no point total.

**`apam.columbia.edu` was never needed.** The chart that prints the point values
is `2026-2027_Engineering_Bulletin_Charts_APAM.pdf`, linked by a *relative* href
from the Degree Track tab and served by `bulletin.columbia.edu`, which does not
challenge automated clients. The 403 was real but irrelevant — it guarded a
secondary copy of a document the primary host already serves.

**Catalog- and chart-versus-Bulletin point mismatches found while
reconciling:**

| Course | Bulletin course record | APAM PDF chart | Our catalog |
|---|---|---|---|
| `CHEM UN1403` | 4.00 | **3** | 4.0 |
| `EEEB UN2001` | 3.00 | — | 3.0 |
| `BIOL UN2001` | 4.00 | 4 | **missing** |
| `ENGI E1102` | 4.00 | 4 | **null** |
| `PHED UN1001` | 1.00 | 1 | **0.0** |
| `STAT GU4207` | 3.00 | 3 | **null** |

---

## Not encodable

1. **"Or higher", twice.** "`CHEM UN1403` (or higher)" and "`BIOL UN2005` (or
   higher)". Trap #4: a numeric floor over CHEM or BIOL sweeps in unapproved
   courses.
2. **The open-ended laboratory substitution.** Footnote 3: *"Or a lab course in
   Astronomy, Astrophysics, Biology, or Chemistry."* Four department names, no
   courses.
3. **Advanced-standing calculus placement.** Footnote 1: *"Students with
   advanced standing may start the calculus sequence at a higher level (see
   Advanced Placement Credit Chart, in which case students are suggested to add
   linear algebra in the first two years."* AP credit leaves no course on a
   record — the same reason `seas-core` notes rather than checks the
   `ECON UN1105` AP route.
4. **The conditional ODE substitution.** Footnote 4: `APMA E2101` counts only if
   taken "prior to declaring their major in applied mathematics" and "with the
   permission of the faculty adviser". A condition on *when* a course was taken
   relative to a declaration, plus a petition.
5. **The research substitution.** "With an adviser's permission, an approved
   technical elective may be substituted" for `APMA E3900`.
6. **The technical-elective definition.** Footnote 6 in full — "any course in
   science, math, or engineering" is a department category, and "except for
   required or elective courses in the minor in entrepreneurship and innovation"
   is membership of a minor, which no course record carries.
7. **The transfer-in GPA gate.** *"Transfers into the Applied Mathematics
   program from other majors require a GPA of 3.0 or above, and the approval of
   the Applied Mathematics program committee."* Grade minima and petitions; the
   language deliberately cannot say either.
8. **The elective specializations.** The department's undergraduate index page
   publishes eight or so "Elective Specializations in APAM" course lists
   (Application of Physics, Earth and Atmospheric Sciences, Basic Physics and
   Astrophysics, Scientific Computation and Computer Science, and others). The
   page states outright: *"There is no requirement to focus electives, so
   students may take as many or as few of the recommended courses in an elective
   specialization as is appropriate to their schedules and interests."* Not
   requirements. Do not encode — the same call
   `seas-major-biomedical-engineering` made about its six concentrations. These
   lists are also the reason the CourseLeaf parser must not be trusted on
   `…/undergraduate-programs/`: it will emit a dozen requirement groups that are
   not requirements.
9. **The double major.** *"Students satisfy all requirements for both majors,
   except for the seminar requirements … must maintain a GPA at or above 3.75,
   and must graduate with at least 143 points, 15 above the regular 128-point
   requirement."* A GPA minimum, a cross-program waiver and a residency-style
   point floor.
10. **Term ordering**, as on every SEAS plan grid.

---

## Footnotes resolved (every marker on the page)

| Marker | Attached to | Resolution |
|---|---|---|
| 1 | `MATH UN1101`, `MATH UN1102`, `APMA E2000`/`E2001` (both Sem III and IV copies), and the "ODE" cell | Advanced-standing placement. → note on `calculus`; *Not encodable* #3. |
| 2 | `PHYS UN1403` (Sem III, Sequence 1) | Transfer students may substitute `PHYS BC3001`. → fourth branch of `physics`. |
| 3 | `PHYS UN3081` (Sem III, Sequence 3) **and** `PHYS UN1494` (Sem IV, "Tracks 1 and 2") | "Or a lab course in Astronomy, Astrophysics, Biology, or Chemistry." → note on `physics-laboratory`; *Not encodable* #2. |
| 4 | the "ODE" cell (with 1) | `MATH UN2030` ordinarily; `APMA E2101` conditionally. → `differential-equations`. |
| 5 | `APMA E3101`, `APMA E3102`, `APMA E4204`, `MATH GU4061` — four separate cells | Four one-for-one substitutions. → groups 3, 4, 5, 6. **The most consequential footnote on the page.** |
| 6 | "Tech Electives" (Sems V, VI, VII, VIII) | The technical-elective definition. → group 18. |
| 7 | "Course from Group A" (Sem VI) and "Course from Group B" (Sem VII) | "One course from Group A (Probability) and one course from Group B (Applied Probability/Statistics) required for graduation", plus the two course lists. → groups 9 and 10. |

No `<sup>` marker on the page is unaccounted for. `ENGI E1006`, `ENGI E1102`,
`ENGL CC1010`, `PHED UN1001`/`UN1002`, `APMA E4300`, `APMA E4101`, `APMA E4901`,
`APMA E4903` and `APMA E3900` carry none.

---

## The nine traps, one verdict each

1. **`sequence_choice` vs `n_of {n:2}`** — Applies to physics only, and it is
   the classic three-parallel-sequences shape. Encoded as `sequence_choice`
   with four branches (three sequences plus the transfer substitution).
   Chemistry here is a single course, not a sequence, so it is correctly an
   `n_of`.
2. **Delegated blocks nobody picked up** — The whole Degree Track grid was read
   cell by cell across all eight semesters and every cell is accounted for
   (see the placement table). Math ✓, physics ✓, physics lab ✓,
   chemistry-or-biology ✓, computing ✓, `ENGI E1102` ✓, the APMA major track ✓,
   Groups A and B ✓, research ✓, MATH/APMA/STAT elective ✓, technical electives
   ✓, PE and the nontechnical Core → `seas-core` ✓.
3. **Footnotes** — Seven markers, all seven resolved and attached above.
   Footnote 5 alone changes four groups from `all_of` to `n_of`.
4. **"Or higher" / open-ended substitutions** — Four instances: "or higher" on
   `CHEM UN1403` and `BIOL UN2005`; "or a lab course in Astronomy,
   Astrophysics, Biology, or Chemistry"; "an approved technical elective may be
   substituted". All recorded verbatim, none encoded.
5. **CourseLeaf eats labels** — No loss found on this page, and the page is
   positive evidence for `seas-core`. Its Semesters III and IV render the
   nontechnical choice as **three** labelled alternatives — `HUMA CC1001`,
   `COCI CC1101`, and a third row reading "Global Core (3-4)". That is the
   third alternative whose heading CourseLeaf drops on the SEAS core page.
   This is a **fourth** independent confirmation of the reasoning in the
   `seas-core` header (which cites three), and it is worth adding there. Note
   the naming is not stable across departments: the SEAS Computer Science page
   renders the same third row as "Major Cultures (3–4)".
6. **Reconcile the arithmetic** — Done and it does **not** close: 119–122
   against a published 128. See *Point arithmetic* for the four checks that rule
   out my arithmetic, the department and the chart series as the cause. Named,
   not guessed at.
7. **Duplicated requirements across files** — `ENGI E1102` here, `ECON UN1105`
   on `seas-core` only, PE on `seas-core` only. Also flagged *within* this file:
   `PHYS UN3081` must appear in `physics-laboratory` and not also in physics
   sequence 3, and `math-apma-stat-elective` must carry `excludeGroups` over
   eleven groups.
8. **Honors / accelerated sequences** — Hunted explicitly. Physics sequences 2
   and 3 (Accelerated Physics) are the honors routes, both encoded. There is no
   honors calculus route on this page — footnote 1 routes strong students
   through AP placement instead, which is why that footnote is in the
   `calculus` note. The four footnote-5 substitutions are the *lateral* version
   of the same hazard: a student on the Mathematics Department's courses rather
   than APAM's is not on an easier path, and an `all_of` would fail all four of
   their requirements at once.
9. **Courses the Bulletin names that our catalog lacks** — `BIOL UN2001` (real
   in the Bulletin, 4.00 points; absent from our catalog) and `COMS W3561`
   (**not real anywhere** — the Bulletin's own course endpoint returns an empty
   record). Keep both as printed, per the `COMS W1005` / `MATH UN3027`
   precedent, and comment the `COMS W3251` hypothesis without acting on it
   silently. Also six point-value mismatches, tabled above.

---

## Open questions

1. ~~**Why does the Applied Mathematics track total 119–122 points against a
   128-point degree?**~~ **RESOLVED 2026-08-26 — no longer an open question.**
   The premise was wrong: the track is not meant to total 128. The Bulletin's
   *Junior and Senior Programs* page states the degree requires "a **minimum of**
   128 academic credits" and lists the program requirements as a separate set of
   things the degree *includes*. A prescribed track below the floor is expected;
   the balance is the student's own elective credit. The blocker was also
   mis-scoped: `apam.columbia.edu` still 403s, but it was never needed — the PDF
   chart carrying every point value is hosted on `bulletin.columbia.edu` and
   linked by a relative href from the Degree Track tab. See *Point arithmetic*.
2. **Is `COMS W3561` a typo for `COMS W3251`?** The Bulletin prints `W3561` in
   both the HTML footnote and the PDF chart, and `W3561` exists in neither the
   Bulletin's course database nor ours. `COMS W3251` COMPUTATIONAL LINEAR
   ALGEBRA does exist and is the linear-algebra substitute on two other SEAS
   pages. I have **not** substituted it. **What would resolve it:** the
   department, or the 2025–2026 edition of the same footnote.
3. **Which of `BIOL UN2001` and `EEEB UN2001` does the department mean?** Both
   are real Bulletin records with the identical title "ENVIRONMENTAL BIOLOGY I",
   at different point values (4.00 vs 3.00) and only one — `EEEB UN2001` — has a
   description, a Core designation and a row in our catalog. The SEAS Computer
   Science page prints `EEEB UN2001` for the same requirement. Recommendation is
   to include both; the alternative (print-faithful only) leaves a student who
   took Environmental Biology I unmatched.
4. **Does the Semester VIII "Courses designated MATH, APMA, or STAT" row carry a
   level floor?** Neither the HTML grid nor the chart states one, and every
   other elective row on the page does say "3000 level or above". Transcribing
   as printed means a leftover 1000-level MATH course could satisfy a
   senior-year requirement. **What would resolve it:** the department. Until
   then, transcribe as printed and note it.
5. **No secondary source was obtainable.** `apam.columbia.edu` returns 403 to
   every client available here. The Bulletin-hosted PDF chart is the nearest
   independent check; it agrees with the HTML page on every course except
   `MATH W4155` (chart) vs `MATH GU4155` (page), where the page is right, and
   `CHEM UN1403` at 3 points (chart) vs 4.00 (Bulletin course record), where the
   course record is right. **Where they disagree, trust the HTML Bulletin
   page** — and the fact that they disagree twice is itself a reason not to lean
   on the chart for anything but arithmetic. **Update 2026-08-26:** the 403 cost
   nothing. The only thing the department site was wanted for — the point
   arithmetic — was settled from the Bulletin itself, and the PDF chart the
   department publishes is mirrored on `bulletin.columbia.edu` anyway.

---

## Proposed golden records

Written by hand from the Bulletin. None of these expectations was computed by
the evaluator.

### `apmath-math-department-track`

> **who:** "Applied mathematics major who took every footnote-5 substitution —
> the Mathematics Department's courses rather than APAM's."

**The regression record for this program, and the direct analogue of
`econ-honors-math`.** This student has satisfied linear algebra, PDEs, complex
variables and analysis with four courses the Bulletin explicitly blesses, and
holds none of `APMA E3101`, `APMA E3102`, `APMA E4204` or `MATH GU4061`. Against
a naive `all_of` transcription of the grid they fail **four** requirements at
once and are told to retake four courses they have already covered.

```
programId: "seas-major-applied-mathematics"
taken: ["MATH UN2010", "MATH UN3028", "MATH UN3007", "MATH UN2500",
        "APMA E4300", "APMA E4101", "APMA E4901"]
expect:
  linear-algebra:                  satisfied
  partial-differential-equations:  satisfied
  complex-variables:               satisfied
  analysis:                        satisfied
  applied-mathematics-core:        satisfied, completed 2
  seminars:                        in_progress, completed 1   # E4901 done, E4903 not
  math-apma-stat-elective:         unmet, completed 0
```

The last line is the second thing this record protects. All seven of this
student's courses are MATH or APMA and every one is consumed by a named group,
so `math-apma-stat-elective` must read **0 of 3** — not 3 of 3. Without
`excludeGroups`, it reads 3 of 3 and tells a student a senior-year requirement
is finished before they have taken a single extra course. That is the
`cs-electives` bug, reproduced.

### `apmath-accelerated-physics`

> **who:** "Applied mathematics major on physics sequence 3 — Accelerated
> Physics, with the intermediate laboratory instead of a third lecture."

The honors-path record, and the guard against folding `PHYS UN3081` into the
physics sequence. Sequence 3 is two courses; the laboratory is a separate
requirement; and the same course must not pay for both.

```
programId: "seas-major-applied-mathematics"
taken: ["PHYS UN2801", "PHYS UN2802", "PHYS UN3081"]
expect:
  physics:             satisfied, completed 2
  physics-laboratory:  satisfied, completed 1
```

If someone "helpfully" adds `PHYS UN3081` as a third term of sequence 3, this
record still passes but `crossCountedCourseIds` starts reporting the course as
counting toward two requirements — so pair it with an assertion that
`PHYS UN3081` is cross-counted **zero** times within this program.

### `apmath-mixed-physics-sequence`

> **who:** "Applied mathematics major who took the first term of physics
> sequence 1 and the second and third of sequence 2 — three terms of physics,
> no completed sequence."

The schedule `n_of { n: 3 }` would wrongly pass. Must read in progress: the
student has genuinely started sequence 2 (2 of 3), and finished nothing.

```
programId: "seas-major-applied-mathematics"
taken: ["PHYS UN1401", "PHYS UN1602", "PHYS UN2601"]
expect:
  physics: in_progress, completed 2      # reports sequence 2 at 2/3
```

### `apmath-transfer-physics`

> **who:** "Transfer student who finished the physics sequence at Columbia with
> the Barnard classical-waves course footnote 2 allows."

The footnote-2 record — the MechE footnote-3 failure in its Applied Mathematics
form. A complete student marked incomplete because a per-term substitution was
never picked up.

```
programId: "seas-major-applied-mathematics"
taken: ["PHYS UN1401", "PHYS UN1402", "PHYS BC3001", "PHYS UN1494"]
expect:
  physics:            satisfied, completed 3     # the BC3001 branch of sequence 1
  physics-laboratory: satisfied
```

### `apmath-no-econ-duplication` (cross-program guard)

> **who:** "Applied mathematics major audited against `seas-core` and
> `seas-major-applied-mathematics` together."

The trap-#7 guard. `ECON UN1105` must appear in exactly one group across the two
programs (`seas-core`'s `principles-of-economics`), and `ENGI E1102` in exactly
one (`seas-major-applied-mathematics`'s `engineering-foundations`).

```
taken: ["ECON UN1105", "ENGI E1102", "ENGI E1006"]
expect (seas-core):                          principles-of-economics: satisfied
expect (seas-major-applied-mathematics):     engineering-foundations: satisfied
                                             computing: satisfied
                                             # and NO principles-of-economics group here
```

---

## One defect found in an existing SEAS file

Reported here because it was found while establishing the chemistry/biology
conventions, and it is a live wrong answer rather than a style point.

**`seas-major-computer-science`, group `chemistry-or-biology`:**

```ts
rule: { kind: "n_of", n: 1, courses: ["CHEM UN1403", "EEEB UN2001", "EEEB UN2005"] },
```

`EEEB UN2005` **does not exist**. The Bulletin's own course endpoint
(`…/ribbit/index.cgi?page=getcourse.rjs&code=EEEB%20UN2005`) returns an empty
`<courseinfo/>`, and the SEAS CS Degree Track grid renders that row with an
**empty title cell** while every other row on the page has one. The course the
page means is `BIOL UN2005` INTRO BIO I: BIOCHEM,GEN,MOLEC (4.00 points) — which
is what the two APAM pages print for the identical requirement, and which **is**
in our catalog.

The CS file's header currently records this as an ordinary catalog gap: *"kept,
because a named course that never matches costs nothing"*. That is too
generous. The consequence is that a SEAS computer science student who satisfied
the chemistry/biology requirement with Introductory Biology I sees it as unmet
and is told to take general chemistry.

**Suggested fix** (outside the scope of these dossiers, not applied): add
`BIOL UN2005` to that `n_of` list, keep `EEEB UN2005` as printed, and replace
the header paragraph with the finding above. A golden record —
"SEAS CS major who satisfied the science requirement with Intro Bio I",
`taken: ["BIOL UN2005"]`, `expect: { "chemistry-or-biology": satisfied }` —
would keep it fixed.
