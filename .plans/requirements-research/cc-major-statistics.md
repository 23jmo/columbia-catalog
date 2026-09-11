# Statistics (Columbia College)

- **Program id:** `cc-major-statistics`
- **School:** CC (Columbia College) · **Kind:** `major` · **Department:** Statistics
- **Degree points:** not applicable. The Statistics department counts this major in
  **courses, not points**: "The major requires **14 courses**". Every `hourscol` cell in
  its table is empty. `degreePoints` is only meaningful on `kind: "core"` anyway.
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/#requirementstextcontainer`
- **Secondary source (Overview tab, same page, different anchor):**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/`
- **Corroborating source used to settle a contradiction (§3):** the archived
  2025–2026 edition of the same page,
  `http://web.archive.org/web/20250803113957/https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/`
- **Date researched:** 2026-08-26
- **Confidence:** **9/10** — see §7.

---

## 0. Which program this dossier transcribes, and which it does not

The Statistics department publishes **seven** programs of study on one Requirements
tab. This dossier transcribes exactly one: the plain **"Major in Statistics"**.

| Programme | Heading | Published size | Suggested id | Status |
|---|---|---|---|---|
| **Major in Statistics** | `Major in Statistics` | 14 courses | `cc-major-statistics` | **THIS DOSSIER** |
| Major in Data Science | `Major in Data Science` | 18 courses | `cc-major-data-science` | out of scope — jointly owned with Computer Science |
| Major in Economics-Statistics | `Major in Economics-Statistics` | 18 courses | `cc-major-economics-statistics` | out of scope — its Economics half is governed by "Requirements for all Economics Majors, Concentrators, and Interdepartmental Majors" on the Economics page |
| Major in Mathematics-Statistics | `Major in Mathematics-Statistics` | 14 courses here / 38–43 points on the Mathematics page | `cc-major-mathematics-statistics` | out of scope — **the two pages disagree on units, see §6.5** |
| Major in Political Science–Statistics | `Major in Political Science–Statistics` | ≥6 POLS courses + 7–8 statistics/mathematics courses | `cc-major-political-science-statistics` | out of scope |
| Minor in Statistics | `Minor in Statistics` | 5 courses, two tracks | `cc-minor-statistics` | out of scope |
| **Concentration in Statistics** | `Concentration in Statistics` | 6 courses | `cc-concentration-statistics` | out of scope — **legacy, see below** |

All at the same URL. The Economics-Statistics major's economics half lives at
`https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/`.

**Major, not concentration.** This dossier transcribes the **major**. The
Concentration in Statistics sits under its own `<h2>`, and the Statistics page — unlike
the Mathematics page — spells the gate out in prose:

> **For students who entered Columbia in or before the 2023-24 academic year**
>
> Concentrations are available to students who entered Columbia in or before the 2023-2024 academic year. The requirements for the Bachelor of Arts degree, and the role of the concentration in those requirements, can be found in the Academic Requirements section of the Bulletin dated the academic year when the student matriculated at Columbia and the Bulletin dated the academic year when the student was a sophomore and declared programs of study.
>
> **Concentrations are not available to students who entered Columbia in or after Fall 2024.**
>
> ### Concentration in Statistics
> The concentration requires 6 courses in statistics, as follows.
> Courses taken for a grade of Pass/D/Fail, or in which the grade of D has been received, do not count towards the concentration.
> STAT UN1101 · STAT UN2102 · STAT UN2103 · STAT UN2104 · STAT UN3105 · STAT UN3106
> (Students may replace courses nominally required for the concentration by approved Statistics Department courses.)

Two things worth carrying forward if anyone encodes it: it is the *applied* sequence,
not the major's theoretical one, and its last line — "Students may replace courses
nominally required for the concentration by approved Statistics Department courses" —
makes every row of it optional, which no `all_of` can express.

---

## 1. Requirement groups

All groups belong on **one new file,
`lib/requirements/programs/cc-major-statistics.ts`**. Nothing belongs on `cc-core.ts`,
which names no MATH, STAT or COMS course in any rule. No SEAS-style delegation exists
here: this is a Columbia College department page and it states its outside coursework
(mathematics, computer science) in its own table rather than delegating it.

`sourceUrl` for **every** group below:
`https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/#requirementstextcontainer`

Preamble text, verbatim:

> **Major in Statistics**
>
> The major should be planned with the director of undergraduate studies. Courses taken for a grade of Pass/D/Fail, or in which the grade of D has been received, do not count toward the major. The major requires 14 courses, as follows:

**The whole table has zero footnote markers.** There is not a single `<sup>` element
anywhere in the Statistics Requirements tab. What look like footnotes are two plain
`<li>` bullets in a `<ul>` immediately after the table and before the
`Major in Data Science` heading; both belong to this major and both are transcribed
below.

---

### 1.1 `mathematics-prerequisite` — "Mathematics Prerequisite"

**Bulletin's exact rendered text** — an area header followed by four course rows:

> Mathematics Prerequisites (four courses)
>
> | MATH UN1101 | CALCULUS I |
> | MATH UN1102 | CALCULUS II |
> | MATH UN1201 | CALCULUS III |
> | MATH UN2010 | LINEAR ALGEBRA |

