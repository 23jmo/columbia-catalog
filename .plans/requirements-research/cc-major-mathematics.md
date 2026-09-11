# Mathematics (Columbia College)

- **Program id:** `cc-major-mathematics`
- **School:** CC (Columbia College) · **Kind:** `major` · **Department:** Mathematics
- **Degree points:** not applicable — `degreePoints` is only meaningful on `kind: "core"`.
  The *major* requires **40–42 points**.
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/#requirementstextcontainer`
- **Secondary source (Overview tab, same page, different anchor):**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/`
- **Date researched:** 2026-08-26 (pages fetched live from `bulletin.columbia.edu` on that date)
- **Confidence:** **9/10** — see §6.

---

## 0. Which program this dossier transcribes, and which it does not

The Mathematics department publishes **seven** programs of study on one Requirements
tab. This dossier transcribes exactly one: the plain **"Major in Mathematics"**, the
40–42-point standard major. Everything else on the page is out of scope and is listed
here so a later transcriber does not silently merge two tables.

| Programme | Heading on the page | Published size | Suggested id | Status |
|---|---|---|---|---|
| **Major in Mathematics** | `Major in Mathematics` | 40–42 points | `cc-major-mathematics` | **THIS DOSSIER** |
| Major in Applied Mathematics | `Major in Applied Mathematics` | 37–41 points | `cc-major-applied-mathematics` | out of scope |
| Major in Computer Science–Mathematics | `Major in Computer Science–Mathematics` | 20 pts CS + 19–21 pts math + two 3-pt electives | `cc-major-computer-science-mathematics` | out of scope |
| Major in Economics-Mathematics | `Major in Economics-Mathematics` | — (page says only "see the Economics section of this bulletin") | `cc-major-economics-mathematics` | out of scope |
| Major in Mathematics-Statistics | `Major in Mathematics-Statistics` | 38–43 points (math page) / "14 courses" (statistics page) | `cc-major-mathematics-statistics` | out of scope — **and the two pages disagree, see §5** |
| Minor in Mathematics | `Minor in Mathematics` | 15–17 points | `cc-minor-mathematics` | out of scope |
| Minor in Mathematical Probability | `Minor in Mathematical Probability` | 15–17 points | `cc-minor-mathematical-probability` | out of scope |
| **Concentration in Mathematics** | `Concentration in Mathematics` | 12+ additional points on top of a multivariable/linear-algebra sequence | `cc-concentration-mathematics` | out of scope — **legacy, see below** |

All of the above live at the same URL
(`…/mathematics/#requirementstextcontainer`); the Economics-Mathematics major's real
content lives at
`https://bulletin.columbia.edu/columbia-college/departments-instruction/economics/`.

**Major, not concentration.** This dossier transcribes the **major**. The
Concentration in Mathematics sits below an `<hr/>` under its own `<h2>`:

> **For students who entered Columbia in or before the 2023-24 academic year**
>
> ### Concentration in Mathematics
> The concentration requires the following:

That heading is a hard eligibility gate on the whole section — the Statistics page
states the same rule in prose: *"Concentrations are not available to students who
entered Columbia in or after Fall 2024."* A concentration program encoded from this
page must carry that restriction in a note, and the rule language cannot express
"only if you matriculated before 2024".

---

## 1. Requirement groups

Every group below belongs on **one new file, `lib/requirements/programs/cc-major-mathematics.ts`**.
Nothing here belongs on `cc-core.ts`: the College Core carries no mathematics
requirement at all (`cc-core.ts` has groups `lit-hum`, `frontiers`,
`university-writing`, `contemporary-civilization`, `art-hum`, `music-hum`,
`science-b`, `science`, `global-core`, `foreign-language`, `physical-education`,
`swim-test` — no MATH course is named in any of them), so there is **no delegated
block and no duplication risk**. `MATH UN1003` appears in `cc-core.ts` only inside a
comment about the Science requirement's approved list, not as a rule.

`sourceUrl` for **every** group below:
`https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/#requirementstextcontainer`

The table is introduced by:

> **Major in Mathematics**
>
> The major requires 40-42 points as follows:

The rendered `sc_courselist` has **no values in its Points column at all** — every
`hourscol` cell is empty. All point figures come from the comment rows and from the
prose. That is worth knowing before anyone tries to reconcile arithmetic from the
table alone.

---

### 1.1 `calculus-sequence` — "Calculus and Linear Algebra"

**Bulletin's exact rendered text** (comment row, then three sequence rows separated by
`OR`):

> Select one of the following three calculus and linear algebra sequences (13-15 points including Advanced Placement Credit):
>
> | MATH UN1101 & MATH UN1102 & MATH UN1201 & MATH UN1202 & MATH UN2010 | CALCULUS I and CALCULUS II and CALCULUS III and CALCULUS IV and LINEAR ALGEBRA <sup>1</sup> |
> | OR |
> | MATH UN1101 & MATH UN1102 & MATH UN1205 & MATH UN2010 | CALCULUS I and CALCULUS II and ACCELERATED MULTIVARIABLE CALC and LINEAR ALGEBRA <sup>1</sup> |
> | OR |
> | MATH UN1101 & MATH UN1102 & MATH UN1207 & MATH UN1208 | CALCULUS I and CALCULUS II and HONORS MATHEMATICS A and HONORS MATHEMATICS B |

**Proposed rule kind:** `sequence_choice`. **Never `n_of { n: 4 }`** — trap #1. The five
distinct first-term/second-term courses across the three routes are freely mixable
into schedules a real student can build (`MATH UN1101` + `MATH UN1102` + `MATH UN1205`
+ `MATH UN1202` is four courses and completes nothing), and this is the exact shape
that shipped broken on `cc-major-economics`.

**Recommended alternatives — seven, not three.** The three printed sequences, plus the
Advanced-Placement-truncated form of each. The comment row itself licenses this:
*"13-15 points **including Advanced Placement Credit**"*. The Placement section on the
same tab spells out precisely which terms the AP credit replaces:

> Students with a score of 4 or 5 on the AB exam, 4 on the BC exam, or those with no AP score but with a grade of A in a full year of high school calculus may begin with either MATH UN1102 CALCULUS II or MATH UN1201 CALCULUS III. … Students with a score of 5 on the BC exam may begin with Calculus III and do not need to take Calculus II.

> Accelerated Multivariable Calculus — Students with a score of 5 on the AP BC exam or 7 on the IB HL exam may begin with MATH UN1205 ACCELERATED MULTIVARIABLE CALC.

> Honors Mathematics A — Students who want a proof-oriented theoretical sequence and have a score of 5 on the BC exam may begin with MATH UN1207 HONORS MATHEMATICS A, which is especially designed for mathematics majors.

| # | label | courses |
|---|---|---|
| 1 | `Calculus I–IV and Linear Algebra` | `MATH UN1101`, `MATH UN1102`, `MATH UN1201`, `MATH UN1202`, `MATH UN2010` |
| 2 | `Calculus I–IV and Linear Algebra, Calculus I by AP` | `MATH UN1102`, `MATH UN1201`, `MATH UN1202`, `MATH UN2010` |
| 3 | `Calculus I–IV and Linear Algebra, Calculus I–II by AP` | `MATH UN1201`, `MATH UN1202`, `MATH UN2010` |
| 4 | `Accelerated Multivariable Calculus and Linear Algebra` | `MATH UN1101`, `MATH UN1102`, `MATH UN1205`, `MATH UN2010` |
| 5 | `Accelerated Multivariable Calculus and Linear Algebra, Calculus I–II by AP` | `MATH UN1205`, `MATH UN2010` |
| 6 | `Honors Mathematics A and B` | `MATH UN1101`, `MATH UN1102`, `MATH UN1207`, `MATH UN1208` |
| 7 | `Honors Mathematics A and B, Calculus I–II by AP` | `MATH UN1207`, `MATH UN1208` |

`evaluateProgram` scores a `sequence_choice` by **fraction** completed and reports the
best alternative, so a student holding only `MATH UN1207` + `MATH UN1208` scores 2/4 =
0.5 on alternative 6 and 2/2 = 1.0 on alternative 7 and is correctly reported
satisfied. A student holding `MATH UN1101` + `MATH UN1207` scores at best 1/2 and is
correctly reported *in progress*, not satisfied.

The residual risk of adding 2/3/5/7 is over-counting a student who somehow reached
Calculus III with neither AP credit nor Calculus I–II. The registrar's own
prerequisites make that schedule unbuildable, and the alternative — omitting them —
reproduces trap #8 verbatim for every BC-5 student in the department's flagship
honors track. **This is the one judgement in this dossier that is not a direct
transcription; it is flagged again in §5 and §6.**

**Note the student needs to see** (repo voice):

> One complete sequence, every term of whichever you pick. Advanced Placement credit
> can stand in for Calculus I, or for Calculus I and II — the Bulletin prices this
> block at "13-15 points including Advanced Placement Credit", so a course you tested
> out of will not appear on your record and does not need to. Credit is allowed for
> only one calculus and linear algebra sequence. MATH UN2015 Linear Algebra and
> Probability does not substitute for MATH UN2010. Consult the Calculus Director about
> placement.

**Footnote resolved — marker `1`**, attached to the words `LINEAR ALGEBRA` in
sequences 1 and 2 (and nowhere else in this table; sequence 3 has no marker):

> **1** MATH UN2015 Linear Algebra and Probability does NOT replace MATH UN2010 LINEAR ALGEBRA as prerequisite requirements of math courses. Students will not receive full credit for both courses UN2010 and UN2015. Students who have taken MATH UN2015 and consider taking higher level Math courses should contact a major advisor to discuss alternative pathways.

Consequence for the encoding: `MATH UN2015` must **not** appear in any sequence.
It is carried in the note only.

**Catalog resolution:** all seven codes resolve.

| Bulletin code | catalog `course_id` | points | title |
|---|---|---|---|
| `MATH UN1101` | `MATH1101UN` | 3 | CALCULUS I |
| `MATH UN1102` | `MATH1102UN` | 3 | CALCULUS II |
| `MATH UN1201` | `MATH1201UN` | 3 | CALCULUS III |
| `MATH UN1202` | `MATH1202UN` | 3 | CALCULUS IV |
| `MATH UN2010` | `MATH2010UN` | 3 | LINEAR ALGEBRA |
| `MATH UN1205` | `MATH1205UN` | 4 | ACCELERATED MULTIVARIABLE CALC |
| `MATH UN1207` | `MATH1207UN` | 4 | HONORS MATHEMATICS A |
| `MATH UN1208` | `MATH1208UN` | 4 | HONORS MATHEMATICS B |

Zero unmatched codes in this group.

---

### 1.2 `modern-algebra` — "Modern Algebra"
### 1.3 `modern-analysis` — "Modern Analysis"

**Bulletin's exact rendered text** — one block on the page, four rows:

> 12 points in the following courses:
>
> | MATH GU4041 | INTRO MODERN ALGEBRA I |
> | MATH GU4042 | INTRO MODERN ALGEBRA II |
> | MATH GU4061 | INTRO MODERN ANALYSIS I <sup>2</sup> |
> | MATH GU4062 | INTRO MODERN ANALYSIS II <sup>2</sup> |

**Footnote resolved — marker `2`**, attached to `MATH GU4061` **and** to `MATH GU4062`,
and to no other row on the page:

> **2** Students who are not contemplating graduate study in mathematics may replace one or both of the two terms of MATH GU4061 - MATH GU4062 by one or two of the following courses: MATH UN2500 ANALYSIS AND OPTIMIZATION, MATH UN3007 COMPLEX VARIABLES, MATH UN3028 PARTIAL DIFFERENTIAL EQUATIONS, or MATH GU4032 FOURIER ANALYSIS.

