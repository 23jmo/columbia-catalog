# Computer Engineering (B.S.)

- **Proposed program id:** `seas-major-computer-engineering`
- **School:** SEAS (Columbia Engineering) · **Kind:** `major` · **Department:** `Computer Engineering Program`
- **Degree points:** 128 (the B.S. total; recorded on `seas-core.degreePoints`, not repeated on the major)
- **Bulletin edition:** 2026–2027
- **Primary source URL:** https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-engineering-program/undergraduate-programs/computer-engineering-bs/#degreetracktextcontainer
- **Secondary source (same page, other tab):** …/computer-engineering-bs/#curriculumtextcontainer
- **Secondary source (department node):** https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/computer-engineering-program/
- **Secondary source (Bulletin-hosted PDF chart):** …/computer-engineering-bs/2026-2027_Engineering_Bulletin_Charts_CMEN.pdf
- **Date researched:** 2026-08-26
- **Confidence: 9/10.** Every group is traced to a quoted line, all 10 footnote markers across the two grids are resolved and attached, every course code was checked against the live catalog (Supabase reachable), the honors variants were hunted group by group, and the point arithmetic reconciles to 128 within the published point ranges. The point off ten is **Open question 1** — the laboratory is printed in two different rows of the chart and it takes a judgement call (supported by the arithmetic, by the sibling EE page and by every other SEAS degree) to read it as one requirement rather than two. The technical-elective policy is departmental prose with no course list anywhere, and `compeng.columbia.edu` is Cloudflare-protected and returned 403 to every fetch.

---

## Is this one program, or a track inside another? — **One program.**

The Bulletin gives Computer Engineering its own **department-level node**, `academic-departments-programs/computer-engineering-program/`, a sibling of Electrical Engineering and Computer Science rather than a child of either. That node has its own Undergraduate Programs index containing exactly one degree, `computer-engineering-bs/`.

The department page states, verbatim:

> "Administered by both the Electrical Engineering and Computer Science Departments through a joint Computer Engineering Committee. **Student records are kept in the Electrical Engineering Department.**"
> "The computer engineering program is run jointly by the Computer Science and Electrical Engineering departments. It offers both B.S. and M.S. degrees."
> "Students in the programs have two 'home' departments. The Electrical Engineering Department maintains student records and coordinates advising appointments."

**Do the EE and CS department pages agree?** Yes, and neither claims it. Both list "Computer Engineering Program" in their sibling navigation and neither lists a computer-engineering degree under its own Undergraduate Programs index (EE lists only *Electrical Engineering (BS)* and *Electrical Engineering (BS/MS)*; CS lists only *Computer Science (BS)*). The EE department page adds:

> "The Electrical Engineering Department, along with the Computer Science Department, also offers B.S. and M.S. programs in computer engineering. Details on those programs can be found in the **Computer Engineering section in this bulletin**."

Both pages defer to the same third page. There is **no disagreement to record**, and no split of requirements across the EE and CS pages — the whole degree is published on the Computer Engineering page and nowhere else.

**Consequence for the encoding:** `department: "Computer Engineering Program"` and a `sourceUrl` on the Computer Engineering page. It is not a track of `seas-major-electrical-engineering` and it must not inherit that file's groups: the two degrees differ in physics (three terms vs. two), probability (EE forbids `STAT GU4001`, CompE allows it), computing (CompE adds `COMS W1004`/`W1007` and `COMS W3203` on top of `ENGI E1006`), the EE-lab set (CompE has four labs, EE five), the capstone (CompE has none) and the elective total (15 vs. 18).

---

## How this page is published

Two `sc_plangrid` eight-semester schedules on the Degree Track tab — *Early Starting Students* and *Late Starting Students* — plus prose-only Curriculum and department tabs. **No `sc_courselist` tables**, so the tested CourseLeaf parser returns nothing and every group below was read by hand.

The two grids were diffed cell by cell: **the course sets are identical**; only the terms move. Encode one (the Late-Starting grid carries the points column, which is useful for the arithmetic) and record the other as a comment, exactly as MechE does for its two tracks.

**Footnote digits fused to codes:** the rendered cells read `APMA E21012`, `IEOR E36583`, `ELEN E30814`, `ELEN E30844`, `ELEN E30834`, `ELEN E30824`, `COMS W32616`. Those are `APMA E2101`, `IEOR E3658`, `ELEN E3081`, `ELEN E3084`, `ELEN E3083`, `ELEN E3082`, `COMS W3261` with markers 2, 3, 4, 4, 4, 4 and 6. All codes below were recovered from the page's `bubblelink` anchor text.

---

## Requirement groups

### 1. `calculus` — "Calculus"

> `MATH UN1101` CALCULUS I · `MATH UN1102` CALCULUS II · `APMA E2000` & `APMA E2001` (taken Semester III or IV) MULTV. CALC. FOR ENGI ＆ APP SCI

**Rule:** `all_of` — `MATH UN1101`, `MATH UN1102`, `APMA E2000`

**Note (repo voice):** "All three. APMA E2000 carries a required 0-point recitation, APMA E2001, which is not matched here."

**sourceUrl:** …#degreetracktextcontainer · **Footnotes:** none on these cells.

**Catalog:** `MATH UN1101` 3 ✓, `MATH UN1102` 3 ✓, `APMA E2000` 4 ✓, `APMA E2001` 0 ✓ (noted, not required).

---

### 2. `applied-mathematics` — "Applied Mathematics"