and, as the first of the two bullets under the table:

> The mathematics prerequisite can also be satisfied by taking the Honors Mathematics A and B sequence, MATH UN1207 and MATH UN1208.

**Proposed rule kind:** `sequence_choice`. **Not `all_of` over the four**, and **not
`n_of`**.

This is the trap-#8 shape and it is live on this page. The bullet is not a footnote,
carries no marker, and sits *below* a four-row `all_of`-looking block — which is
exactly how a transcriber loses it. Encoded as `all_of` over the four MATH courses, a
student who took Honors Mathematics A and B reads **0 of 4** on the single largest
block of the major, and the only way to clear it is to go back and take four courses
they have surpassed.

Note also that the honors bullet says "the mathematics **prerequisite**" — singular,
naming the whole four-course block, not just its calculus part. Two independent
confirmations that this is the right reading, both from tables the same department
publishes on the same page: the **Economics-Statistics** major prints
`MATH UN1207 & MATH UN1208` as a complete two-course alternative to a four-course
sequence, and the **Mathematics-Statistics** major prints
`MATH UN1207 & MATH UN1208 & MATH UN2500` — Honors A/B standing in for Calculus I–III
*and* Linear Algebra, with only the analysis course added. The Mathematics department's
own page says why: "The third sequence, Honors Mathematics A/B … covers multivariable
calculus (MATH UN1201 CALCULUS III - MATH UN1202 CALCULUS IV) and linear algebra
(MATH UN2010 LINEAR ALGEBRA), with an emphasis on theory."

**Recommended alternatives:**

| # | label | courses | source |
|---|---|---|---|
| 1 | `Calculus I–III and Linear Algebra` | `MATH UN1101`, `MATH UN1102`, `MATH UN1201`, `MATH UN2010` | the table, verbatim |
| 2 | `Honors Mathematics A and B` | `MATH UN1207`, `MATH UN1208` | the bullet, verbatim |

**Two further routes that the Bulletin does *not* print here, and are therefore not
encoded** — recorded because their absence is conspicuous and because the brief asks
for every route to be enumerated:

- **`MATH UN1205` Accelerated Multivariable Calculus.** The Statistics department
  accepts it in **three of its four other majors** — Data Science prints
  `MATH UN1201 or MATH UN1205`, Economics-Statistics prints a `…UN1205 & UN2010`
  sequence, Mathematics-Statistics prints one too — and the Mathematics department
  accepts it in every one of its own programs. It is **absent from the Statistics
  major's table and from both bullets.** This dossier transcribes what is printed. See
  §6.1: this is the program's single most important open question.
- **Advanced-Placement-truncated calculus.** The Mathematics page grants 3 points for
  AB 4/5 or BC 4 and 6 points for BC 5, and tells a BC-5 student they "may begin with
  Calculus III and do not need to take Calculus II". The Statistics page is silent, and
  unlike the Mathematics major's own table it prints no "including Advanced Placement
  Credit" licence. Not encoded here. See §6.2.

**Note the student needs to see** (repo voice):

> One complete sequence, every term of whichever you pick. The Bulletin prints the
> four-course calculus and linear algebra route and, in a bullet under the table,
> accepts Honors Mathematics A and B instead. It does **not** name Accelerated
> Multivariable Calculus (MATH UN1205) for this major, although the department accepts
> it for Data Science, Economics-Statistics and Mathematics-Statistics — if you took
> it, ask the Director of Undergraduate Studies before you count it. If Advanced
> Placement credit covered Calculus I or II for you, this group will read short; that
> is us being cautious, not the department saying no.

**Footnotes resolved:** none exist on this page.

**Catalog resolution:** all six codes resolve.

| Bulletin code | catalog `course_id` | points | title |
|---|---|---|---|
| `MATH UN1101` | `MATH1101UN` | 3 | CALCULUS I |
| `MATH UN1102` | `MATH1102UN` | 3 | CALCULUS II |
| `MATH UN1201` | `MATH1201UN` | 3 | CALCULUS III |
| `MATH UN2010` | `MATH2010UN` | 3 | LINEAR ALGEBRA |
| `MATH UN1207` | `MATH1207UN` | 4 | HONORS MATHEMATICS A |
| `MATH UN1208` | `MATH1208UN` | 4 | HONORS MATHEMATICS B |

Zero unmatched.

---

### 1.2 `computing` — "Computer Science Requirement"

**Bulletin's exact rendered text** (the typo is the Bulletin's, kept verbatim; the
2025–2026 edition read "Choose"):

> Computer Science Requirement (one course). Chose one of the following
>
> | COMS W1004 | PROGRAMMING IN JAVA |
> | ENGI E1006 | INTRO TO COMP FOR ENG/APP SCI |
> | STAT UN2102 | Applied Statistical Computing |

**Proposed rule kind:** `n_of { n: 1 }` over
`["COMS W1004", "ENGI E1006", "STAT UN2102"]`.