**Recommended split into two groups.** The Bulletin prints one 12-point block, but the
footnote governs only half of it. Splitting keeps the algebra half `all_of` (exact,
no ambiguity) and lets the analysis half carry the substitution honestly. `seas-major-mechanical-engineering`
splits `calculus` from `applied-mathematics` on the same reasoning. A transcriber who
prefers to mirror the page's own shape can keep one group, but then the whole block
becomes an `n_of { n: 4 }` over six courses and would wrongly accept
`GU4041 + UN2500 + UN3007 + GU4032` — no algebra at all. **Do not do that.**

| group | rule | courses |
|---|---|---|
| `modern-algebra` | `all_of` | `MATH GU4041`, `MATH GU4042` |
| `modern-analysis` | `n_of { n: 2 }` | `MATH GU4061`, `MATH GU4062`, `MATH UN2500`, `MATH UN3007`, `MATH UN3028`, `MATH GU4032` |

`n_of { n: 2 }` over those six is *exactly* what footnote 2 says and nothing more:
keep both terms, replace one, or replace both. It is **not** a `sequence_choice` —
there is no ordering or pairing constraint left once either term may be swapped
independently, so trap #1 does not apply here. This was checked rather than assumed:
the footnote's "one or both" makes every 2-subset legal.

**Notes the student needs to see:**

- `modern-algebra`: "Both terms. Six of the major's twelve points of algebra-and-analysis."
- `modern-analysis`: "Two courses. The Bulletin's default is Introduction to Modern Analysis I and II; if you are not contemplating graduate study in mathematics you may replace one or both terms with Analysis and Optimization, Complex Variables, Partial Differential Equations, or Fourier Analysis. Whichever two you use here cannot also count as electives."

**Catalog resolution:** all six resolve.

| Bulletin code | catalog `course_id` | points | title |
|---|---|---|---|
| `MATH GU4041` | `MATH4041GU` | 3 | INTRO MODERN ALGEBRA I |
| `MATH GU4042` | `MATH4042GU` | 3 | INTRO MODERN ALGEBRA II |
| `MATH GU4061` | `MATH4061GU` | 3 | INTRO MODERN ANALYSIS I |
| `MATH GU4062` | `MATH4062GU` | 3 | INTRO MODERN ANALYSIS II |
| `MATH UN2500` | `MATH2500UN` | 3 | ANALYSIS AND OPTIMIZATION |
| `MATH UN3007` | `MATH3007UN` | 3 | COMPLEX VARIABLES |
| `MATH UN3028` | `MATH3028UN` | 3 | PARTIAL DIFFERENTIAL EQUATIONS |
| `MATH GU4032` | `MATH4032GU` | 3 | FOURIER ANALYSIS |

Zero unmatched codes.

---

### 1.4 `seminar` — "Undergraduate Seminar"

**Bulletin's exact rendered text:**

> 3 points in the following:
>
> | MATH UN3951 | UNDERGRADUATE SEMINARS I <sup>3</sup> |
> | or MATH UN3952 | UNDERGRADUATE SEMINARS II |

Corroborated on the Overview tab of the same page:

> Another requirement for majors is participation in an undergraduate seminar, usually in the junior or senior year. … In these seminars, students gain experience in learning an advanced topic and lecturing on it.

**Proposed rule kind:** `n_of { n: 1 }` over `["MATH UN3951", "MATH UN3952"]`.

**Footnote resolved — marker `3`.** It appears **twice**, on two different rows, and
both attachments matter:

> **3** Only one Undergraduate Seminar may count towards the major requirements.

- On `MATH UN3951` in this group → the group needs one seminar, not two.
- On the elective row `1) Courses offered by the department numbered 2000 or higher`
  (§1.5) → **a second seminar may not be used as an elective.** This is the whole
  reason the elective selector below excludes both seminar codes *by code* rather than
  relying on `excludeGroups`.

**Note:** "One undergraduate seminar, usually in the junior or senior year. Only one seminar can count toward the major, so a second one will not fill an elective slot."

**Catalog resolution:** `MATH UN3951` → `MATH3951UN` (3 pts), `MATH UN3952` →
`MATH3952UN` (3 pts). Zero unmatched.

---

### 1.5 `electives` — "Electives"

**Bulletin's exact rendered text:**

> 12 points from the following:
>
> 1) Courses offered by the department numbered 2000 or higher <sup>3</sup>
>
> 2) Courses from the list of approved cognate courses below. A maximum of 6 credits may be taken from courses outside the department. <sup>4</sup>

**Footnotes resolved.** Marker `3` on row 1 (text quoted in §1.4). Marker `4` on row 2:

> **4** Additional courses may be selected only with prior written approval from the Director of Undergraduate Studies.

**Proposed rule kind:** `points_matching { points: 12 }`, because the Bulletin counts
this block in points, not courses, and the cognate list mixes 3-point and 4-point
courses (`COMS W3157` and `COMS W3203` are 4 points; `PHIL UN3411` is 4;
`CHEM UN3079`/`UN3080` are 4; `IEOR E6613` is 4.5).

```
select: {
  subjects: ["MATH"],
  numberRange: [2000, 9999],
  include: [ …the 79 approved cognate codes, listed in §1.6… ],
  exclude: [
    "MATH UN3951", "MATH UN3952",   // footnote 3 — only one seminar counts, ever
    "MATH UN3901", "MATH UN3902",   // Supervised Readings — Overview tab, quoted below
    "MATH UN3994", "MATH UN3995",   // Senior Thesis I/II — Overview tab, quoted below
    "MATH UN2015",                  // footnote 1 — no full credit alongside UN2010
  ],
  excludeGroups: ["calculus-sequence", "modern-algebra", "modern-analysis"],
}
```