> `APMA E2101`² INTRO TO APPLIED MATHEMATICS
>
> ² "APMA E2101 INTRO TO APPLIED MATHEMATICS may be replaced by `MATH UN2030` ORDINARY DIFFERENTIAL EQUATIONS (formerly `MATH UN1210` ORDINARY DIFFERENTIAL EQUATION) and either `APMA E3101` APPLIED MATH I: LINEAR ALGEBRA, or `MATH UN2010` LINEAR ALGEBRA, **or `COMS W3251` COMPUTATIONAL LINEAR ALGEBRA**."

**Rule:** `sequence_choice` — four alternatives:

| label | courses |
|---|---|
| `APMA E2101` | `APMA E2101` |
| `MATH UN2030 + APMA E3101` | `MATH UN2030`, `APMA E3101` |
| `MATH UN2030 + MATH UN2010` | `MATH UN2030`, `MATH UN2010` |
| `MATH UN2030 + COMS W3251` | `MATH UN2030`, `COMS W3251` |

**⚠ This is one branch WIDER than the identical-looking footnote on the EE page.** EE's footnote 3 offers only `APMA E3101` or `MATH UN2010`; Computer Engineering adds `COMS W3251`. The two footnotes read almost word for word the same and they are not the same rule. Transcribe each page's own version — this is the same class of mistake as the SEAS-vs-College calculus table.

**Why `sequence_choice`.** Trap #1: one course versus two, so the branches are atomic and of different lengths. `n_of` cannot express that in either direction.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "APMA E2101, or Ordinary Differential Equations together with a linear algebra course. Taking the two-course route reduces your technical elective total from 15 points to 12 — a consequence that depends on how you satisfied this requirement, which this audit cannot represent. COMS W3251 is offered by the Bulletin but is not in our catalog, so branches using it will not match automatically."

**Catalog:** `APMA E2101` 3 ✓, `MATH UN2030` 3 ✓, `APMA E3101` 3 ✓, `MATH UN2010` 3 ✓, **`COMS W3251` MISSING** (kept anyway — `seas-major-operations-research` and `seas-major-computer-science` both keep it for the same reason), **`MATH UN1210` MISSING** (a *"formerly"* parenthetical, not an option — do **not** encode it).

---

### 3. `physics` — "Physics"

> Choose one of the following Physics courses depending on track:
> `PHYS UN1401` (Track 1) / `PHYS UN1601` (Track 2) / `PHYS UN2801` (Track 3)
> …
> `PHYS UN1402` (Track 1) / `PHYS UN1602` (Track 2) / `PHYS UN2802` (Track 3)

**Rule:** `sequence_choice`

| label | courses |
|---|---|
| Sequence 1 | `PHYS UN1401`, `PHYS UN1402` |
| Sequence 2 | `PHYS UN1601`, `PHYS UN1602` |
| Sequence 3 | `PHYS UN2801`, `PHYS UN2802` |

**⚠ Two terms, not three — and this is the single biggest difference from the EE page.** `PHYS UN1403` and `PHYS UN2601` appear **nowhere** on the Computer Engineering page; they are not in the grid, not in the PDF chart, and not among the page's `bubblelink` course anchors. Where EE puts a third physics lecture in the sequence's third slot, Computer Engineering puts the *laboratory* there. Copying EE's or MechE's physics group across would add a course this degree does not require.

This shape — three parallel two-term sequences — is exactly `seas-major-operations-research`'s and `seas-major-computer-science`'s `physics` group. Match those.

**sourceUrl:** …#degreetracktextcontainer · **Footnotes:** none on these cells.

**Note (repo voice):** "One complete two-term physics sequence, both terms of whichever you pick."

**Catalog:** all six match (`UN1401` 3, `UN1402` 3, `UN1601` 3.5, `UN1602` 3.5, `UN2801` 4.5, `UN2802` 4.5).

---

### 4. `chemistry` — "Chemistry"

> Choose a one-semester Chemistry lecture (taken Semester I or II):
> `CHEM UN1403` GENERAL CHEMISTRY I-LECTURES / `CHEM UN1404` GENERAL CHEMISTRY II-LECTURES / `CHEM UN2045` INTENSVE ORGANIC CHEMISTRY / `CHEM UN1604` 2ND TERM GEN CHEM (INTENSIVE)

**Rule:** `n_of { n: 1 }` — `CHEM UN1403`, `CHEM UN1404`, `CHEM UN2045`, `CHEM UN1604`

Byte-identical to the `chemistry` group on `seas-major-mechanical-engineering`, `seas-major-operations-research` and the proposed Electrical Engineering file. Match them. It is **not** `seas-major-computer-science`'s `chemistry-or-biology` group — there is no biology route on this page.

**sourceUrl:** …#degreetracktextcontainer · **Footnotes:** none.

**Note (repo voice):** "One one-semester chemistry lecture, taken in semester I or II."

**Catalog:** all four match, all 4pt.

---

### 5. `science-laboratory` — "Chemistry or Physics Laboratory"

The Bulletin prints this requirement **twice, in two different rows**. Both, verbatim:

Chemistry row (Semesters I–II):
> "Choose a lab from the following (taken Semester I or II): `CHEM UN1500` GENERAL CHEMISTRY LABORATORY / `PHYS UN1494` INTRO TO EXPERIMENTAL PHYS-LAB"

Physics row (Semester III):
> "Choose one of the following lab courses depending on track: `PHYS UN1494` or `CHEM UN1500` (Tracks 1 and 2) INTRO TO EXPERIMENTAL PHYS-LAB / `PHYS UN3081` or `CHEM UN1500` (Track 3) INTERMEDIATE LABORATORY WORK"