**This answers the question the brief posed directly: the computing list is an explicit
closed list of three named courses, so it is `n_of` and `exact`, not `attested`.** No
"or an advanced computer science offering in programming" escape hatch appears here —
that phrase *does* appear in the Mathematics-Statistics and Economics-Statistics
tables on the same page, and it is what would have forced `attested`. It is absent
from this major. Likewise `COMS W1005` and `COMS W1007`, which the department offers
as computing options in three of its other majors, are **not** listed here.

**Note:** "One. Applied Statistical Computing counts as the computing course; if you use it here it is not also one of the electives."

**Catalog resolution:**

| Bulletin code | catalog `course_id` | points | catalog title |
|---|---|---|---|
| `COMS W1004` | `COMS1004W` | 3 | INTRO-COMPUT SCI/PROG IN JAVA (Bulletin prints "PROGRAMMING IN JAVA"; same course) |
| `ENGI E1006` | `ENGI1006E` | 3 | INTRO TO COMP FOR ENG/APP SCI |
| `STAT UN2102` | `STAT2102UN` | 3 | Applied Statistical Computing |

Zero unmatched.

---

### 1.3 `statistics-prerequisite` — "Statistics Prerequisite"

**Bulletin's exact rendered text:**

> Statistics prerequisite (one course)
>
> | STAT UN1201 | CALC-BASED INTRO TO STATISTICS |

**Proposed rule kind:** `all_of` over `["STAT UN1201"]`. One course, named, no
alternative offered anywhere on the page. Checked against trap #4: the department does
*not* say "or a higher level course" here — that phrasing belongs to the Economics
department, and reusing it would be inventing a substitution. The Statistics
Overview tab in fact closes the door in the other direction:

> Students pursuing a major that requires STAT UN1201 should plan to take that course at Columbia, even if they scored a 5 on the AP statistics exam. **AP credit cannot be used to satisfy a requirement for STAT UN1201.**

**Note:** "Calculus-Based Introduction to Statistics, taken at Columbia. A 5 on the AP Statistics exam does not exempt you — the department says so explicitly. Take it before Probability Theory."

**Catalog resolution:** `STAT UN1201` → `STAT1201UN`, 3 points, CALC-BASED INTRO TO
STATISTICS. Resolves.

---

### 1.4 `statistics-core` — "Core Courses in Probability and Statistics"

**Bulletin's exact rendered text:**

> Core courses in probability and statistics (five courses):
>
> | STAT GU4203 | PROBABILITY THEORY |
> | STAT GU4204 | STATISTICAL INFERENCE |
> | STAT GU4205 | LINEAR REGRESSION MODELS |
> | STAT GU4206 | PROGRAMMING FOR DATA SCIENCE |
> | STAT GU4207 | ELEMENTARY STOCHASTIC PROCESS |

**Proposed rule kind:** `all_of` over all five. The header says "five courses" and five
rows follow with no `or` row and no comment row — this is the least ambiguous block on
the page.

**Note:** "All five. The Bulletin advises taking STAT UN1201, GU4203, GU4204 and GU4205 in sequence, and GU4206 → GU4241 → GU4242 in sequence; courses in stochastic analysis should follow GU4203."

**Catalog resolution:** all five resolve.

| Bulletin code | catalog `course_id` | points | catalog title |
|---|---|---|---|
| `STAT GU4203` | `STAT4203GU` | 3 | PROBABILITY THEORY |
| `STAT GU4204` | `STAT4204GU` | 3 | STATISTICAL INFERENCE |
| `STAT GU4205` | `STAT4205GU` | 3 | LINEAR REGRESSION MODELS |
| `STAT GU4206` | `STAT4206GU` | 3 | STAT COMP & INTRO DATA SCIENCE — the 2026–27 page renames it "PROGRAMMING FOR DATA SCIENCE"; the 2025–26 page used the catalog's title. Same code, same course. |
| `STAT GU4207` | `STAT4207GU` | (null in catalog) | ELEMENTARY STOCHASTIC PROCESS |

Zero unmatched. `STAT GU4207` carries no points in our catalog rows, which does not
matter here — this group counts courses, not points — but would matter if anyone tried
to rewrite the major in points.

---

### 1.5 The elective block — and the contradiction inside it

**Bulletin's exact rendered text — all three rows, verbatim, in page order:**

> Electives (three courses):
>
> Five courses chosen from Statistics courses numbered from GU4207 through GU4293.
>
> An approved selection of three advanced courses in mathematics, statistics, applied mathematics, industrial engineering and operations research, computer science, or an advanced quantitative course in a social science. At least one elective must be a Statistics Department course numbered between 4221 and 4291

The middle row contradicts the header above it and the row below it. **§3 settles it
with four independent confirmations: the elective requirement is THREE courses, and
the "Five courses…" row is an erroneous insertion new to the 2026–2027 edition.** Read
§3 before transcribing this block.

Taking three as the answer, the block splits cleanly into one checkable half and one
unbounded half.

#### 1.5a `statistics-elective` — "Statistics Elective"

The one part of the sentence that names a decidable set:

> At least one elective must be a Statistics Department course numbered between 4221 and 4291

