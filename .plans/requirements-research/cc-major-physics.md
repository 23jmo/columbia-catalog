# Physics (Columbia College)

- **Program id:** `cc-major-physics`
- **School:** CC (Columbia College) · **Kind:** `major` · **Department:** Physics
- **Degree points:** not a `core`, so `degreePoints` stays unset. The Bulletin states the major's own floor: **"a minimum of 41 points in physics courses"**, plus **"6 courses; 19 points"** of mathematics.
- **Bulletin edition:** 2026–2027
- **Primary source URL:** `https://bulletin.columbia.edu/columbia-college/departments-instruction/physics/#requirementstextcontainer`
- **Date researched:** 2026-08-26
- **Catalog resolution:** run against the live Supabase catalog on 2026-08-26 (`.env.local` present, DB reachable). **Three named codes do not resolve:** `PHYS UN3002`, `PHYS GU4011`, `MATH UN3027`. All three are kept — see *Catalog resolution* below.

## Confidence: 9 / 10

Every rubric item is met.

- Every group traced to a URL, rendered text quoted verbatim from the raw table markup.
- **Both** footnote-shaped things on the page resolved and attached: the `*` on `Laboratory Work at the Intermediate Level`, and the un-marked `<sup>` glued to the `MATH UN1205` row — the honors-mathematics substitution, which is the single most consequential sentence on the page and which the rendered text hides inside a course title.
- **Point arithmetic reconciles to the published totals exactly, twice.** 41 physics points and 19 mathematics points both come out on the nose. Shown below.
- Every code in `SUBJ NNNNN` form and checked against the catalog; three misses named.
- Honors/accelerated variants hunted on every sequence and all found (honors mathematics, accelerated physics).
- All nine traps carry a verdict.
- Everything unencodable listed rather than approximated — including the one that forces a whole group to `attested`.
- File ownership stated.
- Golden records written by hand from the Bulletin.

I could not consult the department's own site as a secondary source: `physics.columbia.edu` sits behind Cloudflare and returns HTTP 403 to both `curl` (browser user-agent) and `WebFetch`. The Bulletin is the authority anyway, and the two independent point reconciliations are stronger evidence than a departmental page would be. I have not rounded this up past 9.

---

## Requirement groups

The `Major in Physics` section has **two sub-tables** under two `<h4>` headings — `Physics Courses` and `Mathematics Courses`. Both are requirements of the major and both belong on this file. A reader who stops at the first table loses six courses and nineteen points.

All groups take the same `sourceUrl`:

```
https://bulletin.columbia.edu/columbia-college/departments-instruction/physics/#requirementstextcontainer
```

---

### 1. `introductory-sequence` — "Introductory Sequences"

**Rendered text, verbatim** (`Physics Courses` table, area header `Introductory Sequences`):

> The major in physics requires a minimum of 41 points in physics courses, including:

> Select one of the following sequences:
> *Sequence A: Students with a limited background in high school physics may elect to take:*
> PHYS UN1401 & PHYS UN1402 & PHYS UN2601 — INTRO TO MECHANICS ＆ THERMO and INTRO ELEC/MAGNETSM ＆ OPTCS and PHYSICS III:CLASS/QUANTUM WAVE
> *Sequence B:*
> PHYS UN1601 & PHYS UN1602 & PHYS UN2601 — PHYSICS I:MECHANICS/RELATIVITY and PHYSICS II: THERMO, ELEC ＆ MAG and PHYSICS III:CLASS/QUANTUM WAVE
> *Sequence C: Students with advanced preparation in both physics and mathematics may be eligible to take:*
> PHYS UN2801 & PHYS UN2802 — ACCELERATED PHYSICS I and ACCELERATED PHYSICS II

**Rule:**

```
sequence_choice
  "Sequence A"  PHYS UN1401, PHYS UN1402, PHYS UN2601
  "Sequence B"  PHYS UN1601, PHYS UN1602, PHYS UN2601
  "Sequence C"  PHYS UN2801, PHYS UN2802
```

**Trap #1, and it bites harder here than anywhere else in the repo.** `PHYS UN2601` is the third term of **both** Sequence A and Sequence B. Written as `n_of { n: 3 }` over the union, a student holding `PHYS UN1401` + `PHYS UN1602` + `PHYS UN2601` — three courses, two of them first-and-second terms of different sequences — reads as satisfied while having completed nothing. That schedule is not hypothetical; it is exactly what the department warns against in prose: *"Mixing courses across the sequences is strongly discouraged."*

**The Sequence A third term is `PHYS UN2601`, not `PHYS UN1403`. This is the single highest-value correction on the page.** The Physics department publishes *two* Sequence A tables, on two tabs of the same page:

| Tab | Sequence A | Applies to |
|---|---|---|
| Overview → `Other Important Information` → `Introductory Sequences` → *Engineering and Physical Science Majors* | `PHYS UN1401` + `UN1402` + **`UN1403`** | the general-purpose sequence, aimed at SEAS |
| **Requirements → `Major in Physics` → `Physics Courses`** | `PHYS UN1401` + `UN1402` + **`UN2601`** | **the physics major** |

The department resolves the conflict itself, in prose on the Overview tab:

> Mixing courses across the sequences is strongly discouraged; however, physics majors who begin their studies with PHYS UN1401 INTRO TO MECHANICS ＆ THERMO - PHYS UN1402 INTRO ELEC/MAGNETSM ＆ OPTCS should take PHYS UN2601 PHYSICS III:CLASS/QUANTUM WAVE as the third-semester course.

