# Electrical Engineering (B.S.)

- **Proposed program id:** `seas-major-electrical-engineering`
- **School:** SEAS (Columbia Engineering) · **Kind:** `major` · **Department:** `Electrical Engineering`
- **Degree points:** 128 (the B.S. total; recorded on `seas-core.degreePoints`, not repeated on the major — matches every other SEAS major file)
- **Bulletin edition:** 2026–2027
- **Primary source URL:** https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/electrical-engineering/undergraduate-programs/electrical-engineering-bs/#degreetracktextcontainer
- **Secondary source (same page, other tab):** …/electrical-engineering-bs/#curriculumtextcontainer
- **Secondary source (Bulletin-hosted PDF chart):** …/electrical-engineering-bs/2026-2027_Engineering_Bulletin_Charts_ELEN.pdf
- **Date researched:** 2026-08-26
- **Confidence: 9/10.** Every group is traced to a quoted line of the Bulletin, all 22 footnote markers across the two grids are resolved and attached, the point arithmetic closes **exactly** on 128, and every course code was resolved against the live catalog (`.env.local` present, Supabase reachable). The one point off ten is not a guess anywhere in the encoding — it is the single genuinely-missing cell described in **Open question 1** (physics sequence 2 has no laboratory printed), which the proposed `n_of` encoding survives without inventing anything, plus the fact that the depth/breadth elective lists live off-Bulletin at `ee.columbia.edu`, which is behind Cloudflare and returned 403 to every fetch. Both are recorded rather than approximated, and both land in `attested` groups.

---

## How this page is published

Like IEOR, MechE and BME, the EE program page publishes **no `sc_courselist` tables at all**. Its Degree Track tab is two `sc_plangrid` eight-semester schedules — *Early-Starting Students* and *Traditional-Starting Students* — that require the **same** courses in a different order. The Curriculum tab is prose only (technical-elective policy, "Starting Early", transfer plans); it contains no course list.

Only one grid should be encoded. The two differ solely in when `ELEN E1201`, the EE core and the third physics term are taken, and the audit has no notion of term ordering — encoding both would produce two byte-identical programs. **Use the Traditional-Starting grid** as the transcription base and note the Early-Starting variant, exactly as `seas-major-mechanical-engineering` does for its Standard / Early Decision tracks. The two grids were diffed cell by cell for this dossier and their *course sets are identical*.

**Footnote digits are fused to course codes.** The rendered cells read `ELEN E30812`, `ELEN E30842`, `APMA E21013`, `ELEN E30832`, `ELEN E30822`, `CSEE W411910`, `ELEN E339011`. Those are `ELEN E3081`, `ELEN E3084`, `APMA E2101`, `ELEN E3083`, `ELEN E3082`, `CSEE W4119`, `ELEN E3390` with markers 2, 2, 3, 2, 2, 10 and 11 stuck to them. Every code below was recovered from the page's `bubblelink` anchor text, not from the rendered digits.

---

## Requirement groups

Group ids and labels follow `seas-major-mechanical-engineering` / `seas-major-operations-research` / `seas-major-biomedical-engineering` conventions.

### 1. `calculus` — "Calculus"

> `MATH UN1101` CALCULUS I
> `MATH UN1102` CALCULUS II
> `APMA E2000` & `APMA E2001` (taken Semester lll or lV) — MULTV. CALC. FOR ENGI ＆ APP SCI

**Rule:** `all_of` — `MATH UN1101`, `MATH UN1102`, `APMA E2000`

**sourceUrl:** …/electrical-engineering-bs/#degreetracktextcontainer

**Note (repo voice):** "All three. APMA E2000 carries a required 0-point recitation, APMA E2001, which is not matched here."

**Footnotes:** none on these cells.

**Catalog resolution:** `MATH UN1101` 3pt ✓, `MATH UN1102` 3pt ✓, `APMA E2000` 4pt ✓, `APMA E2001` 0pt ✓ (named in the note, not required — matching all four sibling SEAS files).

---

### 2. `applied-mathematics` — "Applied Mathematics"

> `APMA E2101`³ INTRO TO APPLIED MATHEMATICS
>
> ³ "APMA E2101 INTRO TO APPLIED MATHEMATICS may be replaced by MATH UN2030 ORDINARY DIFFERENTIAL EQUATIONS (formerly MATH E1210) and either APMA E3101 APPLIED MATH I: LINEAR ALGEBRA or MATH UN2010 LINEAR ALGEBRA."

**Rule:** `sequence_choice` — three alternatives, one course vs. two:

| label | courses |
|---|---|
| `APMA E2101` | `APMA E2101` |
| `MATH UN2030 + APMA E3101` | `MATH UN2030`, `APMA E3101` |
| `MATH UN2030 + MATH UN2010` | `MATH UN2030`, `MATH UN2010` |