**`excludeGroups` is mandatory, not optional.** `MATH UN2010`, `MATH GU4041`,
`MATH GU4042`, `MATH GU4061`, `MATH GU4062` and any footnote-2 substitute are all MATH
courses numbered 2000 or higher. Without the exclusion a student who has taken exactly
the named requirements and zero electives scores 18 points against a 12-point block
and the major reads complete twelve points early — the identical vacuity bug that
`vacuity.test.ts` exists to catch, and that shipped on both computer science majors.
The Bulletin never says "these must be different courses" in so many words; the
**arithmetic says it** (§2), which is why §2 is not a formality.

**The two exclusions that are only visible on the Overview tab.** Neither is mentioned
anywhere in the Requirements tab, and both are MATH courses numbered 2000 or higher,
so a selector built from the requirements table alone counts them:

> Supervising Readings do NOT count towards major requirements, with the exception of an advanced written approval by the Director of Undergraduate Studies.
> — Overview tab, under "Undergraduate Research in Courses"; the courses named there are `MATH UN3901` and `MATH UN3902`.

> Sections of Senior Thesis in Mathematics I and II do NOT count towards the major requirements, unless prior written approval is obtained from the Director of Undergraduate Studies.
> — Overview tab, under "Senior Thesis Coursework and Requirements"; `MATH UN3994` (4 points) and `MATH UN3995` (2 points).