Two independent statements agree that the major's Sequence A ends in `UN2601`. `seas-major-mechanical-engineering` and `seas-major-biomedical-engineering` both encode `PHYS UN1401`/`UN1402`/**`UN1403`**, and both are right about *their* pages — this is the same "each file follows its own source" situation as `COMS W4119` vs `CSEE W4119`. **Do not copy the SEAS physics sequence into this file.**

**Laboratory verdict: no laboratory belongs to the introductory sequence.** The Overview tab's version of this table is headed *"Select one of the following sequences with accompanying laboratory course:"* — and then lists **no laboratory rows under Sequences A, B or C** (the only lab rows on that table, `PHYS UN1291` & `UN1292`, sit under the separate *Preprofessional Students* heading, attached to `PHYS UN1201`–`UN1202`). That phrase is a trap #5 candidate: a heading whose rows were eaten. It is not, and the arithmetic proves it — the 41-point reconciliation below closes exactly with no intro lab. The laboratory requirement for this major is group 4, `PHYS UN3081`/`UN3083`, at the *intermediate* level.

**Note for the student:**
> One complete introductory sequence, every term of whichever you pick. Sequences A and B run three terms and share their third course, PHYS UN2601; Sequence C runs two. If you started with PHYS UN1401–PHYS UN1402, the Bulletin says your third term is PHYS UN2601, not PHYS UN1403 — that is the engineering sequence, not the physics major's. Enrollment in Sequence C is by placement only. No laboratory course accompanies the introductory sequence for this major; the laboratory requirement is at the intermediate level.

**Footnotes:** none attached to this block.
**Catalog resolution:** all seven codes resolve.

---

### 2. `core-physics` — "Core Physics Courses"

**Verbatim:**

> **Core Physics Courses**
> PHYS UN3003 MECHANICS
> PHYS UN3007 ELECTRICITY-MAGNETISM
> PHYS UN3008 ELECTROMAGNETIC WAVES ＆ OPTICS
> PHYS GU4021 QUANTUM MECHANICS I
> PHYS GU4022 QUANTUM MECHANICS II
> PHYS GU4023 THERMAL ＆ STATISTICAL PHYSICS

**Rule:** `all_of ["PHYS UN3003", "PHYS UN3007", "PHYS UN3008", "PHYS GU4021", "PHYS GU4022", "PHYS GU4023"]` — 6 × 3 = 18 points.

**Note:** "All six. The Bulletin flags two of these as two-semester pairs that should be taken in the fall and spring of one year: PHYS UN3007–PHYS UN3008, and PHYS GU4021–PHYS GU4022. The audit has no notion of term order, so that is yours to plan."

The department's own wording, worth keeping: *"Note that there are two required two-semester sequences:, PHYSUN3007, PHYSUN3008 and PHYSGU4021, PHYSGU4022, which in general should be taken in the fall and spring of a given academic year."* They are not `sequence_choice` — there is no choice, both pairs are required, so `all_of` is right.

**Catalog resolution:** all six resolve.

---

### 3. `physics-electives` — "Elective Courses"

**Verbatim:**

> **Elective Courses**
> Select at least six points of the following courses:
> PHYS UN3002 From Quarks To the Cosmos: Applications of Modern Physics
> PHYS GU4003 ADVANCED MECHANICS
> PHYS GU4011 PARTICLE ASTROPHYS ＆ COSMOLOGY
> PHYS GU4018 SOLID STATE PHYSICS
> PHYS GU4019 MATHEMATICL METHODS OF PHYSICS
> PHYS GU4040 INTRO TO GENERAL RELATIVITY
> PHYS GU4050 Introduction to Particle Physics
> *With the permission of the Director of Undergraduate Studies, 4000- or 6000-level courses offered in this or other science departments*

**Rule (recommended):**

```
n_matching
  n: 2
  select:
    include: [ PHYS UN3002, PHYS GU4003, PHYS GU4011,
               PHYS GU4018, PHYS GU4019, PHYS GU4040, PHYS GU4050 ]
```

**Why `n_matching { n: 2 }` and not `points_matching { points: 6 }`,** even though the Bulletin's unit is points. Two reasons, and the second is decisive:

1. **They are exactly equivalent on this list.** Every one of the seven enumerated courses is worth 3 points or more (`PHYS UN3002` is 3.5; the other six are 3.0). Two of them are therefore always ≥ 6 points, and one of them is never ≥ 6. There is no student the two rules disagree about, *provided the student's electives come from the list*.
2. **`points_matching` silently zeroes the two courses our catalog is missing.** `evaluate.ts` computes `pointsFor` as `entry.points ?? facts?.points ?? 0`, and `lookup` returns `undefined` for a course we hold no row for. `PHYS UN3002` and `PHYS GU4011` are both absent from our catalog. So a student whose two electives were From Quarks To the Cosmos and Particle Astrophysics & Cosmology would be credited **0 of 6 points** under `points_matching`, and **2 of 2 courses** under `n_matching`. `include`-based selectors match by course id and do not consult the catalog at all (see `matchesCompiledSelector` — `include` is checked before `hasShape`), so `n_matching` gets this right for exactly the courses `points_matching` gets wrong.

Both kinds sit in the `flagged` tier, so nothing is lost. Golden record #4 below is built to discriminate them.