**Why not `n_of`.** Trap #1. The branches are one course or two, of different lengths, and flattened to `n_of { n: 1 }` a lone `MATH UN2030` would pass while satisfying nothing; flattened to `n_of { n: 2 }`, `APMA E2101` alone would fail while satisfying everything. This is structurally the same rule MechE encodes, with the branch direction reversed — **MechE prints `APMA E2101` as the branch that costs you extra work; EE prints it as the default and makes the two-course route the one that changes your elective load.** Do not copy MechE's five-branch list here: EE's footnote does **not** offer `MATH UN3027`.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "APMA E2101, or Ordinary Differential Equations together with a linear algebra course. Taking the two-course route reduces your technical elective total from 18 points to 15 — a consequence that depends on how you satisfied this requirement, which this audit cannot represent."

**Catalog resolution:** `APMA E2101` 3pt ✓, `MATH UN2030` 3pt ✓, `APMA E3101` 3pt ✓, `MATH UN2010` 3pt ✓. All four match. `MATH UN1210` (named in the footnote's *"formerly"* parenthetical on the CompE page, not here) is **not** in our catalog and is not encoded.

---

### 3. `physics` — "Physics"

Traditional-Starting grid, Semesters I / II / III:

> Choose one of the following Physics courses depending on track:
> `PHYS UN1401` (Track 1) INTRO TO MECHANICS ＆ THERMO / `PHYS UN1601` (Track 2) PHYSICS I:MECHANICS/RELATIVITY / `PHYS UN2801` (Track 3) ACCELERATED PHYSICS I
> …
> `PHYS UN1402` (Track 1) / `PHYS UN1602` (Track 2) / `PHYS UN2802` (Track 3)
> …
> `PHYS UN1403` (Track 1) INTRO-CLASSCL ＆ QUANTUM WAVES / `PHYS UN2601` (Track 2) PHYSICS III:CLASS/QUANTUM WAVE / `PHYS UN3081` (Track 3) INTERMEDIATE LABORATORY WORK

The Bulletin-hosted PDF prints the same block as an unambiguous 3×4 grid, which is how the row alignment was confirmed:

```
PHYSICS         SEM I          SEM II         SEM III           SEM IV
(three seqs,    UN1401 (3)     UN1402 (3)     UN1403 (3)        Lab UN1494 (3)²
choose one)     UN1601 (3.5)   UN1602 (3.5)   UN2601 (3.5)
                UN2801 (4.5)   UN2802 (4.5)   Lab UN3081 (2)
```

**Rule:** `sequence_choice`

| label | courses |
|---|---|
| Sequence 1 | `PHYS UN1401`, `PHYS UN1402`, `PHYS UN1403` |
| Sequence 2 | `PHYS UN1601`, `PHYS UN1602`, `PHYS UN2601` |
| Sequence 3 | `PHYS UN2801`, `PHYS UN2802` |

**⚠ This differs from three of the four existing SEAS files and the difference is real.** `seas-major-computer-science` and `seas-major-operations-research` both encode physics as **two**-term sequences; EE (like MechE and BME) runs to a **third** term. Copying the CS or IEOR physics group into EE would drop `PHYS UN1403` / `PHYS UN2601` from the degree entirely.

**Sequence 3 is transcribed with two courses, as printed.** Its third-term cell is `PHYS UN3081 INTERMEDIATE LABORATORY WORK` — a *laboratory*, not a lecture — so it belongs in the laboratory group below, and this matches how MechE and BME transcribe their sequence 3 (two courses, no third term). Do **not** put `PHYS UN3081` inside the sequence: that would leave a Track-3 student with the laboratory group permanently unmet.

**No footnote substitution.** MechE's footnote 3 (`EEEB UN2001` / `BIOL UN2005` "or higher" in place of the third physics term) **does not exist on the EE page**. There is no biology alternative anywhere in the EE grid. Do not carry MechE's six-branch physics rule across.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One complete physics sequence — every term of whichever you pick. Sequences 1 and 2 run three terms; the grid gives sequence 3 two lecture terms and a laboratory, and that laboratory is the next requirement."

**Catalog resolution:** all seven codes match — `PHYS UN1401` 3, `UN1402` 3, `UN1403` 3, `UN1601` 3.5, `UN1602` 3.5, `UN2601` 3.5, `UN2801` 4.5, `UN2802` 4.5.

---

### 4. `chemistry` — "Chemistry"

> Choose a one-semester Chemistry lecture:
> `CHEM UN1403` GENERAL CHEMISTRY I-LECTURES / `CHEM UN1404` GENERAL CHEMISTRY II-LECTURES / `CHEM UN2045` INTENSVE ORGANIC CHEMISTRY / `CHEM UN1604` 2ND TERM GEN CHEM (INTENSIVE)

**Rule:** `n_of { n: 1 }` — `CHEM UN1403`, `CHEM UN1404`, `CHEM UN2045`, `CHEM UN1604`

**This list is byte-identical to `seas-major-mechanical-engineering`'s `chemistry` group and to `seas-major-operations-research`'s.** Match it. It is *not* the same as `seas-major-computer-science`'s `chemistry-or-biology` group (`CHEM UN1403` / `EEEB UN2001` / `EEEB UN2005`) — the EE page offers no biology route.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One one-semester chemistry lecture. Unlike the computer science degree, this one offers no biology alternative."

**Footnotes:** none on this cell.

**Catalog resolution:** all four match, all 4pt (`CHEM UN1403`, `CHEM UN1404`, `CHEM UN2045`, `CHEM UN1604`).

---

### 5. `science-laboratory` — "Chemistry or Physics Laboratory"

> `PHYS UN1494` (Track 1)⁴ INTRO TO EXPERIMENTAL PHYS-LAB
> …
> `PHYS UN3081` (Track 3) INTERMEDIATE LABORATORY WORK
>
> ⁴ "Chemistry lab (`CHEM UN1500` GENERAL CHEMISTRY LABORATORY) may be substituted for physics lab, although this is not generally recommended."

**Rule:** `n_of { n: 1 }` — `PHYS UN1494`, `PHYS UN3081`, `CHEM UN1500`

**⚠ Do NOT copy the shared five-course laboratory list.** `seas-major-computer-science` and `seas-major-operations-research` both use `["PHYS UN1494", "PHYS UN3081", "CHEM UN1500", "CHEM UN1507", "CHEM UN3085"]`. **The EE page prints only three of those five.** `CHEM UN1507` and `CHEM UN3085` appear nowhere on the EE page — not in the grid, not in the footnotes, not in the PDF chart. Including them would accept a laboratory the Bulletin has not offered for this degree. Transcribe the three that are printed.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One laboratory. Track 1 takes the physics laboratory; Track 3's laboratory is the third term of its own physics sequence; a footnote allows the general chemistry laboratory instead of the physics one, though the department does not recommend it."

**Catalog resolution:** `PHYS UN1494` 3pt ✓, `PHYS UN3081` 2pt ✓, `CHEM UN1500` 3pt ✓.

**See Open question 1** — the Bulletin prints no laboratory cell at all on the Track 2 row.

---

### 6. `engineering-foundations` — "Engineering Foundations"

> `ENGI E1006` (taken Semester l, ll, lll, or lV)² INTRO TO COMP FOR ENG/APP SCI
> `ENGI E1102` (taken Semester l or ll) THE ART OF ENGINEERING
> `ELEN E1201` (taken Semester l or ll)¹ INTRO-ELECTRICAL ENGINEERING
>
> ¹ "Transfer students and 3-2 Combined Plan students who have not taken ELEN E1201 INTRO-ELECTRICAL ENGINEERING prior to the junior year are expected to have taken a roughly equivalent course when they start ELEN E3201 CIRCUIT ANALYSIS."
> ² "ENGI E1006 INTRO TO COMP FOR ENG/APP SCI may not be offered every semester. See ee.columbia.edu for more discussion about the Computer Science sequences."

**Rule:** `all_of` — `ENGI E1006`, `ENGI E1102`, `ELEN E1201`

This is the **same three-course shape `seas-major-biomedical-engineering` already uses**, and it is deliberate. `ENGI E1006` is required by name with *no* alternative on the EE page (unlike MechE, which offers `COMS W1004` / `COMS W1005`, and unlike IEOR, whose footnote offers `COMS W1004`). Footnote 2 gestures at "the Computer Science sequences" but names no substitute course, so none is encoded — trap #4.

**`ECON UN1105` belongs on `seas-core`, not here.** The EE grid prints `ECON UN1105 & ECON UN1155` in its Required Nontechnical Electives block, which is `seas-core`'s `principles-of-economics` group. Repeating it is exactly the duplication removed from three major files on 2026-08-24 (trap #7).

**`ENGI E1102` belongs HERE, not on `seas-core`.** It is required of every engineering student and the SEAS first-year page says so, but it is encoded per-major on purpose so no course is held in two independently-evaluated places. All four existing SEAS majors do it this way.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "Computing, The Art of Engineering, and Introduction to Electrical Engineering. The EE page names ENGI E1006 with no alternative. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here. ELEN E1201 is described as essential preparation for the EE core; transfer students who arrive without it must take it in the junior year."

**Catalog resolution:** `ENGI E1006` 3pt ✓, `ENGI E1102` ✓ (points null in our catalog; the Bulletin says 4), `ELEN E1201` 3.5pt ✓.

---

### 7. `probability` — "Probability"

> `IEOR E3658` or `STAT GU4203` (taken Semester V, Vl, Vll, or Vlll)⁶ PROBABILITY FOR ENGINEERS
>
> ⁶ "Some of these courses are not offered both semesters. Students with an adequate background can take some of these courses in the sophomore year. A course such as `STAT GU4001` INTRODUCTION TO PROBABILITY AND STATISTICS cannot generally be used to replace `IEOR E3658` PROBABILITY FOR ENGINEERS or `STAT GU4203` PROBABILITY THEORY."

**Rule:** `n_of { n: 1 }` — `IEOR E3658`, `STAT GU4203`

**Trap #4 / trap #8 verdict.** `STAT GU4001` is named on this page **only to say it does not count**, and it is named for EE with the hedge "cannot *generally* be used". It is deliberately NOT in the list. Contrast the Computer Engineering page, which allows it — see that dossier. Do not unify the two.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One of the two. The Bulletin says explicitly that STAT GU4001 cannot generally replace either of them."

**Catalog resolution:** `IEOR E3658` 3pt ✓, `STAT GU4203` 3pt ✓. (`STAT GU4001` 3pt is in our catalog but is not encoded, by design.)

---

### 8. `data-structures` — "Data Structures"

> Choose one of the following Other Required Courses (taken Semester V, Vl, Vll, or Vlll):⁷
> `COMS W3136` ESSENTIAL DATA STRUCTURES / `COMS W3134` Data Structures in Java / `COMS W3137` HONORS DATA STRUCTURES ＆ ALGOL
>
> ⁷ "Some of these courses are not offered both semesters. Students with an adequate background can take some of these courses in the sophomore year. Students who plan to minor in Computer Science should choose `COMS W3134` Data Structures in Java or `COMS W3137` HONORS DATA STRUCTURES & ALGORITHMS."

**Rule:** `n_of { n: 1 }` — `COMS W3136`, `COMS W3134`, `COMS W3137`

**Honors variant hunted and present:** `COMS W3137` is the honors course and it is in the list (trap #8).

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One of the three. COMS W3137 is the honors course; a footnote advises anyone planning the computer science minor to take COMS W3134 or COMS W3137 rather than COMS W3136. COMS W3137 is offered by the Bulletin but is not in our catalog, so it will not match automatically."

**Catalog resolution:** `COMS W3136` 4pt ✓, `COMS W3134` 3pt ✓, **`COMS W3137` MISSING from our catalog** — kept anyway (trap #9). Our catalog covers four terms and the honors section did not run in any of them.

---

### 9. `ee-core` — "Electrical Engineering Core"

> `ELEN E3201` CIRCUIT ANALYSIS · `ELEN E3801` SIGNALS AND SYSTEMS · `ELEN E3331` ELECTRONIC CIRCUITS · `CSEE W3827` FUNDAMENTALS OF COMPUTER SYSTS · `ELEN E3106` SOLID STATE DEVICES-MATERIALS · `ELEN E3401` ELECTROMAGNETICS

**Rule:** `all_of` — `ELEN E3201`, `ELEN E3801`, `ELEN E3331`, `CSEE W3827`, `ELEN E3106`, `ELEN E3401`

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "All six. These are the lecture half of the EE core; the laboratories that pair with them are the next requirement."

**Catalog resolution:** all six match — `ELEN E3201` 3.5, `ELEN E3801` 3.5, `ELEN E3331` 3, `CSEE W3827` 3, `ELEN E3106` 3.5, `ELEN E3401` 4.

**Transcription trap:** the Bulletin's own PDF chart prints this course as **`CSEE E3827`**; the HTML grid and the registrar both use **`CSEE W3827`**. Use `CSEE W3827`.

---

### 10. `communications-or-networks` — "Communications or Networks"

> `ELEN E3701` or `CSEE W4119`¹⁰ INTRO TO COMMUNICATION SYSTEMS
>
> ¹⁰ "These courses can be taken in the sophomore year if the prerequisites/corequisites are satisfied."

**Rule:** `n_of { n: 1 }` — `ELEN E3701`, `CSEE W4119`

Kept as its own group rather than folded into `ee-core`, because `ee-core` is an `all_of` and this cell is a choice.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One of the two."

**Catalog resolution:** `ELEN E3701` 3pt ✓, `CSEE W4119` 3pt ✓.

---

### 11. `ee-laboratories` — "Electrical Engineering Laboratories"

> `ELEN E3081`⁵ CIRCUIT ANALYSIS LABORATORY · `ELEN E3084`⁵ SIGNALS ＆ SYSTEMS LABORATORY · `ELEN E3083`⁵ ELECTRONIC CIRCUITS LABORATORY · `ELEN E3082`⁵ DIGITAL SYSTEMS LABORATORY · `ELEN E3043` SOLID ST,MICROWAVE,FBR OPT LAB
>
> ⁵ "If possible, these labs should be taken along with their corresponding lecture courses."

**Rule:** `all_of` — `ELEN E3081`, `ELEN E3082`, `ELEN E3083`, `ELEN E3084`, `ELEN E3043`

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "All five. The first four pair with the core lecture courses and the Bulletin asks that you take them in the same term where possible."

**Catalog resolution:** `ELEN E3081` 1pt ✓, `ELEN E3082` 1pt ✓, `ELEN E3083` 1pt ✓, `ELEN E3084` 1pt ✓, `ELEN E3043` 3pt ✓.

---

### 12. `senior-design` — "Engineering Practice and Senior Design"

> `ELEN E3399` ELECTRICAL ENGINEERING PRACTICE
> `ELEN E3390`¹¹ EE SENIOR DESIGN PROJECT
>
> ¹¹ "The capstone design course provides ELEN majors with a 'culminating design experience.' As such, it should be taken near the end of the program and involve a project that draws on material from a range of courses. If special arrangements are made in `ELEN E3399` ELECTRICAL ENGINEERING PRACTICE, it is possible to use courses such as `ELEN E3998` PROJECTS IN ELEC ENGINEERING, `ELEN E4350` VLSI design laboratory, `ELEN E4998` INTERMEDIATE PROJECTS, `EECS E4340` COMPUTER HARDWARE DESIGN, or `CSEE W4840` EMBEDDED SYSTEMS in place of `ELEN E3390` EE SENIOR DESIGN PROJECT."

**Rule:** `all_of` — `ELEN E3399`, `ELEN E3390`

**Footnote 11 is deliberately NOT encoded as a `sequence_choice`.** It is a *conditional* substitution — "if special arrangements are made in ELEN E3399" — i.e. permission granted inside another course, plus a hedged list ("courses **such as**"). Trap #4: "such as" is an open-ended list and the condition is an advisor's arrangement. Both are outside the rule language. Recorded verbatim in the note.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "Both. With special arrangements made inside ELEN E3399, the Bulletin allows courses such as ELEN E3998, ELEN E4350, ELEN E4998, EECS E4340 or CSEE W4840 in place of the senior design project — a substitution that depends on an arrangement no course record shows, so it is not checked. Tick it with your adviser if that is your route."

**Catalog resolution:** `ELEN E3399` 1pt ✓, `ELEN E3390` 3pt ✓. Of the substitutes named in the footnote: `ELEN E3998` ✓, `ELEN E4998` ✓, `EECS E4340` ✓ (points null), `CSEE W4840` ✓, **`ELEN E4350` MISSING from our catalog**. None are encoded.

---

### 13. `technical-electives` — "Technical Electives"

Degree Track rows:

> "EE Depth Tech Electives: At least two technical electives in one depth area. (taken Semester V, Vl, Vll, or Vlll)⁸ — The four depth areas are: (a) photonics, solid-state devices, and electromagnetics; (b) circuits and electronics; (c) signals and systems; (d) communications and networking"
> "Breadth Tech Electives (at least 6 points total) (taken Semester V, Vl, Vll, or Vlll):⁹ At least two technical electives outside the chosen depth area; must be courses with significant engineering content"
> "Other Tech Electives: Additional technical electives as required to bring the total points of technical electives to 18 (taken Semester V, Vl, Vll, or Vlll)¹⁰"
>
> ⁸ "For details, see ee.columbia.edu." ⁹ "See ee.columbia.edu."
> ¹⁰ "Consisting of more depth or breadth courses, or further options listed at ee.columbia.edu/ee-undergraduate-program. The total points of technical electives is reduced to 15 if `APMA E2101` INTRO TO APPLIED MATHEMATICS has been replaced by `MATH UN2030` ORDINARY DIFFERENTIAL EQUATIONS (formerly MATH E1210) and either `APMA E3101` APPLIED MATH I: LINEAR ALGEBRA or `MATH UN2010` LINEAR ALGEBRA. Combined-plan students with good grades in separate, advanced courses in linear algebra and ODEs can also apply for this waiver, but the courses must have been at an advanced level for this to be considered."

Curriculum tab, in full:

> "The 18-point technical elective requirement for the electrical engineering program consists of three components: depth, breadth, and other. A general outline is provided here, and more specific course restrictions can be found at ee.columbia.edu. For any course not clearly listed there, adviser approval is necessary. … Any remaining technical elective courses, beyond the minimum 12 points of depth and breadth, do not have to be engineering courses but must be technical. Generally, math and science courses that do not overlap with courses used to fill other requirements are allowed. … Electrical engineering technical electives must also be 3000 level or above and must not have significant overlap with other courses taken for the major."

**Rule:** `attested` — one group covering all three components.

**Why `attested` and not `points_matching`.** Every one of the three components fails the selector test, and they fail it in different ways:
- **Depth** requires "at least two technical electives in *one* depth area". The four areas are named as *prose topic labels*, not course lists; the governing lists are published at `ee.columbia.edu`, which is off-Bulletin. Worse, "one depth area" is a constraint *across* the student's chosen set, which the rule language cannot express at all (the same shape as economics' "no more than one 2000-level elective").
- **Breadth** requires two courses "outside the chosen depth area" — a predicate whose meaning depends on which area the depth block settled on. `excludeGroups` cannot express "outside the topical area of", only "not the specific courses that group consumed".
- **Other** brings the total to 18 (or 15), which is the checkable half — but IEOR's precedent applies exactly: checking a floor while the ceiling stays unchecked reports a group satisfied at 6 of 18.

This is the same call `seas-major-operations-research` made for a structurally identical rule, and for the same stated reason.

**Departmental site was unreachable.** `https://www.ee.columbia.edu/ee-undergraduate-program` returns HTTP 403 behind Cloudflare to curl and to WebFetch. The depth-area course lists could not be retrieved for this dossier. This does not change the encoding — even with the lists in hand the "one depth area" and "outside the chosen depth area" constraints stay unencodable — but it does mean the note cannot enumerate them.

**sourceUrl:** …#curriculumtextcontainer (the prose is on the Curriculum tab; the grid rows are on the Degree Track tab — cite Curriculum, as BME does for its elective groups)

**Note (repo voice):** "18 points, in three parts: at least 6 points of depth (two courses in one of four areas — photonics/solid-state/electromagnetics, circuits and electronics, signals and systems, or communications and networking), at least 6 points of breadth (two courses outside your depth area, with significant engineering content), and the rest technical but not necessarily engineering. All must be at the 3000 level or above and must not overlap significantly with other courses taken for the major. The total drops to 15 points if you replaced APMA E2101 with Ordinary Differential Equations plus linear algebra. The approved course lists for each depth area are published at ee.columbia.edu rather than in the Bulletin, and 'one depth area' is a constraint across your whole set of choices, so this one is yours to confirm."

---

## Point arithmetic

Published total: **128 points for the B.S.** (SEAS, "First Year/Sophomore Program" page: *"Music instruction and performance courses do not count toward the 128 points of credit required for a B.S. degree"*). The EE page publishes **no per-block total of its own**; the PDF chart's per-semester "TOTAL POINTS" line carries the footnote *"'Total points' assumes that 20 points of nontechnical electives and other courses are included"*, so those numbers are illustrative scheduling sums, not requirement arithmetic. The reconciliation below is therefore against the degree total.

Baseline branch: physics sequence 1, `APMA E2101` route, `CHEM UN1403` (4), `PHYS UN1494` lab (3), `COMS W3136` (4), `ELEN E3701` (3).

| Block | File | Points |
|---|---|---|
| `calculus` — UN1101 3 + UN1102 3 + APMA E2000 4 | major | 10 |
| `applied-mathematics` — APMA E2101 | major | 3 |
| `physics` — UN1401 3 + UN1402 3 + UN1403 3 | major | 9 |
| `chemistry` — CHEM UN1403 | major | 4 |
| `science-laboratory` — PHYS UN1494 | major | 3 |
| `engineering-foundations` — E1006 3 + E1102 4 + E1201 3.5 | major | 10.5 |
| `probability` — IEOR E3658 | major | 3 |
| `data-structures` — COMS W3136 | major | 4 |
| `ee-core` — 3.5+3.5+3+3+3.5+4 | major | 20.5 |
| `communications-or-networks` — ELEN E3701 | major | 3 |
| `ee-laboratories` — 1+1+1+1+3 | major | 7 |
| `senior-design` — E3399 1 + E3390 3 | major | 4 |
| `technical-electives` | major | 18 |
| **Major subtotal** | | **99.0** |
| List A nontechnical — ENGL CC1010 3 + sequence 6–8 + Art/Music Hum 3–4 + ECON UN1105 4 | `seas-core` | 16–19 |
| List B nontechnical electives | `seas-core` | 9–11 |
| *(the two above are capped by the Bulletin at a combined 27)* | | **27** |
| Physical education — two terms at 1 point | `seas-core` | 2 |
| **TOTAL** | | **128.0** ✓ |

**It closes exactly.** And the branch check confirms the transcription independently: taking the two-course applied-mathematics route adds 3 points (`MATH UN2030` + linear algebra = 6 instead of 3) and footnote 10 *simultaneously* drops the technical electives from 18 to 15. Net change: zero. The Bulletin's two numbers are engineered to compensate, which is strong evidence both were read correctly.

Other branches land at 127.0 (sequence 3: `PHYS UN2801` 4.5 + `UN2802` 4.5 + `PHYS UN3081` lab 2 = 11 against sequence 1's 12) to 129.5 (sequence 2 at 10.5 for three terms plus the 3-point lab). 128 is a floor, several blocks are published as point *ranges*, and the residual is absorbed by elective points — so the ±1.5 spread is expected and is not evidence of a missing block.

**No arithmetic mismatch found, therefore no lost CourseLeaf label suspected in the EE blocks** (trap #5) — with one exception, recorded as Open question 1, where the missing thing is a *cell*, not a label, and costs 0 points because the Track-2 student takes the same 3-point laboratory either way.

---

## Which file each requirement belongs on

| Requirement | File | Why |
|---|---|---|
| `ENGL CC1010` University Writing | `seas-core` | shared by every SEAS degree |
| Lit Hum / CC / Global Core sequence | `seas-core` | shared; `core-sequence` group |
| Art or Music Humanities | `seas-core` | shared |
| **`ECON UN1105` Principles of Economics** | **`seas-core` only** | printed on the EE grid but already `principles-of-economics`; duplicating it is trap #7 — the exact bug removed from three files on 2026-08-24 |
| `ECON UN1155` recitation | neither | 0-point recitation welded with `&`; named in a note, never required |
| Nontechnical electives (List B, 9–11 pts) | `seas-core` | `attested` there |
| Physical education | `seas-core` | `n_matching` over PHED |
| **`ENGI E1102` The Art of Engineering** | **this major file only** | required of every engineering student, but encoded per-major so no course lives in two independently-evaluated groups |
| Math, physics, chemistry, laboratory, computing | this major file | `seas-core` explicitly delegates them — trap #2 |
| Everything ELEN / CSEE / COMS / IEOR above | this major file | |

---

## Not encodable

1. **The depth constraint.** *"At least two technical electives in one depth area. The four depth areas are (a) photonics, solid-state devices, and electromagnetics; (b) circuits and electronics; (c) signals and systems; and (d) communications and networking."* — "one depth area" is a constraint over the student's chosen set, and the areas are topic labels whose course lists live at `ee.columbia.edu`.
2. **The breadth constraint.** *"At least two technical electives outside the chosen depth area; must be courses with significant engineering content."* — predicate defined relative to how another requirement was satisfied. `excludeGroups` excludes *courses*, not *topical areas*.
3. **The conditional elective total.** *"The total points of technical electives is reduced to 15 if APMA E2101 has been replaced by MATH UN2030 and either APMA E3101 or MATH UN2010."* — a requirement whose size depends on how a different requirement was satisfied. Same shape as MechE's "students who take APMA E2101 must complete an additional 3-point course".
4. **The combined-plan waiver.** *"Combined-plan students with good grades in separate, advanced courses in linear algebra and ODEs can also apply for this waiver, but the courses must have been at an advanced level for this to be considered."* — transfer-credit equivalency plus a grade minimum plus a petition. Three things the language refuses at once.
5. **The capstone substitution.** *"If special arrangements are made in ELEN E3399, it is possible to use courses such as ELEN E3998, E4350, E4998, EECS E4340, or CSEE W4840 in place of ELEN E3390."* — conditional on an arrangement inside another course, and "such as" is an open list (trap #4).
6. **Term ordering.** Every cell carries "(taken Semester l, ll, lll, or lV)" or similar. The audit has no notion of term ordering.
7. **Transfer Plan 1 / Plan 2.** *"Plan 1: Students coming to Columbia without having taken the equivalent of ELEN E1201 must take this course in their junior year. This requires postponing the core courses in circuits and electronics until the senior year, and thus does not allow taking electives in that area; thus, such students cannot choose circuits and electronics as a depth area."* — transfer-credit equivalency plus an ordering-derived restriction on a depth area that is itself unencodable.
8. **`ELEN E3990` FIELDWORK.** From the department's course listing: *"May not be used as technical or nontechnical electives or to satisfy any other Electrical Engineering or Computer Engineering major requirements. May not be taken for pass/fail credit or audited."* Since the elective blocks are `attested`, there is nothing to exclude it *from*; worth a line in the technical-elective note.
9. **`APMA E2001` / `ECON UN1155`.** 0-point recitations welded to their lecture with an ampersand. Named in notes, never required — matching all four sibling SEAS files.
10. **AP credit.** The SEAS page allows AP to satisfy `ECON UN1105` and up to 16 points generally, leaving no course on a record. Already noted on `seas-core`.

---

## Open questions

1. **Physics sequence 2 has no laboratory printed anywhere on the EE page.** *(Most important open question for this program.)* The grid labels the physics laboratory `PHYS UN1494 (Track 1)`, and the PDF chart's row alignment confirms it — `Lab UN1494 (3)` sits on the sequence-1 row, `Lab UN3081 (2)` on the sequence-3 row, and **the sequence-2 row's laboratory cell is empty**. Two readings: (a) a cell was lost — the Computer Engineering page, whose physics block is otherwise identical, explicitly gives Track 2 the *same* option as Track 1 (*"Lab UN1494 (3) or chem. lab UN1500 (3)"* on the Track-2 row), which is strong evidence this is what EE means too; (b) sequence-2 students are genuinely expected to use the chemistry-laboratory footnote. **Either way the proposed `n_of { n: 1 }` over `PHYS UN1494` / `PHYS UN3081` / `CHEM UN1500` is correct and safe** — it accepts every course any track could use and invents nothing. What would resolve it: the EE undergraduate program checklist at `ee.columbia.edu` (403 to every automated fetch), or a direct question to the EE department.
2. **The honors calculus sequence.** No SEAS degree track prints `MATH UN1207`/`UN1208` (Honors Mathematics A/B) or `MATH UN1201`/`UN1205` as alternatives to `MATH UN1101`+`UN1102`+`APMA E2000`, yet SEAS students on the honors track exist and all four of those courses are in our catalog. This is exactly the shape of the `cc-major-economics` honors bug (trap #8) — except that here the Bulletin genuinely does not publish an alternative, so encoding one would be a guess. Transcribed as printed; flagged because a SEAS honors-calculus student *will* see a red requirement. What would resolve it: a SEAS-wide advanced-placement/equivalency table, or the EE checklist.
3. **The depth-area course lists.** Published only at `ee.columbia.edu`, which is Cloudflare-protected. Does not affect the encoding (the block is `attested` regardless), but the note cannot name the courses.
4. **Early-Starting vs Traditional-Starting.** Diffed cell by cell; the course sets are identical and only the terms move. Recorded as a comment rather than a second program, following the MechE precedent. Worth one re-check by whoever transcribes.

---

## The nine traps — verdicts

1. **`sequence_choice` vs `n_of { n: 2 }`.** Two groups need it: `physics` (three parallel sequences, mixing terms is a buildable schedule that satisfies nothing) and `applied-mathematics` (one course vs. two, so the branches are atomic and of different lengths). Both are `sequence_choice`.
2. **Delegated blocks.** The whole point of this dossier. `seas-core` carries only the 27-point nontechnical Core; math, physics, chemistry, laboratory, computing and `ENGI E1102` are all below, read off the full Degree Track grid rather than a "Major Requirements" block — the EE page has no such block.
3. **Footnotes.** All 22 markers (11 on each of the two grids) are resolved and attached above. The EE page has **no** biology-substitution footnote; MechE's footnote 3 must not be carried across.
4. **"Or higher" / open-ended.** Three found: *"courses such as ELEN E3998, E4350…"* (capstone), *"STAT GU4001 cannot **generally** be used"* (probability), *"further options listed at ee.columbia.edu"* (electives). None guessed at; all recorded verbatim.
5. **CourseLeaf eats labels.** Suspected once and checked: the arithmetic closes at exactly 128, so no block is missing. The one genuinely absent thing is a *cell* (sequence 2's laboratory, Open question 1), which costs 0 points and so could not have been caught by arithmetic — it was caught by comparing against the Computer Engineering page.
6. **Reconcile the arithmetic.** Done above: 99.0 (major) + 27 (nontechnical) + 2 (PE) = 128.0 exactly. The applied-mathematics branch and the elective-total footnote compensate to zero, which independently confirms both readings.
7. **Duplicated requirements.** `ECON UN1105` stays on `seas-core` **only**. `ENGI E1102` goes on this file **only**. Stated in the table above.
8. **Honors / accelerated.** Hunted in every group: physics sequence 3 (`PHYS UN2801`/`UN2802`, Accelerated Physics) ✓ encoded; chemistry's intensive variants (`CHEM UN1604`, `CHEM UN2045`) ✓ encoded; data structures honors (`COMS W3137`) ✓ encoded; probability's higher course (`STAT GU4203`) ✓ encoded. The one gap is honors calculus — Open question 2.
9. **Courses the Bulletin names that our catalog lacks.** Two: **`COMS W3137`** (in the `data-structures` group — keep it, note it) and **`ELEN E4350`** (only inside footnote 11's unencodable substitution list — not encoded at all). Everything else in every proposed group resolves. `MATH UN1210` and `SIEO W3600` are also missing from our catalog but appear only on the Computer Engineering page, not this one.

---

## Proposed golden records

Written by hand from the Bulletin. Expected outcomes stated per group.

### `ee-track3-physics-and-lab`
**Who:** EE student on the accelerated physics track — `PHYS UN2801`, `PHYS UN2802`, and `PHYS UN3081` as their laboratory.
**Why it is hard:** the third cell of the sequence-3 physics row is a *laboratory*, not a lecture. Encode it inside the physics sequence and the student's laboratory group is permanently unmet; encode the laboratory from the sibling SEAS files' five-course list and it works but accepts two courses (`CHEM UN1507`, `CHEM UN3085`) the EE page never prints. This record pins both halves.
**taken:** `PHYS UN2801`, `PHYS UN2802`, `PHYS UN3081`, `MATH UN1101`, `MATH UN1102`, `APMA E2000`, `CHEM UN1403`
**expect:**
- `physics` → **satisfied**, completed 2 (Sequence 3 is two courses)
- `science-laboratory` → **satisfied**, completed 1
- `calculus` → **satisfied**, completed 3
- `chemistry` → **satisfied**, completed 1
- `applied-mathematics` → **unmet**

### `ee-mixed-physics-sequence`
**Who:** EE student who took `PHYS UN1401` (sequence 1, term 1) and `PHYS UN1602` (sequence 2, term 2).
**Why it is hard:** trap #1 from the failing side. Two terms of physics done, no sequence started properly. As `n_of { n: 2 }` this passes; it must read **in progress**, and it must not read *unmet* either — the student has genuinely done a term.
**taken:** `PHYS UN1401`, `PHYS UN1602`
**expect:**
- `physics` → **in_progress**, completed 1 (the evaluator reports the alternative the student is furthest into: 1 of 3)

### `ee-ode-route-and-comms-choice`
**Who:** EE student who replaced `APMA E2101` with `MATH UN2030` + `MATH UN2010`, and satisfied the communications requirement with `CSEE W4119` rather than `ELEN E3701`.
**Why it is hard:** the applied-mathematics footnote is a one-course-vs-two branch, so `all_of ["APMA E2101"]` marks this complete student incomplete and `n_of { n: 1 }` over the union would pass a lone `MATH UN2030`. Also pins that the communications cell is a genuine either/or, not two required courses.
**taken:** `MATH UN2030`, `MATH UN2010`, `CSEE W4119`, `ENGI E1006`, `ENGI E1102`, `ELEN E1201`
**expect:**
- `applied-mathematics` → **satisfied**, completed 2
- `communications-or-networks` → **satisfied**, completed 1
- `engineering-foundations` → **satisfied**, completed 3
- `technical-electives` → **unmet** (attested, unticked — and note the Bulletin has just reduced this student's target to 15 points, which the audit cannot see)