**Proposed rule kind:** `n_matching { n: 1, select: { subjects: ["STAT"], numberRange: [4221, 4291] } }`
— verification tier `flagged`, which is the honest label: the band is the Bulletin's
own and is decidable from a course number, but the department's course list moves.

Why this is safe rather than an invented numeric floor (trap #4): the Bulletin states
both endpoints itself, and the band is disjoint from every other group in this program
— the core stops at `GU4207` and the prerequisite is `UN1201` — so it cannot be
satisfied by coursework another group already claimed, and `vacuity.test.ts` will pass
without an allowlist entry. Our catalog holds 15 STAT rows inside `[4221, 4291]`:
`GU4221`, `GU4222`, `GU4224`, `GU4231`, `GU4234`, `GU4235`, `GU4241`, `GU4242`,
`GU4243`, `GU4244`, `GU4261`, `GU4263`, `GU4264`, `GU4265`, `GU4291`.

**Note:** "At least one of your three electives must be a Statistics Department course numbered between 4221 and 4291."

#### 1.5b `advanced-electives` — "Advanced Electives"

The rest of the sentence:

> An approved selection of three advanced courses in mathematics, statistics, applied mathematics, industrial engineering and operations research, computer science, or an advanced quantitative course in a social science.

**Proposed rule kind:** `attested`.

This is departmental policy prose, not a course list — the `seas-core` List B shape.
Three things in one sentence defeat every selector we have:

- **"An approved selection"** — the Director of Undergraduate Studies signs off. An
  advisor petition, which the language refuses on purpose.
- **"an advanced quantitative course in a social science"** — a per-course judgement
  across every social-science subject in the catalog. No `requirement_flags` field
  records it. A `numberRange` over POLS/SOCI/ECON/PSYC would mark a student's
  requirement satisfied by a course their adviser will reject.
- **"advanced"** applied to "mathematics, statistics, applied mathematics, industrial
  engineering and operations research, computer science" — no numeric floor is given
  for any of those five subjects, so any floor we picked would be ours, not the
  department's.

**This answers the second half of the question the brief posed: the computing list is
explicit (`n_of`, §1.2) and the linear-algebra requirement is explicit (`MATH UN2010`
named inside the sequence, §1.1), but the elective list is departmental policy prose
and has to be `attested`.**

**`attested` note:**

> Three advanced courses, approved by the Director of Undergraduate Studies, in
> mathematics, statistics, applied mathematics, industrial engineering and operations
> research, or computer science — or an advanced quantitative course in a social
> science. At least one of the three must be a Statistics Department course numbered
> between 4221 and 4291, which is the one part of this we check for you. Courses used
> for the mathematics prerequisite, the computing requirement, the statistics
> prerequisite or the five core courses are not among these three. If you are preparing
> for graduate study in statistics, the department encourages replacing two of the
> three with MATH GU4061 and MATH GU4062. No more than two of the STAT courses you
> count toward this major may be transfer credit.

**Catalog resolution:** an `attested` group names no codes. The two courses named in
its note both resolve: `MATH GU4061` → `MATH4061GU` (3 pts), `MATH GU4062` →
`MATH4062GU` (3 pts).

---

### 1.6 The second bullet under the table

> Students preparing for graduate study in statistics are encouraged to replace two electives with MATH GU4061 INTRO MODERN ANALYSIS I and MATH GU4062 INTRO MODERN ANALYSIS II.

"Encouraged", not required, and it substitutes *into* the elective block rather than
adding to it. No group of its own; folded into the `advanced-electives` note above so
a student on that path is not told the two analysis courses are worthless.

---

## 2. Point arithmetic

The Bulletin counts this major in **courses**, not points, so the reconciliation is a
course count. Every `hourscol` cell in the table is empty.

| block | Bulletin's stated size | group |
|---|---|---|
| Mathematics Prerequisites | 4 courses | `mathematics-prerequisite` |
| Computer Science Requirement | 1 course | `computing` |
| Statistics prerequisite | 1 course | `statistics-prerequisite` |
| Core courses in probability and statistics | 5 courses | `statistics-core` |
| Electives | 3 courses | `statistics-elective` (1 of the 3) + `advanced-electives` |
| **Total** | **4 + 1 + 1 + 5 + 3 = 14** | matches "The major requires **14 courses**" ✓ |

**With the contradictory row taken at face value** — five electives instead of three —
the same sum is 4 + 1 + 1 + 5 + 5 = **16**, against a published total of 14. It does
not close. That is the arithmetic half of §3.

**The honors route changes the count and the Bulletin does not say so.** A student who
satisfies the mathematics prerequisite with `MATH UN1207` + `MATH UN1208` takes
**2** courses where the standard route takes 4, so their major is **12 courses**, not
14. The Bulletin publishes 14 and offers the 2-course alternative in the same breath
without reconciling them. This does not affect the encoding — no group counts to 14 —
but it is why this dossier recommends **no `fourteen-courses` roll-up group**. A
`cc-major-psychology`-style `n_matching { n: 14 }` has nothing to select on (the 14
span MATH, STAT and COMS) and would be wrong for every honors student besides.

**No lost label (trap #5).** Checked in the direction the brief prescribes: the
arithmetic mismatch here is real, and the cause is an *extra* row rather than a
*missing* heading — confirmed by diffing against the 2025–2026 edition, where the
block has one row and the sum closes at 14. The two-way check matters: on the SEAS core
a failed sum meant a dropped `<h>`; here it means an inserted `<td>`.

---

## 3. The three-versus-five elective contradiction, resolved

The Electives block prints "(three courses)" in its header and "Five courses…" in its
first row. Four independent confirmations say **three**:

1. **The block's own header.** "Electives (three courses):" — and the second row
   agrees, twice: "An approved selection of **three** advanced courses".
2. **The published total.** 4 + 1 + 1 + 5 + **3** = 14 = "The major requires 14
   courses". With five it is 16. (§2)
3. **The Overview tab of the same page**, describing the same major in prose:
   > The Department offers a Major in Statistics, a Minor in Statistics, and interdisciplinary majors with Computer Science, Economics, Mathematics, and Political Science. The major consists of mathematical and computational prerequisites, an introductory course, five core courses in probability and theoretical and applied statistics, **plus three electives**.
4. **The 2025–2026 edition of this page** has the Electives block with **one** row —
   the "An approved selection of three advanced courses…" row — and **no** "Five
   courses…" row at all. The header there reads "Electives (three courses):" and the
   total reads "The major requires 14 courses". The offending row is new in 2026–2027.
   Archived at
   `http://web.archive.org/web/20250803113957/https://bulletin.columbia.edu/columbia-college/departments-instruction/statistics/`.

Two further tells that the inserted row is not a considered edit: it opens the band at
`GU4207`, which is **already a required core course** in the block directly above it,
and the same 2026–27 revision that introduced it also broke "Choose one of the
following" into "**Chose** one of the following" in the Computer Science block. The
row reads like a paste from a sibling program that was never reconciled.

The row is not, on this evidence, a CourseLeaf-eaten label (trap #5) — the 2025–26
diff shows an *insertion*, not a heading loss.

**Recommendation:** transcribe **three**, and quote the "Five courses…" sentence in the
`advanced-electives` note so a student who reads the Bulletin and sees it is not left
thinking the audit is broken. The identical contradiction appears on the General
Studies rendering of the same major
(`https://bulletin.columbia.edu/general-studies/majors-concentrations/statistics/`),
byte for byte — the two schools share one CourseLeaf block — so this is not a
CC-specific artifact and any GS encoding inherits it.

---

## 4. Not encodable

1. **"Courses taken for a grade of Pass/D/Fail, or in which the grade of D has been
   received, do not count toward the major."** Grade minima. Outside the language.

2. **"An approved selection…"** and **"or an advanced quantitative course in a social
   science."** Advisor approval plus an undecidable predicate — this is *why*
   `advanced-electives` is `attested` rather than an approximation. (§1.5b)

3. **"Five courses chosen from Statistics courses numbered from GU4207 through
   GU4293."** Recorded verbatim and **not encoded**, because it contradicts the header,
   the total and the prior edition. See §3.

4. **"Coursework in fulfillment of a major or minor must be taken at Columbia University
   unless explicitly noted here and/or expressly permitted by the Director of
   Undergraduate Studies. Exceptions or substitutions permitted by the Director of
   Undergraduate Studies should be confirmed in writing by email to the student."**
   (Overview tab.) Residency. Outside the language.

5. **"No more than two DUS-approved STAT courses toward a Statistics major may be
   fulfilled with transfer credit. Not more than one DUS-approved STAT course toward a
   Statistics joint major or a Statistics minor may be fulfilled with transfer credit."**
   (Overview tab.) Transfer-credit caps. Outside the language. Carried in the
   `advanced-electives` note because it is the block a transfer course most often lands
   in.

6. **"Students pursuing a major that requires STAT UN1201 should plan to take that
   course at Columbia, even if they scored a 5 on the AP statistics exam. AP credit
   cannot be used to satisfy a requirement for STAT UN1201."** (Overview tab.) The
   *effect* is encodable and is already encoded — `all_of ["STAT UN1201"]` with no
   alternative — but the "must be taken at Columbia" half is residency and is carried
   in the note. Recorded here so nobody later "improves" the group by adding an AP or
   transfer alternative.

7. **"Students preparing for graduate study in statistics are encouraged to replace two
   electives with MATH GU4061 … and MATH GU4062."** Advice, conditional on the
   student's intentions. In the note.

8. **"Classes taken abroad through Columbia-led programs … are treated as Columbia
   courses… If they are not explicitly listed by the department as fulfilling
   requirements in the major or minor, the DUS will need to confirm that they can be
   used."** (Overview tab.) Petition.

9. **"The major should be planned with the director of undergraduate studies."** No
   coursework attached. Unlike Psychology's Major Requirement Checklist, no deadline
   and no graduation-eligibility consequence is stated, so this dossier does **not**
   propose an `attested` group for it. Flagged so the choice is visible.

10. **Department honors.** "Students are considered for department honors on the basis
    of GPA and the comprehensiveness and difficulty of their coursework in Statistics
    and related disciplines." GPA plus editorial judgement.

11. **A "14 courses" roll-up.** Not encodable as a group even in principle: the 14 span
    MATH, STAT and COMS, so no selector describes them, and the honors route makes the
    true count 12. See §2.

---

## 5. The nine traps — verdicts

1. **`sequence_choice` vs `n_of`.** ✅ Hit. The mathematics prerequisite is
   `sequence_choice` over two alternatives (§1.1). `n_of { n: 4 }` over
   `{UN1101, UN1102, UN1201, UN2010, UN1207, UN1208}` would pass
   `UN1101 + UN1102 + UN1207 + UN1201` — four courses, no completed route. `all_of`
   over the printed four is the *other* wrong answer and fails every honors student.
2. **Delegated blocks nobody picked up.** ✅ Not applicable, verified. `cc-core.ts`
   names no MATH/STAT/COMS course in any rule; the Statistics page delegates nothing
   outward and states its mathematics and computing requirements in its own table.
   Every row of the Major in Statistics table is accounted for in §1. The one genuine
   cross-page pointer on the tab — "Please read Requirements for all Economics Majors,
   Concentrators, and Interdepartmental Majors in the Economics section of this
   Bulletin" — belongs to the **Economics-Statistics** major, not to this one.
3. **Footnotes.** ✅ Resolved by verification that there are none: the entire Statistics
   Requirements tab contains **zero `<sup>` elements**. What could be mistaken for
   footnotes are the two `<ul>/<li>` bullets under the table, and both are transcribed
   (§1.1 honors route, §1.6 analysis substitution). The honors bullet is the dangerous
   one precisely *because* it carries no marker and sits below the block it modifies.
4. **"Or higher" / open-ended substitutions.** ✅ Present and refused.
   `advanced-electives` is `attested` rather than approximated (§1.5b). The one numeric
   band that *is* encoded — STAT 4221–4291 — has both endpoints printed by the Bulletin
   itself. And `statistics-prerequisite` was checked in the opposite direction: the
   Economics department's "STAT UN1201, **or a higher level course**" phrasing does not
   appear here, so no alternative was imported from a neighbouring file.
5. **CourseLeaf eats labels.** ✅ Checked, and the arithmetic *does* fail — but the
   cause is an inserted row, not a dropped heading. Confirmed by diffing the 2025–2026
   edition. §3.
6. **Reconcile the arithmetic.** ✅ Done, §2. 4+1+1+5+3 = 14 ✓ against the published
   14; the contradictory reading gives 16 ✗. The honors route's 12-course consequence
   is recorded.
7. **Duplicated requirements across files.** ✅ None. No STAT/MATH/COMS course in this
   dossier appears as a rule in `cc-core.ts`. Overlap with `cc-major-economics`
   (`STAT UN1201`), `cc-major-computer-science` (`STAT UN1201`, `MATH UN2010`) and
   `cc-major-mathematics` (`MATH UN2010`, `MATH GU4061`, `MATH GU4062`) is *between
   programs a student may hold at once*, which `crossCountedCourseIds` surfaces by
   design. Every group here belongs on
   `lib/requirements/programs/cc-major-statistics.ts` and nowhere else.
8. **Honors / accelerated sequences.** ✅ Hunted hard, and the hunt changed the answer.
   The honors route is a bullet with no marker beneath a four-row block — the single
   easiest thing on this page to miss, and missing it costs an honors student the
   largest block of their major. Encoded as alternative 2 in §1.1. The *accelerated*
   route (`MATH UN1205`) was hunted for with equal effort and is genuinely **absent**
   from this major while present in three sibling majors on the same page; that
   asymmetry is §6.1 rather than a silent guess in either direction.
9. **Courses the Bulletin names that our catalog lacks.** ✅ **Zero** among the courses
   this program's rules name — all 15 codes across §1.1–§1.4 resolve, as do the two
   named in the `advanced-electives` note. Statistics joins Economics as a program with
   no unmatched codes. For the record, every code named anywhere on this
   Requirements tab was resolved (55 distinct codes across all seven programs), and
   exactly five have no row in our catalog: `COMS W1005`, `COMS W1007`, `COMS W3137`,
   `COMS W4130` and `STAT GU4262`. None is reachable from this major's rules — they
   belong to Data Science, Economics-Statistics and Mathematics-Statistics — but a
   transcriber of those programs will hit them and must keep them rather than drop
   them.

---

## 6. Open questions

1. **Is `MATH UN1205` Accelerated Multivariable Calculus an accepted route into this
   major's mathematics prerequisite?** *(The single most important open question for
   this program.)* The Statistics department accepts `MATH UN1205` in Data Science
   ("MATH UN1201 **or** MATH UN1205"), in Economics-Statistics and in
   Mathematics-Statistics — three of the four other majors it publishes on this very
   page — and the Mathematics department accepts it in all of its own. It is absent
   from the Major in Statistics table and from both bullets. Either the omission is
   deliberate (this major wants `UN1201` specifically, and `UN1205` is a 4-point
   accelerated course covering the same multivariable material) or it is an oversight
   of exactly the kind §3 already caught on the same page. **The consequence if it is
   an oversight:** a student who took Calculus I, Calculus II, Accelerated Multivariable
   Calculus and Linear Algebra — a schedule three of the department's own majors
   endorse — reads 3 of 4 on this group and is told to take Calculus III. **What would
   resolve it:** one email to the Director of Undergraduate Studies
   (Prof. Daniel Rabinowitz, dr105@columbia.edu, 1014 SSW), or the department's
   undergraduate pages at `https://stat.columbia.edu/programs/undergraduate-programs/`
   — which the Overview tab links by name and which sits behind a Cloudflare
   challenge that neither `curl` nor WebFetch could clear on 2026-08-26 (HTTP 403,
   "Just a moment…"). A browser session would get it.

2. **Does Advanced Placement credit shorten the mathematics prerequisite?** The
   Mathematics department grants 6 points for a BC 5 and says such a student "may begin
   with Calculus III and do not need to take Calculus II"; the Statistics page prints
   no "including Advanced Placement Credit" licence and says nothing. This dossier does
   **not** encode AP-truncated alternatives here — unlike `cc-major-mathematics`, where
   the block's own comment row licenses them. A BC-5 student on the standard route will
   therefore read 2 of 4. **What would resolve it:** the same email, or the department's
   planning form. Note the contrast the Overview tab *does* make explicit: AP statistics
   credit is barred from `STAT UN1201`, while AP calculus credit is never mentioned —
   which is weak evidence that calculus AP is accepted.

3. **Is the "Five courses chosen from Statistics courses numbered from GU4207 through
   GU4293" row an intended change the department has not carried through?** §3 resolves
   what to *transcribe* (three) on four independent confirmations. It does not resolve
   whether the department means to move to five and forgot to update the header, the
   total and the Overview tab. **What would resolve it:** the same email. Worth sending
   regardless — this is a live defect in a published Bulletin.

4. **Should `statistics-elective` and `advanced-electives` be two groups or one?** This
   dossier recommends two, so that one third of the elective requirement is `flagged`
   rather than `attested` and a student gets an automatic check on the part that has
   one. The cost is that the same course legitimately appears in a checked group and
   inside an attested one — harmless, since `attested` groups consume nothing and the
   two report different things, but it is a modelling choice a reviewer should see
   rather than discover. The single-group alternative is
   `seas-major-mechanical-engineering`'s `technical-electives`: one `attested` group
   carrying the whole prose.

5. **Mathematics-Statistics is published twice, in different units.** This page: "The
   major requires 14 courses". The Mathematics page: "The major requires 38-43 points".
   Same courses. Out of scope, but recorded so whoever encodes
   `cc-major-mathematics-statistics` picks a primary source deliberately.

---

## 7. Confidence: 9/10

| rubric item | status |
|---|---|
| Every group traced to a specific URL, rendered text quoted verbatim | ✅ §1, plus the distinct Overview-tab URL for the residency, transfer and AP sentences |
| Every footnote marker on every source page resolved and attached | ✅ §5.3 — the tab contains zero `<sup>` elements, verified by parsing the HTML rather than by reading; the two unmarked bullets are transcribed instead |
| Point arithmetic reconciled against the published total, shown | ✅ §2 — 14 ✓, and the contradictory reading's 16 ✗ |
| Every course code in Bulletin form and checked against our catalog | ✅ 15/15 in-rule codes resolve; zero unmatched |
| Honors/accelerated variants hunted for explicitly | ✅ §1.1 and §5.8 — honors found and encoded, accelerated found to be absent and flagged |
| Nine traps each considered with a verdict | ✅ §5 |
| Everything unencodable listed rather than approximated | ✅ §4, eleven items |
| Which file each requirement belongs on, stated | ✅ §1 preamble |
| Golden records written by hand from the Bulletin | ✅ §8 |

**Why 9 and not 10.** One question genuinely cannot be answered from the Bulletin: the
`MATH UN1205` asymmetry (§6.1). The department's own undergraduate pages — the obvious
tie-breaker, and linked by name from the Overview tab — are behind a Cloudflare
challenge that returned HTTP 403 to every fetch attempt on 2026-08-26. That is a named
blocker, not a gap in the reading, and the dossier transcribes what the Bulletin prints
rather than guessing past it. The AP question (§6.2) has the same shape.

**Why not lower, given the contradiction in §3.** The three-versus-five question is
*resolved*, not open: four independent confirmations, one of them a diff against the
prior edition that shows the offending row being inserted. A dossier that reported
"the Bulletin says two things" and stopped would be less useful than one that says
which, and shows the work.

---

## 8. Proposed golden records

Written by hand from the Bulletin. Format matches `GoldenRecord` in
`lib/requirements/golden.ts`.

### 8.1 `stat-honors-math` — the regression record

*Who:* Statistics major who satisfied the mathematics prerequisite with Honors
Mathematics A and B, as the bullet under the table permits.

*Why it is the record that matters:* the honors route is a bullet with no footnote
marker sitting *below* a four-row block that looks exactly like an `all_of`. Encoded
that way, this student reads **0 of 4** on the largest block of the major and is told
to take four courses they have surpassed. It is the `cc-major-economics` bug with the
alternative hidden one layer deeper.

```
taken: [
  "MATH UN1207", "MATH UN1208",
  "COMS W1004",
  "STAT UN1201",
  "STAT GU4203", "STAT GU4204", "STAT GU4205", "STAT GU4206", "STAT GU4207",
  "STAT GU4221", "STAT GU4224", "MATH GU4061",
]
```

| group | expected status | expected completed | by hand, from the Bulletin |
|---|---|---|---|
| `mathematics-prerequisite` | `satisfied` | 2 of 2 | Alternative 2 is complete. "The mathematics prerequisite can also be satisfied by taking the Honors Mathematics A and B sequence, MATH UN1207 and MATH UN1208." |
| `computing` | `satisfied` | 1 of 1 | `COMS W1004`. |
| `statistics-prerequisite` | `satisfied` | 1 of 1 | `STAT UN1201`. |
| `statistics-core` | `satisfied` | 5 of 5 | |
| `statistics-elective` | `satisfied` | 1 of 1 | `STAT GU4221` (and `GU4224`) fall in 4221–4291. |
| `advanced-electives` | `unmet` unless attested | 0 of 1 | `attested` groups are unmet until the student ticks them, however much coursework they hold. That is the tier working as designed, and the record pins it. |

`expectSatisfiedCount: 5` (six groups; the attested one is not ticked).

### 8.2 `stat-mixed-math` — two courses from each route, no completed route

*Who:* Student who took Calculus I and Honors Mathematics A.

*Why:* the specific schedule `n_of { n: 2 }` would wrongly pass. Both are first-term
courses from different tracks; two terms of work, nothing finished. Must read
`in_progress` — not `satisfied`, and not `unmet` either, because the student has
genuinely started.

```
taken: ["MATH UN1101", "MATH UN1207"]
```

| group | expected status | by hand |
|---|---|---|
| `mathematics-prerequisite` | `in_progress` | Best alternative is 2 (`UN1207`+`UN1208`) at 1/2 = 0.5, beating alternative 1 at 1/4 = 0.25. Reported against the honors route, which is the one the student is further into — and which is what the student should be told to finish. |
| `statistics-core` | `unmet` | |

### 8.3 `stat-accelerated-math` — the `MATH UN1205` student

*Who:* Student who took Calculus I, Calculus II, **Accelerated Multivariable
Calculus** and Linear Algebra — the route the same department endorses for Data
Science, Economics-Statistics and Mathematics-Statistics, and does not print for this
major.

*Why:* this record's expectation is deliberately the **conservative** one, and it is
written down so that the day §6.1 is answered, the answer lands as a visible test
change rather than a quiet edit. If the DUS confirms `MATH UN1205` counts, this
expectation flips to `satisfied` and a third alternative joins §1.1. Until then the
audit under-counts on purpose, which sends the student to their adviser rather than to
the registrar after add/drop.

```
taken: ["MATH UN1101", "MATH UN1102", "MATH UN1205", "MATH UN2010", "STAT UN1201"]
```

| group | expected status | expected completed | by hand |
|---|---|---|---|
| `mathematics-prerequisite` | `in_progress` | 3 of 4 | Alternative 1 matches `UN1101`, `UN1102`, `UN2010`; `MATH UN1201` is missing and `MATH UN1205` counts toward nothing this page prints. **The note must say why**, or this student concludes the app is broken. |
| `statistics-prerequisite` | `satisfied` | 1 of 1 | |

### 8.4 `stat-computing-via-stat` — `STAT UN2102` as the computing course

*Who:* Student who satisfied the Computer Science Requirement with Applied Statistical
Computing rather than a COMS course.

*Why:* it pins that the computing list is `n_of` over three named courses including a
STAT one — not a COMS-subject selector, which is the shape a transcriber reaches for by
reflex and which would report this student unmet. It also fixes the boundary between
`computing` and the elective block: `STAT UN2102` is numbered 2102, well below the
4221–4291 band, so it cannot leak into `statistics-elective`.

```
taken: [
  "MATH UN1101", "MATH UN1102", "MATH UN1201", "MATH UN2010",
  "STAT UN2102",
  "STAT UN1201",
  "STAT GU4203", "STAT GU4204", "STAT GU4205", "STAT GU4206", "STAT GU4207",
]
```

| group | expected status | expected completed | by hand |
|---|---|---|---|
| `mathematics-prerequisite` | `satisfied` | 4 of 4 | Alternative 1. |
| `computing` | `satisfied` | 1 of 1 | `STAT UN2102` is one of the three named options. |
| `statistics-prerequisite` | `satisfied` | 1 of 1 | |
| `statistics-core` | `satisfied` | 5 of 5 | |
| `statistics-elective` | `unmet` | 0 of 1 | Eleven courses done, three electives owed. Nothing this student holds is in 4221–4291. |
| `advanced-electives` | `unmet` | | Not attested. |

`expectSatisfiedCount: 4`. This is the "eleven of fourteen" student, and the record
that catches an elective block accidentally satisfied by the core.