Source URL for those two sentences (different anchor from the group's own):
`https://bulletin.columbia.edu/columbia-college/departments-instruction/mathematics/`

**Note the student needs to see:**

> Twelve points. Anything the Mathematics Department offers at the 2000 level or above,
> plus the department's list of approved cognate courses — but at most 6 credits may
> come from outside the department, a cap this audit does not enforce, so count it
> yourself. Courses that already satisfied the sequence, the algebra requirement or the
> analysis requirement do not count again. Supervised Readings, Senior Thesis and a
> second Undergraduate Seminar do not count at all without the Director of
> Undergraduate Studies' prior written approval. A cognate that is not on the approved
> list needs that approval too, and will not be matched here.

**Catalog resolution:** the selector itself is a shape, so only its `include` list can
be checked. **72 of the 79 approved cognate codes resolve; 7 do not.** See §1.6.

Also worth knowing before choosing `numberRange`: our catalog holds **102 MATH rows**,
of which 46 are `MATH GR5xxx` (the MAFN master's programme), `MATH GR6xxx` or
`MATH GR8xxx`. `[2000, 9999]` sweeps every one of them in. See §5, open question 2.
Three MATH rows above 2000 carry no points and so contribute nothing to a
`points_matching` total — `MATH UN2005` INTRODUCTION TO MATHEMATICS PROOFS (0 points)
and the recitations `MATH GU4941` and `MATH GU4961` (no points value in our catalog).
Harmless for the total, but they will appear in the matched list.

---

### 1.6 The approved cognate list, verbatim (79 courses)

Rendered on the Requirements tab as a plain three-column HTML table headed
`Approved Cognate Courses 1 | Approved Cognate Courses 2 | Approved Cognate Courses 3`
immediately under the Major in Mathematics table. It is **not** an `sc_courselist`, so
`parseRequirementTables` will not see it.

The Overview tab defines what the list is for:

> A cognate course must be a 2000-level (or higher) course and must be approved by the director of undergraduate studies. In general, a course not taught by the Mathematics Department is a cognate course for the mathematics major if either (a) it has at least two semesters of calculus as a stated prerequisite, or (b) the subject matter in the course is mathematics beyond an elementary level, such as PHIL UN3411 SYMBOLIC LOGIC, in the Philosophy Department, or COMS W3203 DISCRETE MATHEMATICS, in the Computer Science Department. A list of pre-approved cognate courses can be found under the major requirements.

Column 1 (28): `APMA E2101`, `APMA E3102`, `APMA E4300`, `APMA E4302`, `APPH E6102`,
**`CBMF W4761`**, `CHEM UN3079`, `CHEM UN3080`, `COMS W3134`, `COMS W3157`,
`COMS W3203`, `COMS W3261`, `COMS W4111`, `COMS W4160`, **`COMS W4162`**,
`COMS W4203`, `COMS W4261`, `COMS W4460`, `COMS W4701`, `COMS W4705`,
**`COMS W4762`**, `COMS W4771`, **`COMS W4773`**, `CSEE W3827`, `CSOR W4231`,
`CSOR W4246`, **`CSPH G4801`**, **`CSPH G4802`**

Column 2 (28): `ECON UN3025`, `ECON BC3035`, `ECON BC3038`, `ECON UN3211`,
`ECON UN3213`, `ECON UN3265`, `ECON UN3412`, `ECON GU4020`, `ECON GU4230`,
`ECON GU4280`, `ECON GU4415`, `ECON GU4710`, `EEOR E6616`, `EESC UN3400`,
`EESC GU4008`, `EESC GU4090`, `EESC GU4924`, `IEOR E3106`, `IEOR E3658`,
`IEOR E4700`, `IEOR E6613`, `MSAE E3010`, `MSAE E3111`, `PHIL UN3411`,
`PHIL GU4424`, `PHIL GU4431`, `PHIL GU4561`, `PHIL GU4810`

Column 3 (23): `PHYS UN2601`, `PHYS UN2801`, `PHYS UN2802`, `PHYS UN3003`,
`PHYS UN3007`, `PHYS UN3008`, **`PHYS GU4011`**, `PHYS GU4018`, `PHYS GU4019`,
`PHYS GU4021`, `PHYS GU4022`, `PHYS GU4023`, `PHYS GU4040`, `PHYS GR6047`,
`PHYS GR6080`, `POLS GU4700`, `STAT UN3106`, `STAT GU4001`, `STAT GU4203`,
`STAT GU4204`, `STAT GU4205`, `STAT GU4206`, `STAT GU4207`

**Courses the Bulletin names that our catalog lacks (trap #9) — 7 of 79, bolded above:**

| code | Bulletin title | why it is missing |
|---|---|---|
| `CBMF W4761` | COMPUTATIONAL GENOMICS | no row in our four covered terms |
| `COMS W4162` | ADVANCED COMPUTER GRAPHICS | no row |
| `COMS W4762` | Machine Learning for Functional Genomics | no row |
| `COMS W4773` | Machine Learning Theory | no row |
| `CSPH G4801` | Mathematical Logic I | no row; `G` is a recognised qualifier in `code.ts`, so the code parses |
| `CSPH G4802` | Math Logic II: Incompletness | no row |
| `PHYS GU4011` | PARTICLE ASTROPHYS ＆ COSMOLOGY | no row |

**All seven must be KEPT in the `include` list**, exactly as `seas-major-mechanical-engineering`
keeps `COMS W1005` and `MATH UN3027`. This is coverage, not a transcription error:
none has a near-miss row under a different qualifier (which is what a misspelt code
looks like), and our catalog covers only four terms. Dropping an option the Bulletin
offers tells a student who took it that it did not count. Because the elective block
is 12 points drawn from 79 cognates plus the whole MATH 2000+ range, no requirement is
made unsatisfiable by the gap.

Note also that `STAT UN3106` is printed on the cognate list as `APPLIED MACHINE
LEARNING`; our catalog agrees. `STAT GU4206`'s Bulletin title on this page is
`PROGRAMMING FOR DATA SCIENCE` while our catalog says `STAT COMP & INTRO DATA SCIENCE`
— the 2025–2026 edition used the catalog's title. Same course, renamed on the page;
the code is the identity and it resolves.

---

## 2. Point arithmetic

The Bulletin publishes **40–42 points**. The table's Points column is entirely empty,
so the reconciliation runs off the comment rows and the catalog's own point values.

| block | Bulletin's stated size | courses | catalog points |
|---|---|---|---|
| Calculus and Linear Algebra | 13–15 | see below | 13–15 ✓ |
| Modern Algebra + Modern Analysis | 12 | 4 courses × 3 | 12 ✓ |
| Undergraduate Seminar | 3 | 1 course × 3 | 3 ✓ |
| Electives | 12 | — | 12 ✓ |
| **Total** | **40–42** | | **40–42 ✓** |

The 13–15 range reconciles *exactly*, which is the strongest single piece of evidence
in this dossier that the three sequences have been read correctly:

| sequence | points |
|---|---|
| `UN1101`(3) + `UN1102`(3) + `UN1201`(3) + `UN1202`(3) + `UN2010`(3) | **15** |
| `UN1101`(3) + `UN1102`(3) + `UN1205`(4) + `UN2010`(3) | **13** |
| `UN1101`(3) + `UN1102`(3) + `UN1207`(4) + `UN1208`(4) | **14** |

min 13, max 15 — precisely the printed range. And 13 + 12 + 3 + 12 = 40;
15 + 12 + 3 + 12 = 42. Both endpoints land.

**What this reconciliation proves, beyond arithmetic:** the four blocks must be
**disjoint**. If the 12-point elective block could be filled by the same courses that
filled the 12-point algebra/analysis block, the major's real floor would be 28 points,
not 40. The Bulletin never states disjointness in prose; the total states it. Hence
`excludeGroups` in §1.5.

**No lost label (trap #5).** The arithmetic closes on both endpoints with exactly three
sequence alternatives and exactly four blocks, so there is no room for a
CourseLeaf-eaten heading here — unlike the SEAS core, where the totals did *not* close
and a third alternative turned out to be missing its `<h>`.

---

## 3. Not encodable

Each item is quoted verbatim, with the reason the rule language cannot hold it.

1. **"A maximum of 6 credits may be taken from courses outside the department."**
   (elective row 2). A cap *across the set the student picks*, not a property of any
   one course. `points_matching` counts points matching a shape; it cannot say "and at
   most 6 of them may look like this". Narrowing the selector to MATH-only would
   under-count every student who legitimately used two cognates. Carried as a note —
   the same treatment `cc-major-economics` gives "no more than one elective at the
   2000-level".

2. **"Additional courses may be selected only with prior written approval from the
   Director of Undergraduate Studies."** (footnote 4). An advisor petition. The
   language has no representation for one, by design.

3. **"No course with a grade of D or lower can count toward the major,
   interdepartmental major, minor, or concentration."** (Requirements tab, "Grading").
   Grade minima are explicitly outside the language.

4. **"Students who are not contemplating graduate study in mathematics may replace one
   or both of the two terms of MATH GU4061 - MATH GU4062 …"** — the *eligibility*
   half. `n_of { n: 2 }` encodes the substitution but cannot condition it on the
   student's graduate-school intentions, which no data source records. The clause is
   quoted in the group's note. (The substitution itself **is** encoded — this is only
   about who may use it.)

5. **"Supervising Readings do NOT count towards major requirements, **with the
   exception of an advanced written approval by the Director of Undergraduate
   Studies**."** and the identical clause for Senior Thesis. The exclusion is encoded;
   the petition that reverses it is not. A student who has that approval will see a
   requirement read short. Named in the note.

6. **Double counting.** "In general, courses in the Calculus sequence may be counted
   towards both majors, with up to two additional MATH UN2xxx or higher level courses
   at the discretion of all approving departments. Students pursuing a minor may double
   count at most one additional MATH UN2xxx or higher level course." Cross-*program*
   overlap. `evaluate.ts` deliberately reports cross-counting via
   `crossCountedCourseIds` rather than resolving it; nothing here changes that.

7. **Transfer credit.** "A maximum of 16 transfer credits may be granted. A maximum of
   6 transfer credits may be counted towards minor requirements. Course equivalency
   requests for any Calculus level course, Linear Algebra, or Ordinary Differential
   Equations must be submitted to the Calculus Director for evaluation." Transfer
   equivalencies are outside the language.

8. **Advanced Placement credit as such.** The department grants 3 or 6 points for
   AB/BC scores "provided students complete MATH UN1102 … or MATH UN1201 … with a grade
   of C or better", and "Students can receive credit for only one calculus sequence."
   A conditional-on-grade award of points against no course record. What *is* encoded
   is the consequence — the AP-truncated sequence alternatives in §1.1 — not the credit
   award itself.

9. **"Any course offered by the Mathematics@Barnard department will count towards
   degree requirements."** Barnard MATH rows carry the `MATH` subject
   (`MATH BC2006 COMBINATORICS`, `MATH BC1110`, `MATH BC2001`), so `subjects: ["MATH"]`
   already reaches them and the sentence needs no rule. Recorded because the sentence
   says *degree* requirements, not *major* requirements, and a reader should not
   mistake the selector's behaviour for a transcription of this sentence. See §5,
   open question 3.

10. **Departmental honors.** "To be recommended to the College Committee on Honors,
    Awards, and Prizes … you must have a GPA of 3.63 in the major and have completed a
    senior thesis of merit." GPA. Not coursework.

11. **Planning forms.** "Planning forms for all programs are available on our website.
    These forms should be completed and approved by a department adviser early in the
    semester of the expected graduation date." An administrative deadline with no
    course attached. `cc-major-psychology` encodes its equivalent as an `attested`
    group (`major-requirement-checklist`); doing the same here would be defensible,
    but the Mathematics wording is "should", not "must", and no graduation-eligibility
    consequence is stated, so this dossier leaves it as a note rather than a group. A
    transcriber who disagrees has a clear precedent to follow.

12. **"The program of study should be planned with a departmental adviser before the
    end of the sophomore year."** Same category.

---

## 4. The nine traps — verdicts

1. **`sequence_choice` vs `n_of { n: 2 }`.** ✅ Hit, and handled. The calculus block is
   `sequence_choice` with seven alternatives (§1.1). Flattening it would accept
   `UN1101 + UN1102 + UN1205 + UN1202`, four courses completing nothing. The analysis
   block is *not* a sequence — footnote 2 makes the two terms independently
   substitutable — so `n_of { n: 2 }` is correct there, and that was checked rather
   than assumed.
2. **Delegated blocks nobody picked up.** ✅ Not applicable, and verified rather than
   asserted. This is a Columbia College page; `cc-core.ts` carries no mathematics or
   science block delegated to departments, and the Mathematics page delegates nothing
   outward. Every row of the "Major in Mathematics" table is accounted for in §1.
3. **Footnotes.** ✅ Four markers exist on the Major in Mathematics table — `1`, `2`,
   `3` (twice, on two different rows), `4`. All four are resolved in §1 with their
   attachment points. Footnote 2 is the dangerous one: without it, a student who
   replaced Modern Analysis II with Fourier Analysis reads unmet. Footnote 3's *second*
   attachment (the elective row) is the one a skimmer loses. The Statistics-department
   pages carry zero `<sup>` markers; this page carries these four and no others in the
   in-scope table.
4. **"Or higher" / open-ended substitutions.** ✅ Present, and refused. The elective
   row says "Courses offered by the department numbered 2000 or higher" — a floor the
   *Bulletin itself* states, so transcribing it is not guessing. But the cognate half
   is closed ("Courses from the list of approved cognate courses below") and footnote 4
   says anything else needs written approval, so **no numeric floor is invented over
   the cognate subjects.** The 79 codes are enumerated as `include`; `PHIL UN3411` gets
   in by name, not because PHIL 3000+ was swept in.
5. **CourseLeaf eats labels.** ✅ Checked, none found. The arithmetic closes on both
   endpoints (§2) with exactly three sequences and four blocks, which is the test the
   brief prescribes. The cognate list *is* a plain HTML table rather than an
   `sc_courselist` — a parser will return nothing for it — but its labels are intact.
6. **Reconcile the arithmetic.** ✅ Done and shown in §2. 13–15 + 12 + 3 + 12 = 40–42,
   both endpoints exact.
7. **Duplicated requirements across files.** ✅ None. No MATH course appears as a rule
   in `cc-core.ts`. `cc-major-economics.ts`, `cc-major-computer-science.ts` and
   `cc-minor-computer-science.ts` all name MATH courses, but those are *different
   programs* a student may hold simultaneously — that is cross-program overlap, which
   `crossCountedCourseIds` surfaces, not intra-program duplication. Every requirement
   in this dossier belongs on `lib/requirements/programs/cc-major-mathematics.ts` and
   nowhere else.
8. **Honors / accelerated sequences.** ✅ Hunted explicitly and found in force. The
   Bulletin publishes **four** distinct entry points into the major's mathematics —
   the `UN1101–UN1102–UN1201–UN1202` standard route, `MATH UN1205` Accelerated
   Multivariable Calculus, the `UN1207`/`UN1208` Honors Mathematics A/B route, and
   Advanced Placement credit standing in for Calculus I or Calculus I–II inside any of
   them. All are enumerated as `sequence_choice` alternatives in §1.1. The honors
   route is not an afterthought here: the Overview tab opens with *"Majors begin by
   taking either Honors mathematics or the calculus sequence"*, and `MATH UN1207` is
   described as *"especially designed for mathematics majors"*. Getting this wrong on
   the Mathematics major would be a worse version of the `cc-major-economics` bug.
9. **Courses the Bulletin names that our catalog lacks.** ✅ Seven, all in the cognate
   list, all enumerated in §1.6 with their titles, all to be kept.

---

## 5. Open questions

1. **Do the Advanced-Placement-truncated sequences complete the requirement?**
   *(The single most important open question for this program.)* The Bulletin prints
   three sequences that all begin with `MATH UN1101` + `MATH UN1102`, prices the block
   at "13-15 points **including Advanced Placement Credit**", and separately tells a
   BC-5 student to *begin* at `MATH UN1205` or `MATH UN1207`. Those two statements
   cannot both be satisfied by a literal four-course transcription: a BC-5 honors
   student's record contains `UN1207` and `UN1208` and nothing else, and against
   sequence 3 alone they read 2/4, in progress — precisely the failure that shipped on
   `cc-major-economics`. This dossier recommends encoding the truncated variants
   (alternatives 2, 3, 5, 7 in §1.1). **What would resolve it:** the department's own
   planning form (linked from the Requirements tab as "Planning forms for all programs
   are available on our website") stating whether Calculus I and II appear as
   satisfied-by-AP rows, or one email to the Director of Undergraduate Studies
   (Prof. Julien Dubedat, jd2653@columbia.edu) or the Calculus Director
   (Prof. George Dragomir, gd2572@columbia.edu). Corroborating evidence already in
   hand: the *same department's* Mathematics-Statistics major prints
   `MATH UN1207 & MATH UN1208 & MATH UN2500` as a complete sequence with no Calculus
   I/II, and the Statistics department writes the honors route as
   "MATH UN1207 and MATH UN1208" flat.

2. **Does "courses offered by the department numbered 2000 or higher" include the
   5000- and 6000-level courses?** The same tab's Course Numbering Structure says
   "5000 Level courses are Master's level courses. 6000 Level and above are PhD level
   courses." Our catalog holds 46 such MATH rows (the whole MAFN master's programme at
   `MATH GR5xxx`, plus `GR6xxx`/`GR8xxx`). `numberRange: [2000, 9999]` is the literal
   reading and admits them; `[2000, 4999]` is the conservative reading and excludes
   `MATH GR5010 INTRO TO THE MATH OF FINANCE`, which the department recommends by name
   to its own Mathematics-Statistics majors. This dossier recommends the literal
   `[2000, 9999]` — the Bulletin said "or higher" and it is the department's own
   subject — but flags that it is a choice. **What would resolve it:** the same email;
   or a look at whether any MATH GR course lists an undergraduate prerequisite.

3. **Do Barnard MATH courses count toward the *major*, or only toward the *degree*?**
   The Overview tab says "Any course offered by the Mathematics@Barnard department will
   count towards **degree requirements**." `subjects: ["MATH"]` counts `MATH BC2006`
   and friends toward the elective block regardless. Supporting evidence that this is
   right: the Computer Science–Mathematics major on the same page lists `MATH BC2006
   COMBINATORICS` as an explicit elective. Contrast `cc-major-economics`, where the
   department bars specific Barnard courses by name and the file excludes them. No such
   bar appears on the Mathematics page. **What would resolve it:** the department
   planning form's treatment of BC-coded rows.

4. **May a footnote-2 substitute also count as an elective?** The Applied Mathematics
   major on the same page says of its own analogous choice: "Select one of the
   following three courses. **The selected course may not count as an elective.**" The
   plain Mathematics major says nothing. `excludeGroups: ["modern-analysis"]` (§1.5)
   assumes the Applied Math rule generalises, which the 40–42-point total supports.
   **What would resolve it:** the planning form.

5. **`MATH UN3996` and `MATH UN3997`.** Our catalog holds `MATH3996OC` SUPERVISED STUDY
   IN LONDON: MATHEMATICS and `MATH3997UN` SUPERVISED INDIVIDUAL RESEARCH. Both are
   research-shaped and both fall inside the elective selector; neither is named by the
   Bulletin's "do NOT count" sentences, which mention only Supervised Readings and
   Senior Thesis. This dossier does **not** exclude them, because excluding a course
   the Bulletin has not excluded is guessing in the over-restrictive direction. Flagged
   so the decision is visible.

6. **Mathematics-Statistics is published twice and the two pages disagree on units.**
   The Mathematics page says "The major requires 38-43 points"; the Statistics page
   says "The major requires 14 courses". Both list the same courses. Out of scope here,
   but whoever encodes `cc-major-mathematics-statistics` must pick a source and say so
   — and should treat the Mathematics page as primary for the mathematics rows and the
   Statistics page as primary for the statistics rows, since each department maintains
   its own half.

---

## 6. Confidence: 9/10

| rubric item | status |
|---|---|
| Every group traced to a specific URL, rendered text quoted verbatim | ✅ §1, one URL per group, plus the distinct Overview-tab URL for the two exclusion sentences |
| Every footnote marker on every source page resolved and attached | ✅ markers 1, 2, 3 (×2 rows), 4 — §1.1, §1.2/1.3, §1.4, §1.5 |
| Point arithmetic reconciled against the published total, shown | ✅ §2, both endpoints exact |
| Every course code in Bulletin form and checked against our catalog | ✅ all 23 MATH codes named by the proposed rules (18 in positive rules, 5 in the elective `exclude` list) resolve against the live catalog; 72/79 cognates resolve, the 7 misses named in §1.6 |
| Honors/accelerated variants hunted for explicitly | ✅ §1.1 and trap 8 — four entry points found |
| Nine traps each considered with a verdict | ✅ §4 |
| Everything unencodable listed rather than approximated | ✅ §3, twelve items |
| Which file each requirement belongs on, stated | ✅ §1 preamble — all on `cc-major-mathematics.ts`, nothing on `cc-core.ts` |
| Golden records written by hand from the Bulletin | ✅ §7 |

**Why 9 and not 10.** Two judgements in this dossier are inferences from the Bulletin
rather than transcriptions of it, and both are named above: the AP-truncated sequence
alternatives (§5.1) and the elective block's upper number bound (§5.2). Both are
recoverable — the first errs toward *accepting* a complete honors record, the second
toward the Bulletin's literal words — and both are settled by one email to the DUS or
one look at the department's planning form. Neither is a guess dressed as a fact; each
is written down as a decision with its evidence.

**Why not lower.** The arithmetic closes exactly on both endpoints, which independently
validates the sequence reading, the block count and the disjointness assumption; every
footnote is resolved to its attachment row; every in-rule code resolves against the
live catalog; and the elective list is a closed enumeration rather than an invented
numeric floor.

---

## 7. Proposed golden records

Written by hand from the Bulletin. Format matches `GoldenRecord` in
`lib/requirements/golden.ts`. Group ids assume the §1 naming.

### 7.1 `math-honors-ap-sequence` — the regression record

*Who:* Mathematics major with a 5 on the BC exam who began at Honors Mathematics A, so
Calculus I and II are AP credit and appear on no transcript. The honors track the
Overview tab calls "especially designed for mathematics majors".

*Why it is the record that matters:* against a literal transcription of sequence 3 —
`["MATH UN1101","MATH UN1102","MATH UN1207","MATH UN1208"]` and nothing else — this
student reads 2 of 4 and is told to go back and take Calculus I. That is
`cc-major-economics`'s shipped bug, reproduced on the department that owns calculus.

```
taken: [
  "MATH UN1207", "MATH UN1208",
  "MATH GU4041", "MATH GU4042", "MATH GU4061", "MATH GU4062",
  "MATH UN3951",
  "MATH UN3020", "MATH GU4051", "MATH GU4053", "MATH UN3386",
]
```

| group | expected status | expected completed | by hand, from the Bulletin |
|---|---|---|---|
| `calculus-sequence` | `satisfied` | 2 of 2 | Alternative 7 (`UN1207`+`UN1208`) is complete. "13-15 points **including Advanced Placement Credit**." |
| `modern-algebra` | `satisfied` | 2 of 2 | `GU4041` + `GU4042`. |
| `modern-analysis` | `satisfied` | 2 of 2 | `GU4061` + `GU4062`, the un-substituted default. |
| `seminar` | `satisfied` | 1 of 1 | `UN3951`. |
| `electives` | `satisfied` | 12 of 12 points | `UN3020`(3) + `GU4051`(3) + `GU4053`(3) + `UN3386`(3) = 12. None of the four was consumed by another group. |

`expectSatisfiedCount: 5`.

### 7.2 `math-mixed-sequence` — half of one route plus half of another

*Who:* Student who took Calculus I, Calculus II, Accelerated Multivariable Calculus and
Calculus IV. Four calculus courses, twelve points, and no completed sequence — `UN1205`
belongs to route 2 (which needs `UN2010`) and `UN1202` belongs to route 1 (which needs
`UN1201` and `UN2010`).

*Why:* this is the exact schedule `n_of { n: 4 }` would wrongly pass, and it is
buildable — `UN1205` and `UN1202` are both offered and neither excludes the other.

```
taken: ["MATH UN1101", "MATH UN1102", "MATH UN1205", "MATH UN1202"]
```

| group | expected status | by hand |
|---|---|---|
| `calculus-sequence` | `in_progress` | Best alternative is 4 (`UN1101`,`UN1102`,`UN1205`,`UN2010`) at 3/4. Not satisfied — Linear Algebra is missing. Not unmet either: three of four terms are genuinely done. |
| `modern-algebra` | `unmet` | |
| `electives` | `unmet` (0 of 12 points) | `UN1202` and `UN1205` are below the 2000 floor; nothing else qualifies. |

### 7.3 `math-analysis-substituted` — footnote 2 exercised

*Who:* Major not contemplating graduate study who replaced **both** terms of Modern
Analysis, using Analysis and Optimization and Fourier Analysis, as footnote 2 allows.

*Why:* footnote 2 is the MechE-footnote-3 shape on this page. Missing it marks a
complete student incomplete. It also pins the `n_of { n: 2 }` decision: had the block
been left as one `all_of` over four courses, this student reads 2 of 4.

```
taken: [
  "MATH UN1101", "MATH UN1102", "MATH UN1201", "MATH UN1202", "MATH UN2010",
  "MATH GU4041", "MATH GU4042",
  "MATH UN2500", "MATH GU4032",
  "MATH UN3952",
]
```

| group | expected status | expected completed | by hand |
|---|---|---|---|
| `calculus-sequence` | `satisfied` | 5 of 5 | Alternative 1, all five terms, 15 points. |
| `modern-algebra` | `satisfied` | 2 of 2 | |
| `modern-analysis` | `satisfied` | 2 of 2 | Both terms replaced, which footnote 2 permits explicitly. |
| `seminar` | `satisfied` | 1 of 1 | `UN3952` alone satisfies it; the group is `n_of { n: 1 }`, not `all_of`. |
| `electives` | `unmet` | 0 of 12 points | **The load-bearing expectation.** `UN2010`, `GU4041`, `GU4042` were consumed by earlier groups; `UN2500` and `GU4032` were consumed by `modern-analysis`; `UN3952` is excluded by code under footnote 3. This student has taken 34 points toward the major and owes 12 more. An encoding without `excludeGroups` reports this group satisfied and the whole major complete a full year early. |

`expectSatisfiedCount: 4`.

### 7.4 `math-cognate-elective` — the outside-the-department path

*Who:* Major who filled part of the elective block with two approved cognates.

*Why:* it pins the `include` list — a selector of `subjects: ["MATH"]` alone silently
drops every cognate — and it exercises a 4-point cognate, which is why the block is
`points_matching` and not `n_matching`.

```
taken: [
  "MATH UN1101", "MATH UN1102", "MATH UN1201", "MATH UN1202", "MATH UN2010",
  "MATH GU4041", "MATH GU4042", "MATH GU4061", "MATH GU4062",
  "MATH UN3951",
  "COMS W3203", "PHIL UN3411", "MATH UN3007",
]
```

| group | expected status | expected completed | by hand |
|---|---|---|---|
| `calculus-sequence` | `satisfied` | 5 of 5 | |
| `modern-analysis` | `satisfied` | 2 of 2 | `GU4061` + `GU4062`. `UN3007` is *available* as a substitute but is not needed, so it stays in the pool. |
| `electives` | `in_progress` | 11 of 12 points | `COMS W3203`(4) + `PHIL UN3411`(4) + `MATH UN3007`(3) = 11 points. One point short, so this is **not** satisfied. Separately, the student has used 8 credits from outside the department against a 6-credit cap — a rule the audit does not enforce and the note must warn about. |

This last row is deliberately awkward: it is the record that proves the audit reports
points rather than course counts, and it is the one that will catch a transcriber who
writes `n_matching { n: 4 }` instead of `points_matching { points: 12 }`.