`points_matching { points: 6, select: { include: [...] } }` is the literal alternative and is recorded here so the choice is visible. If the department ever adds a 2-point course to this list, `n = 2` becomes wrong and `points_matching` becomes right; re-check on the next Bulletin edition.

**The DUS escape hatch is deliberately not encoded, and encoding it would be a bug.** *"With the permission of the Director of Undergraduate Studies, 4000- or 6000-level courses offered in this or other science departments"* is trap #4. Written as a shape — `{ numberRange: [4000, 6999] }` over PHYS, or worse over every science subject — it would immediately sweep in `PHYS GU4021`, `GU4022` and `GU4023`, which are the *required* core courses in group 2. A student who had finished the core and taken zero electives would read `2/2 DONE`. That is the `cc-major-biology` elective bug and both computer science majors' elective bug, in one line. **Keep the selector `include`-only.** The permission clause goes in the note.

**Note for the student:**
> At least six points — in practice two courses, since every course on this list carries three points or more. With the Director of Undergraduate Studies' permission, 4000- or 6000-level courses in this or another science department also count; those are not checked here, so tick them with your adviser. PHYS UN3002 and PHYS GU4011 are offered by the Bulletin but have not run in any term our catalog covers, so they will not match automatically.

The Bulletin also names `PHYS GU4003` specifically for graduate-school-bound students: *"students who will pursue graduate study are recommended to take the PHYSGU4003 Advanced Mechanics elective."* Advice, not a requirement.

**A list that differs elsewhere on the same page.** The `Minor in Physics` prose enumerates **thirteen** intermediate courses, adding `PHYS GU4012` STRING THEORY and `PHYS GU4024` Applied Quantum Mechanics to the seven here (and folding in the six core courses). That list governs the *minor*. The major's elective table has seven rows and is authoritative for the major — the two are different requirements, not a lost-label problem.

**Catalog resolution:** five of seven resolve. **`PHYS UN3002`** and **`PHYS GU4011`** do not. Both are printed by the Bulletin with full titles and point values (3.5 and 3.0), so the codes are right and the gap is ours — our catalog covers four terms (20243, 20251, 20263, 20271) and neither course ran in any of them. **Keep both.** Dropping an option the Bulletin offers tells a student who took it that it did not count.

---

### 4. `intermediate-laboratory` — "Laboratory Work at the Intermediate Level"

**Verbatim, including the footnote marker as rendered:**

> **Laboratory Work at the Intermediate Level** \*
> Select one of the following options:
> *Option 1:*
> PHYS UN3081 INTERMEDIATE LABORATORY WORK **(two semesters)**
> PHYS UN3083 ELECTRONICS LABORATORY
> *Option 2:*
> PHYS UN3081 INTERMEDIATE LABORATORY WORK **(three semesters)**

> **\*** Approved experimental work with a faculty research group may satisfy one semester of the laboratory requirement.

**Rule: `attested`.** This is not a preference; the requirement is structurally unrepresentable, for two independent reasons.

**(a) The rule language cannot say "the same course twice".** `all_of` and `n_of` take a list of distinct `BulletinCode`s, and `n_of { n: 2, courses: ["PHYS UN3081"] }` fails the repo's own invariant test (`programs.test.ts` — *"never asks for more courses than an `n_of` rule lists"*). This is the same wall `cc-major-biology`'s laboratory hit with *"Two terms of BIOL UN3500"*, and it is why that group is `attested`.

**(b) The data model cannot hold the same course twice either.** `supabase/migrations/0028_student_profile.sql` declares `student_courses` with `primary key (user_id, course_id)`. **A student can hold each course at most once, ever.** So even if the language could ask for two terms of `PHYS UN3081`, no student record could ever evidence it. Verified 2026-08-26 by reading the migration.

The obvious wrong encoding is `n_of { n: 2, courses: ["PHYS UN3081", "PHYS UN3083"] }`. It looks like Option 1 and it is not: Option 1 is **three semesters of work** (`UN3081` twice plus `UN3083`), and that rule would report a student who has done two semesters as finished. Golden record #3 exists to catch precisely that.

**(c) And the footnote makes it worse.** *"Approved experimental work with a faculty research group may satisfy one semester of the laboratory requirement."* Research with a faculty group leaves no course on a record at all — the `SURF` problem from `cc-major-biology`, exactly.