The PDF chart shows the same doubling:
```
PHYSICS       SEM I         SEM II        SEM III
(three seqs,  UN1401 (3)    UN1402 (3)    Lab UN1494 (3) or chem. lab UN1500 (3)
choose one)   UN1601 (3.5)  UN1602 (3.5)  Lab UN1494 (3) or chem. lab UN1500 (3)
              UN2801 (4.5)  UN2802 (4.5)  Lab UN3081 (2) or chem. lab UN1500 (3)

CHEMISTRY     one-semester lecture (3–4) UN1403 or UN1404 or UN2045 or UN1604
              Lab UN1500 (3) either semester or physics lab UN1494 (3)
```

**Rule:** `n_of { n: 1 }` — `CHEM UN1500`, `PHYS UN1494`, `PHYS UN3081` — **one** laboratory, not two. See Open question 1 for the full argument; in short, both rows offer the *same two courses*, no other SEAS degree requires two laboratories, and reading it as two would push the degree to ~131.5–132.5 points against a published 128.

**⚠ Do NOT copy the shared five-course laboratory list.** `seas-major-computer-science` and `seas-major-operations-research` use `["PHYS UN1494", "PHYS UN3081", "CHEM UN1500", "CHEM UN1507", "CHEM UN3085"]`. **The Computer Engineering page prints only three of those five.** `CHEM UN1507` and `CHEM UN3085` appear nowhere on this page.

**Note (repo voice):** "One laboratory. Tracks 1 and 2 take the introductory physics laboratory or the general chemistry laboratory; Track 3 may take Intermediate Laboratory Work instead. The Bulletin prints this requirement in both the chemistry and the physics row of the grid — it is one laboratory, not two."

**sourceUrl:** …#degreetracktextcontainer

**Catalog:** `CHEM UN1500` 3 ✓, `PHYS UN1494` 3 ✓, `PHYS UN3081` 2 ✓.

---

### 6. `engineering-foundations` — "Engineering Foundations"

> `ENGI E1006` INTRO TO COMP FOR ENG/APP SCI
> `ENGI E1102` (taken Semester l or ll) THE ART OF ENGINEERING
> `ELEN E1201` (taken Semester l or ll)¹ INTRO-ELECTRICAL ENGINEERING
>
> ¹ (late-starting grid) "Transfer and combined-plan students are expected to have completed the equivalent of the first- and second-year program listed above before starting their junior year. Note that this includes some background in discrete math (see `COMS W3203` DISCRETE MATHEMATICS) and electronic circuits (see `ELEN E1201` INTRO-ELECTRICAL ENGINEERING). Transfer and combined-plan students are also expected to be familiar with Java before they start their junior year. If students must take the one-point Java course (`COMS W3101` PROGRAMMING LANGUAGES, `COMS W3102` DEVELOPMENT TECHNOLOGY, `COMS W3103`) junior year, prerequisite constraints make it difficult to complete the remaining computer engineering program by the end of the senior year."

**Rule:** `all_of` — `ENGI E1006`, `ENGI E1102`, `ELEN E1201`

Exactly the three-course shape `seas-major-biomedical-engineering` already uses, and for the same reason: all three are named with no alternative. `ENGI E1006` is printed by name in the Computer Science row of the grid; unlike MechE and IEOR, this page offers no `COMS W1004` substitution *for it* (see group 7 — `COMS W1004` is a **separate, additional** requirement here).