**Note (this is the `attested` rule's `note`, so it must carry the whole question):**
> One of two options. Option 1: PHYS UN3081 Intermediate Laboratory Work for two semesters, plus PHYS UN3083 Electronics Laboratory. Option 2: PHYS UN3081 for three semesters. A footnote also allows approved experimental work with a faculty research group to stand in for one semester. Neither option can be checked here — your record holds each course once, and research with a faculty group leaves no course on it at all — so this one is yours to confirm.

**Footnotes:** the page's only footnote marker. Resolved: `*` attaches to the **`Laboratory Work at the Intermediate Level` area header**, i.e. to the whole two-option block, not to either option individually. Confirmed against the raw markup (`<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Laboratory Work at the Intermediate Level</span> <sup>*</sup>`), and the matching `<dl class="sc_footnotes">` closes the `Physics Courses` table.

**Catalog resolution:** both `PHYS UN3081` (2 pt) and `PHYS UN3083` (3 pt) resolve. They are named in the note rather than in a rule, so they cost nothing.

---

### 5. `senior-seminar` — "Senior Seminar"

**Verbatim:**

> **Senior Seminar**
> PHYS UN3072 SEM IN CURRENT RES. PROBLEMS

**Rule:** `all_of ["PHYS UN3072"]` — 2 points.

Unlike the Economics seminar (which is `attested` because eligibility is published per major per year), this one is a single named course. `all_of` is exact and correct.

---

### 6. `calculus` — "Calculus"

**Verbatim** (`Mathematics Courses` table; the heading above it reads *"Required Mathematics courses (6 courses; 19 points):"*):

> MATH UN1101 CALCULUS I
> MATH UN1102 CALCULUS II
> MATH UN1205 ACCELERATED MULTIVARIABLE CALC ^*In place of the 1100 and 1200 numbered courses, students may elect instead to take MATH UN1207 and MATH UN1208. Students may place out of some of these calculus courses, depending on prior preparation.*

**Rule:**

```
sequence_choice
  "Calculus I, II and Accelerated Multivariable"  MATH UN1101, MATH UN1102, MATH UN1205
  "Honors Mathematics A and B"                    MATH UN1207, MATH UN1208
```

**This is the trap #8 group, and the Bulletin hides it.** The substitution is not printed as prose and not printed as a numbered footnote — it is a bare `<sup>` element glued to the end of the `MATH UN1205` row's **title cell**, so it renders as part of the course title. In plain text it reads:

> `MATH UN1205 | ACCELERATED MULTIVARIABLE CALC In place of the 1100 and 1200 numbered courses, students may elect instead to take MATH UN1207 and MATH UN1208.`

A transcriber skimming the rendered page sees a three-course `all_of` and a strange title. Confirmed against the raw markup (`<td>ACCELERATED MULTIVARIABLE CALC <sup>In place of the 1100 and 1200 numbered courses…</sup></td>`).

**It attaches to all three rows, not to `MATH UN1205` alone.** Its own words are *"In place of **the 1100 and 1200 numbered courses**"* — plural, and `MATH UN1101`, `UN1102` and `UN1205` are exactly the 1100- and 1200-numbered courses in the table. The honors route replaces the whole calculus block with two courses; it does not replace one course with two.

This is the `econ-honors-math` bug in a department where honors mathematics is *more* common. Encoded as `all_of ["MATH UN1101", "MATH UN1102", "MATH UN1205"]`, a student who took `MATH UN1207` + `UN1208` — the harder, complete path — is told they have finished none of their calculus, and the only way to clear it is to go back and take courses they surpassed.

**Note:**
> One complete calculus route: Calculus I, Calculus II and Accelerated Multivariable Calculus, or the two-term honors sequence MATH UN1207–MATH UN1208 in place of all three. The Bulletin also says "Students may place out of some of these calculus courses, depending on prior preparation" — which can leave a complete requirement with fewer courses on your record than this rule asks for, and no course-count rule can tell that apart from being one short.

**Catalog resolution:** all five resolve.

---

### 7. `differential-equations` — "Differential Equations"

**Verbatim:**

> APMA E2101 INTRO TO APPLIED MATHEMATICS
> **or** MATH UN2030 ORDINARY DIFFERENTIAL EQUATIONS

**Rule:** `n_of { n: 1, courses: ["APMA E2101", "MATH UN2030"] }` — 3 points either way.

**Note:** "One of the two. APMA E2101 is a Columbia Engineering course; the Bulletin offers it as a full equal to the Mathematics department's own."

---

### 8. `linear-algebra` — "Linear Algebra"

**Verbatim:**

> APMA E3101 APPLIED MATH I: LINEAR ALGEBRA
> **or** MATH UN2010 LINEAR ALGEBRA

**Rule:** `n_of { n: 1, courses: ["APMA E3101", "MATH UN2010"] }` — 3 points either way.

---

### 9. `complex-variables` — "Complex Variables"

**Verbatim:**

> APMA E4204 FUNCTNS OF A COMPLEX VARIABLE
> **or** MATH UN3007 COMPLEX VARIABLES

**Rule:** `n_of { n: 1, courses: ["APMA E4204", "MATH UN3007"] }` — 3 points either way.

**Why groups 7, 8 and 9 are three separate `n_of` groups and not one `sequence_choice`.** The Bulletin prints them as three independent `orclass` pairs, each a choice between two courses that teach the same subject. There is no coupling — a student may take `APMA E2101`, `MATH UN2010` and `APMA E4204` and be entirely correct. Collapsing them into one `n_of { n: 3 }` over all six would accept `APMA E2101` + `MATH UN2030` + `APMA E3101`, which is two differential-equations courses and no complex variables. Collapsing them into a `sequence_choice` would require enumerating 2×2×2 = 8 alternatives to express three independent binary choices, which is what `sequence_choice` is *not* for. Three groups is both the smallest and the most faithful encoding.

**Also not encoded:** *"Suggested Mathematics course: APMA E3102 APPLIED MATHEMATICS II: PDE'S."* Suggested, not required.

---

## Point arithmetic

The Bulletin publishes two figures for this major. **Both reconcile exactly.**

### Physics: *"The major in physics requires a minimum of 41 points in physics courses"*

Point values are the Bulletin's own, cross-checked against our catalog (which agrees on every one it holds).

| Block | Points |
|---|---|
| Introductory sequence — **Sequence A** (`UN1401` 3 + `UN1402` 3 + `UN2601` 3.5) | 9.5 |
| Introductory sequence — **Sequence B** (`UN1601` 3.5 + `UN1602` 3.5 + `UN2601` 3.5) | 10.5 |
| Introductory sequence — **Sequence C** (`UN2801` 4.5 + `UN2802` 4.5) | **9.0** ← minimum |
| Core physics (6 × 3.0) | 18.0 |
| Electives ("at least six points") | 6.0 |
| Laboratory — **Option 1** (`UN3081` × 2 = 4 + `UN3083` 3) | 7.0 |
| Laboratory — **Option 2** (`UN3081` × 3) | **6.0** ← minimum |
| Senior seminar (`UN3072`) | 2.0 |

Cheapest complete path = Sequence C + Option 2:

```
  9.0  Sequence C
+ 18.0  core
+  6.0  electives
+  6.0  laboratory Option 2
+  2.0  senior seminar
= 41.0  ✓  matches "a minimum of 41 points in physics courses" exactly
```

The other seven combinations run 41.5 to 43.5, all above the floor, which is what "minimum" means. **No block is missing and no block is double-counted.** Had I missed the senior seminar (2 points) the floor would have come out at 39; had I read Laboratory Option 1 as `UN3081` once plus `UN3083` (5 points) it would have come out at 40; had I dropped the elective block it would have been 35. The exact hit is a real check, not a coincidence.

*One thing the arithmetic does **not** settle:* Sequence A with `PHYS UN1403` (3 pt) would total 9.0, tying Sequence C, so the floor would still be 41. The `UN2601`-vs-`UN1403` question is settled by the requirements table and the department's prose (see group 1), not by this sum. Recorded so nobody over-claims.

### Mathematics: *"Required Mathematics courses (6 courses; 19 points)"*

| Course | Points |
|---|---|
| `MATH UN1101` Calculus I | 3 |
| `MATH UN1102` Calculus II | 3 |
| `MATH UN1205` Accelerated Multivariable Calculus | 4 |
| `APMA E2101` **or** `MATH UN2030` | 3 |
| `APMA E3101` **or** `MATH UN2010` | 3 |
| `APMA E4204` **or** `MATH UN3007` | 3 |
| **6 courses** | **19** ✓ |

Exact on both the course count and the point total, and every `or` branch is 3 points, so the total does not depend on which branch a student takes. **This is what confirms the three `orclass` pairs are three requirements and not six.**

The honors route substitutes `MATH UN1207` (4) + `MATH UN1208` (4) = 8 points for `UN1101` + `UN1102` + `UN1205` = 10 points, giving 5 courses and 17 points. The published "6 courses; 19 points" describes the standard route only — worth knowing, and not a discrepancy.

### Combined

41 physics + 19 mathematics = **60 points minimum**, of which 9–10.5 are introductory. Consistent with the department's own warning: *"In general, the Physics major may not be completed in fewer than six semesters; most students take seven or eight semesters to satisfy all requirements."*

---

## Not encodable

1. **Laboratory repetition.** *"PHYS UN3081 INTERMEDIATE LABORATORY WORK (two semesters)"* / *"(three semesters)"*. Neither `all_of` nor `n_of` can name the same course twice, and `student_courses` has `primary key (user_id, course_id)` so no record could evidence it. Forces group 4 to `attested`.

2. **Research substituting for a laboratory semester.** *"Approved experimental work with a faculty research group may satisfy one semester of the laboratory requirement."* Leaves no course on a record. Same group.

3. **The elective permission clause.** *"With the permission of the Director of Undergraduate Studies, 4000- or 6000-level courses offered in this or other science departments."* Trap #4: a `numberRange` over PHYS would swallow the required core, and over "other science departments" it would swallow half the catalog. Recorded verbatim in the group note; not encoded.

4. **Calculus placement.** *"Students may place out of some of these calculus courses, depending on prior preparation."* A complete requirement can leave fewer courses on a record than the rule names, and no course-count rule can distinguish that from being one short. Noted on group 6.

5. **The residency rule.** *"Coursework in fulfillment of a major or minor [or special program or concentration] must be taken at Columbia University unless explicitly noted here and/or expressly permitted by the Director of Undergraduate Studies of the program. Exceptions or substitutions permitted by the Director of Undergraduate Studies should be confirmed in writing by email to the student."* Residency is named in `types.ts` as outside the language.

6. **Transfer credit.** *"All transfer courses proposed for consideration for the Physics major must be reviewed by the Physics DUS. Students should provide detailed syllabi for review."* Transfer equivalencies are outside the language.

7. **Study abroad.** *"There will be a limit on the number of courses taken abroad that can be applied to the major/minor, and they must be approved by the DUS."* An unstated numeric limit across the student's record.

8. **Barnard exclusion.** *"No Barnard courses are accepted as requirements for the Physics major."* This one is *self-enforcing* here and needs no rule: every group is `all_of`, `n_of`, `sequence_choice`, or an `include`-only `n_matching`, and no `PHYS ... BC` code appears in any of them. Worth a sentence in the file header so nobody later "improves" a group into a `{ subjects: ["PHYS"] }` shape, which would immediately start accepting Barnard's `PHYS BC` courses. (The Astrophysics major on the Astronomy page *does* accept `PHYS BC3006` — see *Scoped out*.)

9. **Advanced Placement.** *"The department grants 3 credits for a score of 4 or 5 on the AP Physics C/MECH exam, **but you are not entitled to any exemptions**. The amount of credit is reduced to 0 if you take PHYSUN 1001, 1201, 1401 or 1601."* and *"Students may earn a maximum of 6 credits in Physics."* Note the direction: unlike Chemistry, physics AP credit exempts **nothing**, so no requirement here can be satisfied without a course on the record. That is convenient — it means no group needs an "AP may have satisfied this" caveat. Record it so nobody adds one.

10. **Sequence C eligibility.** *"Enrollment in the PHYSUN2801, PHYSUN2802 Accelerated Physics sequence is by placement only. Students who have a score of 5 on AP Calculus BC and a score of at least one 4 and one 5 on the two AP Physics C exams place automatically."* Exam scores are not on a course record.

11. **Term ordering.** *"…two required two-semester sequences … which in general should be taken in the fall and spring of a given academic year"*, and *"all of the above sequences start in the fall semester (only) each year"*. The audit has no notion of term order.

12. **Summer courses.** *"No physics courses currently offered in Summer Term are relevant for the Department's majors."* Informational.

---

## Which file each requirement belongs on

**All nine groups belong on `cc-major-physics`.** Nothing is delegated, nothing is duplicated, and there is no seam of the `seas-core` kind.

- **`cc-core` carries none of this.** The Physics page's `Required Coursework for all Programs` section says only *"All programs of study require completion of at least one of the introductory physics sequences (described below)"* — the sequence is on this page, not delegated. Mathematics is on this page too, under its own `<h4>`. I read the whole requirements container, both sub-tables, not just the first one.
- **`APMA E2101`, `APMA E3101` and `APMA E4204` belong here, on a Columbia College program.** They are Engineering courses required of a College major. That is not a school mismatch and it does not pull `seas-core` into anything — `programsFor` in `lib/profile/audit.ts` picks the core by the *student's* school, not by a course's subject code.
- **Expected cross-counting into `cc-core`, not duplication.** `PHYS UN1401`, `UN1402`, `UN1601`, `UN1602` and `UN2801` carry `scienceB` + `scienceC` + `scienceRequirement` in our catalog (verified 2026-08-26), so a physics major's introductory sequence will also match `cc-core`'s `science-b` and `science` groups. `crossCountedCourseIds` surfaces that and the UI says "confirm with your adviser". **`PHYS UN2601` and `PHYS UN2802` carry no flags at all** — so a Sequence B student gets two flagged courses out of three and a Sequence C student gets one out of two. Nothing to fix; it is the flag data, not the transcription.
- **No `ECON UN1105`-style duplication risk exists**, because no course on this page appears on `cc-core`.

---

## Open questions

1. **Does the department mean `PHYS UN3081` × 2 or × 3 for Option 1?** The row reads *"PHYS UN3081 INTERMEDIATE LABORATORY WORK (two semesters)"*, so Option 1 is 2 + 1 = 3 semesters of laboratory and Option 2 is 3 semesters — the same amount of work, differently distributed. That reading is what makes the 41-point floor come out exactly (Option 2 = 6 points is the cheaper of the two), so I am confident in it. But the group is `attested` either way, so nothing downstream depends on it. **What would resolve it:** the DUS (Dr. Jeremy Dodd), or a course-planning sheet.

2. **Is the Overview tab's *"Select one of the following sequences with accompanying laboratory course:"* a dropped-rows bug?** The rows are missing under Sequences A/B/C on that table. It does not affect this major — the requirements table has no such phrase and the arithmetic closes without an intro lab — but if the department later restores those rows they would be a new requirement. **What would resolve it:** comparing against the 2025–2026 archived Bulletin edition, or the DUS. Worth re-checking at the next edition.

3. **Should `physics-electives` be `n_matching { n: 2 }` or `points_matching { points: 6 }`?** This dossier recommends `n_matching` and gives the reasoning above; golden record #4 discriminates them. The recommendation depends on every listed course being ≥ 3 points, which is true today. **What would resolve it permanently:** a points predicate on `CourseSelector` — which does not exist and is out of scope for a transcription.

---

## The nine traps, one line each

1. **`sequence_choice` vs `n_of { n: 2 }`** — Two groups are `sequence_choice`. `introductory-sequence` is the worst case in the repo, because `PHYS UN2601` is shared between Sequences A and B, so a flattened `n_of { n: 3 }` passes a student who completed neither; `calculus` is three courses versus two and a flattened rule would fail or falsely pass the honors student. Golden records #2 and #1 pin both.
2. **Delegated blocks** — None. `Required Coursework for all Programs` delegates nothing; the mathematics block is a second `<h4>` under `Major in Physics` on the same page and is transcribed. I read the whole requirements container.
3. **Footnotes** — The page carries exactly **one** `sc_footnotes` marker (`*`), and it attaches to the `Laboratory Work at the Intermediate Level` **area header**, meaning the whole two-option block: *"Approved experimental work with a faculty research group may satisfy one semester of the laboratory requirement."* Resolved and attached. A **second, unmarked** `<sup>` — the honors-mathematics substitution — is glued into the `MATH UN1205` title cell and is resolved in group 6. Both were found by reading the raw markup; the second is invisible in rendered text.
4. **"Or higher" / open-ended substitutions** — One: *"With the permission of the Director of Undergraduate Studies, 4000- or 6000-level courses offered in this or other science departments"*. Recorded verbatim, **not** encoded — a numeric floor over PHYS would sweep in the required core courses and make the elective block vacuous.
5. **CourseLeaf eating labels** — One suspect, on the **Overview** tab: *"Select one of the following sequences with accompanying laboratory course:"* with no lab rows beneath the sequences. Investigated and dismissed for this major, because the arithmetic reconciles exactly with no introductory laboratory. The requirements-tab tables are clean: every area header has its rows, and both published totals land on the nose.
6. **Reconcile the arithmetic** — Done, twice, both exact. 41 physics points (Sequence C + Laboratory Option 2) and 19 mathematics points across 6 courses. Shown in full above.
7. **Duplicated requirements across files** — None. All nine groups on `cc-major-physics`; `cc-core` carries nothing from this page and no course here appears on it. The Science-requirement overlap is flag-driven cross-counting, which the engine reports rather than duplicates.
8. **Honors / accelerated sequences** — Hunted on every sequence. **`calculus`**: the honors route (`MATH UN1207`–`UN1208`) is hidden in a `<sup>` and is encoded. **`introductory-sequence`**: Sequence C (`PHYS UN2801`–`UN2802`) is the accelerated route and is encoded. The three math `orclass` pairs have no honors variant. The elective and core blocks have no accelerated variant. Nothing found was left out.
9. **Courses the Bulletin names that our catalog lacks** — Three, all kept: **`PHYS UN3002`** From Quarks To the Cosmos (3.5 pt, on the elective list), **`PHYS GU4011`** Particle Astrophysics ＆ Cosmology (3 pt, on the elective list), and **`MATH UN3027`** Ordinary Differential Equations — the last of which is *not* on this page at all and must **not** be pulled in: the Physics major's differential-equations choice is `APMA E2101` **or** `MATH UN2030`. `MATH UN3027` appears on the *Chemistry* page (Chemical Physics and Biochemistry) and in `seas-major-mechanical-engineering`'s footnote 6, which already documents it as absent from our catalog. Named here so the next reader does not "helpfully" add it to group 7.

---

## Scoped out, with URLs

**There is no professional track, no intensive track and no astrophysics variant of the Physics major.** The `Major in Physics` heading on the Physics page describes exactly one program, with one `Physics Courses` table and one `Mathematics Courses` table. What exists instead is a family of *neighbouring* majors, three of which the Physics page explicitly hands off to other departments:

| Program | Status | URL |
|---|---|---|
| **Major in Astrophysics** | The Physics page says only *"For astrophysics requirements please see:"* and links out. It is a genuinely different program on the **Astronomy** department page: it requires `ASTR UN2001`–`ASTR UN2002` plus 6 points of astronomy at 3000+, a calculus sequence "through `MATH UN1202` or `MATH UN1208`", a physics sequence whose Sequence 1 third term is **`PHYS UN1403`** (not `UN2601`), and a final choice of `PHYS GU4021` & `GU4022` **or** `PHYS BC3006` & `PHYS GU4023` — note the **Barnard** course, which the Physics major forbids outright. Would be `cc-major-astrophysics`. | `https://bulletin.columbia.edu/columbia-college/departments-instruction/astronomy/#requirementstextcontainer` |
| **Major in Biophysics** | Handed off to Biological Sciences. Would be `cc-major-biophysics`. | `https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/#requirementstextcontainer` |
| **Major in Chemical Physics** | Handed off to Chemistry. Shares this page's `PHYS UN3003`/`UN3007`/`UN3008` but is built on the Chemistry department's tracks and physics sequences, and requires a physics laboratory the chemistry major only recommends. Would be `cc-major-chemical-physics`. See the `cc-major-chemistry` dossier. | `https://bulletin.columbia.edu/columbia-college/departments-instruction/chemistry/#requirementstextcontainer` |
| **Minor in Physics** | On this page, published as **prose with embedded course descriptions rather than as `sc_courselist` tables** — the parser returns nothing for it. Two components: one introductory sequence (with per-sequence point totals the major's table does not print: A = 9.5 pt, B = 10.5 pt, C = 9 pt — these are what let me verify the 41-point reconciliation) plus any three of thirteen named intermediate courses. Would be `cc-minor-physics`. | same page |
| **Concentration in Physics** | *"Concentrations are not available to students who entered Columbia in or after Fall 2024."* Legacy: *"The concentration in physics requires a minimum of 24 points in physics, including one of the introductory sequences."* | same page |
| **Applied Physics (B.S.)** | A **SEAS** degree in Applied Physics and Applied Mathematics, not a College major. Different school, different core. | `https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/applied-physics-applied-mathematics/` |
| **GS Physics** | A different school's page; `School` would be `"GS"`. | `https://bulletin.columbia.edu/general-studies/majors-concentrations/` |

---

## Proposed golden records

Written by hand from the Bulletin. Outcomes stated by reasoning about the rules, not by running the evaluator.

### 1. `physics-honors-math`

**Who:** Physics major on the honors mathematics track — `MATH UN1207` + `UN1208` instead of Calculus I/II/Accelerated Multivariable.

**Why it matters:** the trap #8 regression record, and the direct descendant of `econ-honors-math`. The substitution that permits this route is a bare `<sup>` welded into the `MATH UN1205` title cell; a transcriber reading the rendered page sees a three-course `all_of` and writes one. This student would then be told they had completed **none** of their calculus and needed to go back and take three courses they had surpassed. They are also the least likely student to doubt the app.

```
programId: cc-major-physics
taken: MATH UN1207, MATH UN1208,
       APMA E2101, APMA E3101, APMA E4204,
       PHYS UN1601, PHYS UN1602, PHYS UN2601
expect:
  calculus:               satisfied, completed 2
  differential-equations: satisfied, completed 1
  linear-algebra:         satisfied, completed 1
  complex-variables:      satisfied, completed 1
  introductory-sequence:  satisfied, completed 3
  core-physics:           unmet, completed 0
verified: 2026-08-26
```

*By hand:* the honors alternative is exactly `MATH UN1207` + `UN1208`; both held; 2 of 2. Each of the three `or` pairs has one of its two courses held; 1 of 1 each. Sequence B is `UN1601` + `UN1602` + `UN2601`; all three held; 3 of 3.

### 2. `physics-mixed-intro-sequence`

**Who:** Student who took `PHYS UN1401`, then `PHYS UN1602`, then `PHYS UN2601`. Three terms of introductory physics; no completed sequence.

**Why it matters:** the trap #1 record, and the reason `PHYS UN2601` makes this the sharpest case in the repo. `UN2601` is the third term of **both** Sequence A and Sequence B, so a student who switched tracks after their first term lands on a shared endpoint and *looks* finished. `n_of { n: 3 }` over the union would report satisfied. The department's own prose calls this out: *"Mixing courses across the sequences is strongly discouraged."*

```
programId: cc-major-physics
taken: PHYS UN1401, PHYS UN1602, PHYS UN2601
expect:
  introductory-sequence: in_progress, completed 2
verified: 2026-08-26
```

*By hand:* the evaluator scores every alternative by fraction and reports the best. Sequence A holds `UN1401` and `UN2601` → 2/3. Sequence B holds `UN1602` and `UN2601` → 2/3. Sequence C holds neither → 0/2. The tie resolves to Sequence A (the reduce keeps the incumbent on `b.progress > a.progress`), but `completed` is 2 and `required` is 3 under either, so the assertion holds regardless of the tie-break. **In progress, and specifically not satisfied.**

### 3. `physics-laboratory-two-semesters` *(edge case: a requirement the data model cannot evidence)*

**Who:** Senior who has finished the entire major on paper — accelerated sequence, full core, two electives, senior seminar, all six mathematics courses — and who has done `PHYS UN3081` once and `PHYS UN3083` once. Two semesters of laboratory out of the three that Option 1 requires.

**Why it matters:** this is the record that catches the tempting wrong encoding `n_of { n: 2, courses: ["PHYS UN3081", "PHYS UN3083"] }`, which looks exactly like Option 1 and reports this student's laboratory **finished a semester early**. It also pins the two structural facts that force the group to `attested`: the rule language cannot ask for the same course twice, and `student_courses`' `primary key (user_id, course_id)` means a record could not show it even if it could. The laboratory group must read **unmet** until the student ticks it — under-counting, which sends someone to their adviser, rather than over-counting, which sends them to the registrar after add/drop.

```
programId: cc-major-physics
taken: PHYS UN2801, PHYS UN2802,
       PHYS UN3003, PHYS UN3007, PHYS UN3008,
       PHYS GU4021, PHYS GU4022, PHYS GU4023,
       PHYS GU4018, PHYS GU4040,
       PHYS UN3072,
       PHYS UN3081, PHYS UN3083,
       MATH UN1101, MATH UN1102, MATH UN1205,
       MATH UN2030, MATH UN2010, MATH UN3007
expect:
  introductory-sequence:  satisfied, completed 2
  core-physics:           satisfied, completed 6
  physics-electives:      satisfied, completed 2
  senior-seminar:         satisfied, completed 1
  calculus:               satisfied, completed 3
  differential-equations: satisfied, completed 1
  linear-algebra:         satisfied, completed 1
  complex-variables:      satisfied, completed 1
  intermediate-laboratory: unmet, completed 0
expectSatisfiedCount: 8
verified: 2026-08-26
```

*By hand:* eight of nine groups green. `intermediate-laboratory` is `attested` and no attestation is supplied, so it is unmet with `completed: 0` — regardless of the two laboratory courses on the record. Note this record also exercises the all-`MATH` branch of groups 7–9 (`UN2030`, `UN2010`, `UN3007`), which record #1 exercises on the all-`APMA` side.

### 4. `physics-electives-not-in-catalog` *(edge case: courses this catalog has never heard of)*

**Who:** Student whose two physics electives are `PHYS UN3002` From Quarks To the Cosmos and `PHYS GU4011` Particle Astrophysics ＆ Cosmology — both named by the Bulletin, both absent from our catalog.

**Why it matters:** this record discriminates the two candidate encodings of group 3 and nothing else does. Under the recommended `n_matching { n: 2 }` with an `include` list, both courses match by course id and the requirement is **satisfied**. Under `points_matching { points: 6 }`, `lookup` returns `undefined` for both, `pointsFor` falls through to `0`, and the same student is credited **0 of 6 points** — told that two completed courses counted for nothing. It is the same class of failure as `transfer-unknown-courses` in the existing golden set, but pointed at a requirement rather than at the Core.

```
programId: cc-major-physics
taken: PHYS UN1601, PHYS UN1602, PHYS UN2601,
       PHYS UN3002, PHYS GU4011
expect:
  introductory-sequence: satisfied, completed 3
  physics-electives:     satisfied, completed 2
  core-physics:          unmet, completed 0
verified: 2026-08-26
```

*By hand:* `matchesCompiledSelector` checks `exclude`, then `include`, then `hasShape` — an `include` hit returns `true` before the catalog is consulted at all, so a course we hold no row for still matches. Two of two. If this record is ever changed to expect `in_progress`, that is a sign someone switched the rule to `points_matching`; the fix is the rule, not the expectation.