**`ENGI E1102` belongs on this file, not `seas-core`** — the per-major convention, so the course is never held in two independently-evaluated places (trap #7).
**`ECON UN1105` belongs on `seas-core`, not here** — the grid prints it in the Required Nontechnical Electives block, which is `seas-core`'s territory.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "Computing, The Art of Engineering, and Introduction to Electrical Engineering. Principles of Economics is also required and is tracked on the Liberal Arts Core rather than repeated here."

**Catalog:** `ENGI E1006` 3 ✓, `ENGI E1102` ✓ (points null in our catalog; Bulletin says 4), `ELEN E1201` 3.5 ✓.

---

### 7. `intro-programming` — "Introductory Programming"

> `COMS W1004` or `COMS W1007` PROGRAMMING IN JAVA

**Rule:** `n_of { n: 1 }` — `COMS W1004`, `COMS W1007`

**This is on top of `ENGI E1006`, not instead of it.** The PDF chart's COMPUTER SCIENCE row makes it unambiguous: `ENGI E1006 (3)` in Semester I **and** `COMS W1004 (3) or W1007 (3)` in Semester II **and** `COMS W3203` later. Three separate computing requirements. Computer Engineering is the only SEAS degree in this repo that requires both `ENGI E1006` and a Java course — MechE, IEOR and SEAS CS all treat them as alternatives or require only one.

**Honors variant hunted and present:** `COMS W1007` is the prior-experience/honours course (trap #8).

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One of the two, in addition to ENGI E1006 — this degree requires both. COMS W1007 is for students with prior experience; a 4 or 5 on the CS AP exam exempts you from COMS W1004 and leaves nothing on your record to match. COMS W1007 is offered by the Bulletin but is not in our catalog, so it will not match automatically."

**Catalog:** `COMS W1004` 3 ✓, **`COMS W1007` MISSING** — kept (trap #9). *(Note: `seas-major-computer-science` already encodes `COMS W1007` and `COMS W3137` without recording that they are unmatched; see the report.)*

---

### 8. `discrete-mathematics` — "Discrete Mathematics"

> `COMS W3203` (taken Semester lll or lV) DISCRETE MATHEMATICS

**Rule:** `all_of` — `COMS W3203`

**sourceUrl:** …#degreetracktextcontainer · **Footnotes:** none on this cell (footnote 1 of the late grid *mentions* it as transfer background).

**Note (repo voice):** "Required, with no alternative. The Electrical Engineering degree does not require it; this one does."

**Catalog:** `COMS W3203` 4pt ✓. **Point discrepancy:** the HTML grid says 4.00 and our catalog agrees; the Bulletin-hosted PDF chart says "(3)". Trust the HTML grid and the registrar.

---

### 9. `data-structures` — "Data Structures"

> `COMS W3134` or `W3137` Data Structures in Java

**Rule:** `n_of { n: 1 }` — `COMS W3134`, `COMS W3137`

**Narrower than the EE page's list.** EE offers `COMS W3136` / `W3134` / `W3137`; Computer Engineering offers only `W3134` / `W3137`. `COMS W3136` ESSENTIAL DATA STRUCTURES appears nowhere on this page. Do not widen it.

**Honors variant hunted and present:** `COMS W3137` (trap #8).

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "COMS W3134, or the honors course COMS W3137. COMS W3137 is offered by the Bulletin but is not in our catalog, so it will not match automatically."

**Catalog:** `COMS W3134` 3 ✓, **`COMS W3137` MISSING** — kept.

---

### 10. `probability` — "Probability"

> `IEOR E3658`³ PROBABILITY FOR ENGINEERS
>
> ³ "`SIEO W3600` INTRO PROBABILITY/STATISTICS, `STAT GU4203` PROBABILITY THEORY, and `STAT GU4001` INTRODUCTION TO PROBABILITY AND STATISTICS **can be used instead of** `IEOR E3658` PROBABILITY FOR ENGINEERS, but `SIEO W3600` INTRO PROBABILITY/STATISTICS and `STAT GU4001` INTRODUCTION TO PROBABILITY AND STATISTICS may not provide enough probability background for elective courses such as `ELEN E3701` INTRO TO COMMUNICATION SYSTEMS. Students completing an economics minor who want such a background can take `IEOR E3658` PROBABILITY FOR ENGINEERS and augment it with `IEOR E4307` STATISTICS AND DATA ANALYSIS."

**Rule:** `n_of { n: 1 }` — `IEOR E3658`, `SIEO W3600`, `STAT GU4203`, `STAT GU4001`

**⚠ This is the opposite of the EE page and both are correct as printed.** EE's equivalent footnote says *"A course such as `STAT GU4001` cannot generally be used to replace `IEOR E3658` or `STAT GU4203`"*; Computer Engineering's says `STAT GU4001` **can** be used, with only a warning about later prerequisites. The two degrees genuinely differ. Transcribe each page's own version — do not reconcile them.

The `IEOR E4307` sentence is advice about an economics minor, not a requirement, and is not encoded.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "One of the four. The Bulletin warns that SIEO W3600 and STAT GU4001 may not give enough probability background for later electives such as ELEN E3701. SIEO W3600 is offered by the Bulletin but is not in our catalog, so it will not match automatically."

**Catalog:** `IEOR E3658` 3 ✓, `STAT GU4203` 3 ✓, `STAT GU4001` 3 ✓, **`SIEO W3600` MISSING** — kept.

---

### 11. `ce-core` — "Computer Engineering Core"

> `COMS W3157` ADVANCED PROGRAMMING · `COMS W3261`⁶ COMPUTER SCIENCE THEORY · `CSEE W3827` FUNDAMENTALS OF COMPUTER SYSTS · `ELEN E3201` CIRCUIT ANALYSIS · `ELEN E3801` SIGNALS AND SYSTEMS · `ELEN E3331` ELECTRONIC CIRCUITS
>
> ⁶ "`COMS W3261` COMPUTER SCIENCE THEORY can be taken one semester later than pictured."

**Rule:** `all_of` — `COMS W3157`, `COMS W3261`, `CSEE W3827`, `ELEN E3201`, `ELEN E3801`, `ELEN E3331`

This is the requirement split the joint administration produces: three Computer Science courses and three Electrical Engineering courses, all six required, published on the Computer Engineering page rather than on either department's.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "All six — three from Computer Science and three from Electrical Engineering. COMS W3261 may be taken a semester later than the grid shows."

**Catalog:** `COMS W3157` 4 ✓, `COMS W3261` 3 ✓, `CSEE W3827` 3 ✓, `ELEN E3201` 3.5 ✓, `ELEN E3801` 3.5 ✓, `ELEN E3331` 3 ✓.

---

### 12. `systems-software` — "Operating Systems or Programming Languages"

> `COMS W4118` or `W4115` (taken Semester Vll or Vlll) OPERATING SYSTEMS I

The PDF chart disambiguates the title, which the HTML grid collapses onto one row:

> "`COMS W4118` (3) Operating systems **or** `COMS W4115` (3) Programming lang."

**Rule:** `n_of { n: 1 }` — `COMS W4118`, `COMS W4115`

**A rendering trap worth naming.** The HTML plan grid prints the pair under the single title "OPERATING SYSTEMS I", so a transcriber skimming the rendered page reads one course with a stray code beside it. It is a genuine either/or between two different courses.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "Operating Systems, or Programming Languages and Translators. One of the two."

**Catalog:** `COMS W4118` 3 ✓, `COMS W4115` 3 ✓.

---

### 13. `ce-core-electives` — "Computer Engineering Core: choose three"

> Choose three of the following Core Required Courses (taken Semester Vl, Vll, or Vlll):
> `CSEE W4119` COMPUTER NETWORKS / `EECS E4321` DIGITAL VLSI CIRCUITS / `CSEE W4823` Advanced Logic Design / `CSEE W4824` COMPUTER ARCHITECTURE / `CSEE W4840` EMBEDDED SYSTEMS / `CSEE W4868` SYSTEM-ON-CHIP PLATFORMS

**Rule:** `n_of { n: 3 }` — `CSEE W4119`, `EECS E4321`, `CSEE W4823`, `CSEE W4824`, `CSEE W4840`, `CSEE W4868`

This is an **exact** requirement — a named list of six with a count — not an elective block, despite sitting at the 4000 level. The Bulletin calls them "Core Required Courses". Note the block is printed three times (Semesters VI, VII and VIII in the early grid; VII and VIII in the late grid); it is one requirement, repeated because it may be taken in any of those terms.

**Double-counting to watch:** a student who takes four or five of these six has surplus courses that are legitimately technical electives. Since `technical-electives` is `attested` here, there is no selector to add `excludeGroups` to — but if a future transcription ever makes the elective block checkable, this group must be in its `excludeGroups`, for the reason `seas-major-computer-science`'s `cs-electives` documents.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "Choose three of the six. The Bulletin calls these Core Required Courses, not electives."

**Catalog:** all six match, all 3pt (`EECS E4321` 3, the four `CSEE` 3 each).

---

### 14. `ce-laboratories` — "Electrical Engineering Laboratories"

> `ELEN E3081`⁴ CIRCUIT ANALYSIS LABORATORY · `ELEN E3084`⁴ SIGNALS ＆ SYSTEMS LABORATORY · `ELEN E3083`⁴ ELECTRONIC CIRCUITS LABORATORY · `ELEN E3082`⁴ DIGITAL SYSTEMS LABORATORY
>
> ⁴ "If possible, `ELEN E3081` CIRCUIT ANALYSIS LABORATORY and `ELEN E3084` SIGNALS ＆ SYSTEMS LABORATORY should be taken along with `ELEN E3201` CIRCUIT ANALYSIS and `ELEN E3801` SIGNALS AND SYSTEMS, respectively, and `ELEN E3083` ELECTRONIC CIRCUITS LABORATORY and `ELEN E3082` DIGITAL SYSTEMS LABORATORY taken with `ELEN E3331` ELECTRONIC CIRCUITS and `CSEE W3827` FUNDAMENTALS OF COMPUTER SYSTS respectively."

**Rule:** `all_of` — `ELEN E3081`, `ELEN E3082`, `ELEN E3083`, `ELEN E3084`

**Four labs, not five.** The EE degree adds `ELEN E3043` SOLID ST,MICROWAVE,FBR OPT LAB; Computer Engineering does not require it and does not print it.

**sourceUrl:** …#degreetracktextcontainer

**Note (repo voice):** "All four. Each pairs with a core lecture course and the Bulletin asks that you take them in the same term where possible."

**Catalog:** all four match, 1pt each.

---

### 15. `technical-electives` — "Technical Electives"

Curriculum tab, in full:

> "The Computer Engineering Program includes **15 points of technical electives**. All must be 3000 level or above, technical, and must not have significant overlap with other courses taken for the major. **Adviser approval of technical electives is required.**
> Most courses at the 3000 level or above offered by the Computer Science and Electrical Engineering departments are eligible, and **up to two from outside those departments** can be considered for approval as well. If a department advertises that one of its courses can be used as a technical elective that does not necessarily mean it will be approved as a technical elective in the computer engineering program. There must be sufficient technical content and computer engineering connection within the entire 15 points, so approval of some courses may depend on the other electives chosen. **Economics courses cannot be used as technical electives.** `COMS W3101` PROGRAMMING LANGUAGES/`COMS W3102` DEVELOPMENT TECHNOLOGY courses, and not-very-technical courses within the school of engineering, cannot be used as technical electives either."

Degree Track row, plus footnote:

> "Tech Electives (15 points required; see details within the text) (taken Semester V, Vl, Vll or Vlll)⁵"
> ⁵ "The total points of technical electives is reduced to **12** if `APMA E2101` INTRO TO APPLIED MATHEMATICS has been replaced by `MATH UN2030` ORDINARY DIFFERENTIAL EQUATIONS (formerly MATH E1210) and either `APMA E3101` APPLIED MATH I: LINEAR ALGEBRA or `MATH UN2010` LINEAR ALGEBRA, or `COMS W3251` COMPUTATIONAL LINEAR ALGEBRA. Combined-plan students with good grades in separate, advanced courses in linear algebra and ODEs can apply for this waiver, but the courses must have been at an advanced level for this to be considered."

**Rule:** `attested`

**Why not `points_matching { points: 15, select: { subjects: ["COMS","CSEE","ELEN","EECS","CSOR"], numberRange: [3000,9999] } }`** — which is the tempting encoding, and is wrong on four counts:
1. **"Up to two from outside those departments"** is a cap across the student's chosen set. The rule language counts courses matching a shape; it cannot say "and at most two of them may look like this" (the same shape as `cc-major-economics`'s 2000-level elective cap).
2. **"Approval of some courses may depend on the other electives chosen"** — the eligibility of one course is a function of the rest of the set.
3. **"Not-very-technical courses within the school of engineering cannot be used"** — a per-course judgement no course record carries. `ELEN E3990` FIELDWORK is a concrete instance: the EE course listing says *"May not be used as technical or nontechnical electives or to satisfy any other Electrical Engineering or Computer Engineering major requirements."*
4. **The 15/12 split** depends on how `applied-mathematics` was satisfied.

Only the two floors ("3000 level or above", "must not overlap") are shapes, and they are the parts that would go green while everything that actually gates approval stayed unchecked. `attested`, matching `seas-major-operations-research` and the EE proposal.

**Departmental site unreachable:** `https://compeng.columbia.edu/` returns HTTP 403 behind Cloudflare to curl and to WebFetch. No approved-course list is published in the Bulletin at all — unlike EE, this page does not even name depth areas.

**sourceUrl:** …#curriculumtextcontainer

**Note (repo voice):** "15 points, all at the 3000 level or above, all technical, none significantly overlapping other courses taken for the major. Most Computer Science and Electrical Engineering courses at that level qualify, and up to two courses from outside those two departments may be approved. Economics courses, COMS W3101/W3102, and not-very-technical engineering courses are excluded by name. Adviser approval is required, and whether a course is approved can depend on the other electives you chose — so this one is yours to confirm. The total drops to 12 points if you replaced APMA E2101 with Ordinary Differential Equations plus linear algebra."

---

## Point arithmetic

Published total: **128 points for the B.S.** The Computer Engineering page's own published total is **`Total Points: 303-309`** — which is a CourseLeaf plan-grid artifact and must not be reconciled against. The 15-point technical-elective row and the 27-point nontechnical row are printed once per semester in each of the four junior/senior terms, so the grid's roll-up counts each of them four times; the "taken Semester I or II" rows are counted twice. **Trap #6 applies in reverse here: the mismatch is in the published total, not in the blocks.** The PDF chart's per-semester "TOTAL POINTS" line is likewise illustrative — its own footnote says *"'Total points' assumes that 20 points of nontechnical electives and other courses are included."*

Baseline branch: physics sequence 1, `APMA E2101` route, `CHEM UN1403` (4), one laboratory at 3, `COMS W1004`, `COMS W3134`, `IEOR E3658`, `COMS W4118`.

| Block | File | Points |
|---|---|---|
| `calculus` — 3 + 3 + 4 | major | 10 |
| `applied-mathematics` — APMA E2101 | major | 3 |
| `physics` — 3 + 3 (two terms) | major | 6 |
| `chemistry` — CHEM UN1403 | major | 4 |
| `science-laboratory` — one lab | major | 3 |
| `engineering-foundations` — 3 + 4 + 3.5 | major | 10.5 |
| `intro-programming` — COMS W1004 | major | 3 |
| `discrete-mathematics` — COMS W3203 | major | 4 |
| `data-structures` — COMS W3134 | major | 3 |
| `probability` — IEOR E3658 | major | 3 |
| `ce-core` — 4 + 3 + 3 + 3.5 + 3.5 + 3 | major | 20 |
| `systems-software` — COMS W4118 | major | 3 |
| `ce-core-electives` — three at 3 | major | 9 |
| `ce-laboratories` — 1 + 1 + 1 + 1 | major | 4 |
| `technical-electives` | major | 15 |
| **Major subtotal** | | **100.5** |
| Nontechnical requirement (List A 16–19 + List B 9–11, capped at 27) | `seas-core` | 27 |
| Physical education — two terms | `seas-core` | 2 |
| **TOTAL** | | **129.5** |

**129.5 against a published floor of 128 — a 1.5-point residual, and every part of it is a published range.** Substituting the PDF chart's `COMS W3203` (3) gives **128.5**; a 3-point chemistry lecture (the Bulletin prints the cell as "3–4") gives **127.5–128.5**. The degree total is a minimum, not an equality, and several blocks are ranges, so this reconciles.

**The arithmetic is also what settles Open question 1.** Reading the two laboratory rows as two separate requirements adds 3 points and puts the degree at **132.5** — 4.5 over a 128-point floor, in a curriculum where every other block is pinned to the point. And the branch check works the same way it does for EE: the two-course applied-mathematics route adds 3 points while footnote 5 drops the technical electives from 15 to 12. Net zero. Both readings confirmed.

**Cross-check against Electrical Engineering, whose page is structurally the twin of this one:** EE reconciles to exactly 128.0 with a *third* physics term (+3) and *three* more elective points (18 vs 15) and one more laboratory course (`ELEN E3043`, +3) and a capstone (`ELEN E3399` + `ELEN E3390`, +4), against Computer Engineering's extra `COMS W1004` (+3), `COMS W3203` (+4), `COMS W3261`/`COMS W3157` in place of `ELEN E3106`/`ELEN E3401`/`ELEN E3701`, and three 4000-level core courses (+9). The two land within 1.5 points of each other, which is what two 128-point degrees from the same building should do.

---

## Which file each requirement belongs on

| Requirement | File | Why |
|---|---|---|
| `ENGL CC1010` University Writing | `seas-core` | shared by every SEAS degree |
| Lit Hum / CC / Global Core sequence | `seas-core` | `core-sequence` |
| Art or Music Humanities | `seas-core` | |
| **`ECON UN1105` Principles of Economics** | **`seas-core` only** | printed on this grid but already `principles-of-economics`; duplicating it is trap #7 |
| `ECON UN1155` recitation | neither | 0-point recitation welded with `&`; noted, never required |
| Nontechnical electives (List B) | `seas-core` | `attested` there |
| Physical education | `seas-core` | `n_matching` over PHED |
| **`ENGI E1102` The Art of Engineering** | **this major file only** | per-major convention so it is never evaluated twice |
| Math, physics, chemistry, laboratory, computing | this major file | `seas-core` delegates them — trap #2 |
| Everything COMS / CSEE / EECS / ELEN / IEOR above | this major file | the whole degree is on the Computer Engineering page; **nothing** comes from the EE or CS department pages |

---

## Not encodable

1. **The outside-department cap.** *"Most courses at the 3000 level or above offered by the Computer Science and Electrical Engineering departments are eligible, and up to two from outside those departments can be considered for approval as well."* — a cap across the chosen set.
2. **Set-dependent approval.** *"There must be sufficient technical content and computer engineering connection within the entire 15 points, so approval of some courses may depend on the other electives chosen."*
3. **Adviser approval.** *"Adviser approval of technical electives is required."* — a petition; the language refuses these by design.
4. **The judgement exclusions.** *"Economics courses cannot be used as technical electives. COMS W3101 PROGRAMMING LANGUAGES/COMS W3102 DEVELOPMENT TECHNOLOGY courses, and not-very-technical courses within the school of engineering, cannot be used as technical electives either."* — the first two are enumerable, "not-very-technical courses" is not, and since the block is `attested` there is nothing to exclude them from.
5. **The conditional elective total.** *"The total points of technical electives is reduced to 12 if APMA E2101 has been replaced by…"* — requirement size conditional on how another requirement was satisfied.
6. **The combined-plan waiver.** *"Combined-plan students with good grades in separate, advanced courses in linear algebra and ODEs can apply for this waiver, but the courses must have been at an advanced level for this to be considered."* — transfer equivalency + grade minimum + petition.
7. **Transfer / combined-plan background.** *"Transfer and combined-plan students are expected to have completed the equivalent of the first- and second-year program listed above before starting their junior year… Transfer and combined-plan students are also expected to be familiar with Java before they start their junior year."*
8. **The overlap rule.** *"…must not have significant overlap with other courses taken for the major."* — a pairwise content judgement.
9. **Term ordering.** Every cell carries "(taken Semester …)". No ordering is checked.
10. **`ELEN E3990` FIELDWORK.** *"May not be used as technical or nontechnical electives or to satisfy any other Electrical Engineering or Computer Engineering major requirements."*
11. **`APMA E2001` / `ECON UN1155`.** 0-point welded recitations — noted, never required.
12. **AP credit.** Exempts `COMS W1004` and can satisfy `ECON UN1105`, leaving no course on a record.

---

## Open questions

1. **Is the laboratory one requirement or two?** *(Most important open question for this program.)* The chart prints a laboratory choice in the **chemistry** row ("Choose a lab from the following (taken Semester I or II): `CHEM UN1500` / `PHYS UN1494`") *and* in the **physics** row ("Choose one of the following lab courses depending on track: `PHYS UN1494` or `CHEM UN1500` (Tracks 1 and 2) / `PHYS UN3081` or `CHEM UN1500` (Track 3)"). Four arguments for **one**: (a) both rows offer the *same two courses*, which makes no sense as two distinct requirements — a student could not use `CHEM UN1500` for both; (b) no other SEAS degree in this repo requires two laboratories; (c) the arithmetic — two labs puts the degree at 132.5 against a 128-point floor; (d) the twin Electrical Engineering page, which is otherwise structurally identical, has exactly one laboratory requirement. The reading adopted here is **one** `n_of { n: 1 }` over `CHEM UN1500` / `PHYS UN1494` / `PHYS UN3081`, which is also the conservative direction: if it turned out to be two, this under-counts, and under-counting sends a student to their adviser rather than to the registrar after add/drop. What would resolve it: the Computer Engineering checklist at `compeng.columbia.edu` (403 to every automated fetch), or the joint Computer Engineering Committee.
2. **The honors calculus sequence.** As on every SEAS degree track, `MATH UN1207`/`UN1208` and `MATH UN1201`/`UN1205` are not printed as alternatives to `MATH UN1101` + `UN1102` + `APMA E2000`, yet all four are in our catalog and SEAS honors-calculus students exist. Same shape as the `cc-major-economics` honors bug (trap #8), except that here the Bulletin publishes no alternative, so encoding one would be a guess. Transcribed as printed and flagged.
3. **`COMS W3203` points.** HTML grid and registrar say 4; the Bulletin's own PDF chart says 3. Affects the arithmetic by one point, nothing else. Trust the HTML grid.
4. **No approved technical-elective list exists anywhere public.** Unlike EE (which at least names four depth areas), this page gives only policy prose, and `compeng.columbia.edu` is unreachable. The block is `attested` regardless, but the note cannot enumerate anything.
5. **Early-Starting vs Late-Starting.** Diffed cell by cell; course sets identical, only the terms move. Recorded as a comment rather than a second program.

---

## The nine traps — verdicts

1. **`sequence_choice` vs `n_of { n: 2 }`.** Two groups: `physics` (three parallel two-term sequences — `PHYS UN1401` + `PHYS UN1602` is a buildable schedule that satisfies nothing) and `applied-mathematics` (one course vs. two, atomic branches of different lengths). Both `sequence_choice`.
2. **Delegated blocks.** Fully picked up: math, physics, chemistry, laboratory, computing (three separate groups — `ENGI E1006`, `COMS W1004`/`W1007`, `COMS W3203`) and `ENGI E1102` are all encoded on the major, read off the whole Degree Track grid. The page has no "Major Requirements" block at all, which is exactly the shape that bit SEAS CS.
3. **Footnotes.** All 10 markers (4 on the early grid, 6 on the late grid) are resolved and attached above. Two of them widen a rule (`APMA E2101` → +`COMS W3251`; `IEOR E3658` → +`SIEO W3600`/`STAT GU4203`/`STAT GU4001`) and would be missed by anyone reading only the cells.
4. **"Or higher" / open-ended.** Two found: *"not-very-technical courses within the school of engineering"* and *"up to two from outside those departments **can be considered for approval**"*. Neither guessed at; both recorded verbatim in the `attested` note.
5. **CourseLeaf eats labels.** Checked. The one anomaly is the reverse of a lost label — a requirement printed **twice** (the laboratory, Open question 1) — and one collapsed title, `COMS W4118`/`COMS W4115` both rendered under "OPERATING SYSTEMS I", which is called out on that group.
6. **Reconcile the arithmetic.** Done: 100.5 (major) + 27 (nontechnical) + 2 (PE) = 129.5 against a 128-point floor, within the published ranges. **The page's own `Total Points: 303-309` is a plan-grid artifact and must be ignored** — the elective rows repeat four times. The APMA branch and the 15→12 elective footnote compensate to zero, confirming both readings.
7. **Duplicated requirements.** `ECON UN1105` on `seas-core` **only**; `ENGI E1102` on this file **only**. Also worth stating: none of this degree's requirements come from the EE or CS department pages, so there is no cross-file duplication risk with `seas-major-electrical-engineering` or `seas-major-computer-science` — a student double-majoring would carry two independent programs, and `crossCountedCourseIds` will (correctly) flag the overlap.
8. **Honors / accelerated.** Hunted group by group: physics sequence 3 (`PHYS UN2801`/`UN2802`) ✓; chemistry intensives (`CHEM UN1604`, `CHEM UN2045`) ✓; intro programming honors (`COMS W1007`) ✓; data structures honors (`COMS W3137`) ✓; probability's higher courses (`STAT GU4203`) ✓. Gap: honors calculus — Open question 2.
9. **Courses the Bulletin names that our catalog lacks.** Four, all kept and all noted: **`COMS W3251`** (`applied-mathematics`), **`COMS W1007`** (`intro-programming`), **`COMS W3137`** (`data-structures`), **`SIEO W3600`** (`probability`). Plus **`MATH UN1210`**, which is a *"formerly"* parenthetical and must **not** be encoded, and `COMS W3101`/`COMS W3103`, which appear only in exclusion prose. Everything else resolves.

---

## Proposed golden records

Written by hand from the Bulletin.

### `compe-two-term-physics-and-track3-lab`
**Who:** Computer Engineering student on the accelerated physics track — `PHYS UN2801`, `PHYS UN2802`, then `PHYS UN3081` as their laboratory.
**Why it is hard:** the two shapes most likely to be got wrong at once. If physics is copied from the Electrical Engineering or Mechanical Engineering file it becomes a *three*-term sequence and this student is shown as 2 of 3; if the laboratory is copied from the sibling SEAS five-course list it accepts `CHEM UN1507`/`CHEM UN3085`, which this page never prints. Also pins that `PHYS UN3081` lives in the laboratory group, not inside the physics sequence.
**taken:** `PHYS UN2801`, `PHYS UN2802`, `PHYS UN3081`, `CHEM UN1403`, `MATH UN1101`, `MATH UN1102`, `APMA E2000`
**expect:**
- `physics` → **satisfied**, completed 2
- `science-laboratory` → **satisfied**, completed 1
- `chemistry` → **satisfied**, completed 1
- `calculus` → **satisfied**, completed 3
- `applied-mathematics` → **unmet**

### `compe-honors-track`
**Who:** Computer Engineering student who took every honors/accelerated variant the page offers: `COMS W1007` instead of `COMS W1004`, `COMS W3137` instead of `COMS W3134`, `STAT GU4203` instead of `IEOR E3658` — and who still holds `ENGI E1006`, because this degree requires it **as well as** the Java course.
**Why it is hard:** trap #8, three times over, plus the `ENGI E1006`-and-`COMS W1004` distinction that no other SEAS file in this repo has. Encode `intro-programming` as `all_of ["COMS W1004"]`, or fold `ENGI E1006` into it as an alternative the way MechE and IEOR do, and this complete student is told they are missing two requirements.
**taken:** `COMS W1007`, `COMS W3137`, `STAT GU4203`, `ENGI E1006`, `ENGI E1102`, `ELEN E1201`, `COMS W3203`
**expect:**
- `intro-programming` → **satisfied**, completed 1
- `data-structures` → **satisfied**, completed 1
- `probability` → **satisfied**, completed 1
- `engineering-foundations` → **satisfied**, completed 3
- `discrete-mathematics` → **satisfied**, completed 1
*(Note: `COMS W1007` and `COMS W3137` are not in our live catalog. They resolve in the golden fixture because `buildCatalog` derives its membership from the courses the program names — which is precisely the "we cannot tell" case trap #9 is about, and why keeping the codes matters.)*

### `compe-surplus-core-electives-and-mixed-physics`
**Who:** Computer Engineering student who took **five** of the six "choose three" Core Required Courses, and who took `PHYS UN1601` and `PHYS UN2802` — the first term of sequence 2 and the second term of sequence 3.
**Why it is hard:** two independent edge cases in one record. The `n_of { n: 3 }` must report **satisfied at 3**, not 5 of 3 — and the two leftovers are the student's technical electives, which is the double-counting shape `seas-major-computer-science`'s `cs-electives` guards against and which this program cannot guard against because its elective block is `attested`. Meanwhile the physics pair is the mixed-sequence schedule `n_of { n: 2 }` would wrongly pass: two terms of physics done, no sequence finished.
**taken:** `CSEE W4119`, `CSEE W4823`, `CSEE W4824`, `CSEE W4840`, `CSEE W4868`, `PHYS UN1601`, `PHYS UN2802`
**expect:**
- `ce-core-electives` → **satisfied**, completed 3
- `physics` → **in_progress**, completed 1
- `technical-electives` → **unmet** (attested, unticked — the two surplus core courses are real elective points the audit deliberately does not claim)
