# Chemical Engineering (B.S.)

- **Proposed program id:** `seas-major-chemical-engineering`
- **School:** SEAS (`school: "SEAS"`) · **Kind:** `major` · **Department:** `"Chemical Engineering"`
- **Degree points:** 128 (a school-wide figure; it belongs on `seas-core`'s
  `degreePoints`, not on this file — `Program.degreePoints` is documented as
  "only meaningful on `kind: 'core'`")
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-engineering/academic-departments-programs/chemical-engineering/undergraduate-programs/chemical-engineering-bs/`
  - Curriculum tab: `…/chemical-engineering-bs/#curriculumtextcontainer`
  - Degree Track tab: `…/chemical-engineering-bs/#degreetracktextcontainer`
  - Bulletin-hosted PDF degree chart (same site, linked from the Degree Track
    tab, and the **only** place the point totals are published):
    `…/chemical-engineering-bs/2026-2027_Engineering_Bulletin_Charts_CHEN.pdf`
- **Date researched:** 2026-08-26
- **Confidence: 9/10.** Every group is traced to a URL with the rendered text
  quoted; all four Degree Track footnotes plus the one Curriculum-tab footnote
  are resolved and attached; the arithmetic reconciles exactly to 128 against
  the PDF chart's own per-semester totals; every course code was checked against
  our catalog by direct query. The missing tenth of a point is named under
  *Open questions*: `CHEN E1000` is called a "professional elective" in prose
  but is load-bearing in the chart's arithmetic, and the departmental site
  (cheme.columbia.edu) returns HTTP 403 to every client I have, so I could not
  obtain the secondary source that would settle it.

---

## How this program differs from the four SEAS majors already encoded

Read this before transcribing. Chemical Engineering breaks the shared shape in
five places, and four of the five would be silently wrong if the existing files
were used as a template.

| Block | MechE / BME / OR / SEAS-CS convention | **Chemical Engineering** |
|---|---|---|
| Chemistry | one lecture (`n_of {n:1}`) — MechE, OR, CS; or a 2-term `sequence_choice` — BME | **a 3–4 course `sequence_choice` running into organic chemistry** |
| Science laboratory | one `n_of {n:1}` over PHYS+CHEM labs | **three separate laboratory obligations** (chem lab inside the chemistry sequence, a physics lab, and a 3-point advanced natural-science lab) |
| Physics | 2 terms (OR, CS) or 3 terms (MechE, BME) | **2 terms only** — the third-year physics slot is a *lab*, not a lecture |
| `ELEN E1201` | required (MechE, BME) | **not required at all** |
| Linear algebra | its own `n_of` group (OR, CS) | **folded into a 6-option "Math elective"** taken in Semester VI |

**Physical chemistry is NOT required.** The task brief anticipated "organic
chemistry and physical chemistry sequences, plus their labs". The organic half
is right and then some — see `chemistry` below. The physical-chemistry half is
**not** in the 2026–2027 Bulletin: the only p-chem course anywhere on the page
is `CHEM UN3085` PHYSICL-ANALYTICL LABORATORY I, and it appears as *one of seven
options* in the advanced natural-science laboratory footnote. `CHEE E3010`
Principles of Chemical Engineering Thermodynamics is a CHEE course, not a CHEM
one. Do not invent a p-chem group.

---

## Requirement groups

Naming follows `seas-major-mechanical-engineering` and
`seas-major-biomedical-engineering` (ids in kebab-case, labels in the Bulletin's
own words, notes written to the student).

### 1. `calculus` — "Calculus"

**Bulletin, Degree Track grid, verbatim:**

> Semester I — `MATH UN1101` CALCULUS I
> Semester II — `MATH UN1102` CALCULUS II
> Semester III — `APMA E2000` & `APMA E2001` MULTV. CALC. FOR ENGI ＆ APP SCI

**PDF chart, MATHEMATICS row, verbatim:** "MATH UN1101 (3) | MATH UN1102 (3) |
APMA E2000 (4) and E2001 (0)".

- **Rule:** `all_of` — `MATH UN1101`, `MATH UN1102`, `APMA E2000`
- **sourceUrl:** `…/chemical-engineering-bs/#degreetracktextcontainer`
- **Note (copy the MechE/OR wording verbatim):** "All three. APMA E2000 carries a
  required 0-point recitation, APMA E2001, which is not matched here."
- **Footnotes:** none on these cells.
- **Catalog:** `MATH UN1101` 3.0 ✓, `MATH UN1102` 3.0 ✓, `APMA E2000` 4.0 ✓
  (`APMA E2001` 0.0 exists but is deliberately not required).

### 2. `differential-equations` — "Differential Equations"

**Bulletin, verbatim (Semester IV):**

> `MATH UN2030` or `APMA E2101` — ORDINARY DIFFERENTIAL EQUATIONS

**PDF chart:** "MATH UN2030 (3) ODE / or / APMA E2101 (3)".

- **Rule:** `n_of { n: 1 }` — `MATH UN2030`, `APMA E2101`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One of the two, taken in semester IV."
- **Footnotes:** none.
- **Catalog:** both ✓ (3.0 each).
- **Do not copy MechE's `applied-mathematics` group here.** MechE's version is a
  five-branch `sequence_choice` because its `APMA E2101` branch trades against a
  *pair* of courses. ChemE's is a flat one-of-two: no linear-algebra branch, no
  follow-on 3-point obligation. Reusing MechE's group would require a Chemical
  Engineering student to take linear algebra twice.

### 3. `math-elective` — "Math Elective"

**Bulletin, Degree Track grid (Semester VI):** "Math Elective[4]".

**Footnote 4, verbatim:**

> Math elective options include `APMA E3101` APPLIED MATH I: LINEAR ALGEBRA,
> `MATH UN2010` LINEAR ALGEBRA, `APMA E3102` APPLIED MATHEMATICS II: PDE'S,
> `APMA E4150` APPLIED FUNCTIONAL ANALYSIS, `APMA E4300` COMPUT
> MATH:INTRO-NUMERCL METH, `STAT GU4001` INTRODUCTION TO PROBABILITY AND
> STATISTICS, or another course approved by the major adviser.

- **Rule:** `n_of { n: 1 }` — `APMA E3101`, `MATH UN2010`, `APMA E3102`,
  `APMA E4150`, `APMA E4300`, `STAT GU4001`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One math elective, taken in semester VI. The Bulletin's list is
  open-ended — 'or another course approved by the major adviser' — so a course
  your adviser approved that is not one of these six will not match here."
- **Catalog:** all six ✓ (3.0 each).
- **Trap #4 applies.** "or another course approved by the major adviser" is
  recorded verbatim under *Not encodable* and must not be widened into a
  selector over APMA/MATH/STAT.

### 4. `physics` — "Physics"

**Bulletin, Degree Track grid, verbatim:**

> Semester I — "Choose one of the following Physics courses depending on
> sequence:" `PHYS UN1401` (Sequence1) / `PHYS UN1601` (Sequence 2) /
> `PHYS UN2801` (Sequence 3)
> Semester II — "Choose one of the following Physics courses depending on
> sequence:" `PHYS UN1402` (Sequence 1) / `PHYS UN1602` (Sequence 2) /
> `PHYS UN2802` (Sequence 3)

- **Rule:** `sequence_choice`
  - `"Sequence 1"` — `PHYS UN1401`, `PHYS UN1402`
  - `"Sequence 2"` — `PHYS UN1601`, `PHYS UN1602`
  - `"Sequence 3"` — `PHYS UN2801`, `PHYS UN2802`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note (matches `seas-major-operations-research` verbatim):** "One complete
  two-term physics sequence, both terms of whichever you pick."
- **Footnotes:** none on any physics cell.
- **Catalog:** all six ✓ (`UN1401`/`UN1402` 3.0, `UN1601`/`UN1602` 3.5,
  `UN2801`/`UN2802` 4.5).
- **There is no third physics term.** The grid's Semester III physics cell
  contains only laboratories — see group 5. Do **not** import MechE's or BME's
  three-term sequences, and do not import MechE's footnote-3
  `EEEB UN2001` / `BIOL UN2005` substitutions: that footnote is on the MechE
  page and has no counterpart here.

### 5. `physics-laboratory` — "Physics Laboratory"

**Bulletin, Degree Track grid (Semester III), verbatim:**

> "Choose one of the following Physics courses depending on sequence:"
> `PHYS UN1494` INTRO TO EXPERIMENTAL PHYS-LAB
> `PHYS UN3081` INTERMEDIATE LABORATORY WORK

**PDF chart, PHYSICS row, Semester III column:** "Lab UN1494 (3)" and
"Lab UN3081 (2)".

- **Rule:** `n_of { n: 1 }` — `PHYS UN1494`, `PHYS UN3081`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One physics laboratory, taken in semester III. Unlike the other
  engineering degrees this one does not accept a chemistry laboratory here —
  your general chemistry laboratory is already inside the chemistry sequence."
- **Trap #5 checked and cleared.** The cell's heading says "Physics courses
  depending on sequence" but names no sequences and lists only two rows, which
  is exactly the shape of a CourseLeaf label loss. It is not one: the chart's
  Semester III total of 17 closes exactly with `PHYS UN1494` at 3 points
  (4 + 3 + 4 + 3 + 3 = 17). Nothing is missing; the heading is recycled
  boilerplate from the Semester I/II cells.
- **Catalog:** `PHYS UN1494` 3.0 ✓, `PHYS UN3081` 2.0 ✓.
- **Divergence to flag:** `seas-major-operations-research` and
  `seas-major-computer-science` both use a five-option
  `science-laboratory` group (`PHYS UN1494`, `PHYS UN3081`, `CHEM UN1500`,
  `CHEM UN1507`, `CHEM UN3085`). Copying that here would let a Chemical
  Engineering student satisfy this requirement with the very chemistry lab that
  their chemistry sequence already required — the same course paying for two
  requirements. Keep it to the two physics labs.

### 6. `chemistry` — "Chemistry"

**This is the group that makes Chemical Engineering different, and it is a
`sequence_choice` with three branches of unequal length.**

**Bulletin, Degree Track grid, verbatim, across three semesters:**

> Semester I — "Choose one of the following Chemistry courses depending on
> sequence:"
> `CHEM UN1403` & `CHEM UN1500` (Sequence 1) — GENERAL CHEMISTRY I-LECTURES
> `CHEM UN1604` (Sequence 2) — 2ND TERM GEN CHEM (INTENSIVE)
> `CHEM UN2045` (Sequence 3) — INTENSVE ORGANIC CHEMISTRY
>
> Semester II — "Choose one of the following Chemistry courses depending on
> sequence:"
> `CHEM UN1404` (Sequence 1) — GENERAL CHEMISTRY II-LECTURES
> `CHEM UN1507` (Sequence 2) — INTENSVE GENERAL CHEMISTRY-LAB
> `CHEM UN2046` & `CHEM UN1507` (Sequence 3) — INTENSVE ORG CHEM-FOR 1ST YEAR
>
> Semester III — `CHEM UN2443` (Sequences 1 and 2) — ORGANIC CHEMISTRY
> I-LECTURES

**PDF chart, CHEMISTRY row ("three sequences, choose one"):**
"UN1403 (4) and Lab UN1500 (3) | UN1404 (4) | UN2443 (4)" ·
"UN1604 (4) | UN1507 (3)" · "UN2045 (4) | UN2046 (4) and Lab UN1507 (3)".

- **Rule:** `sequence_choice`
  - `"Sequence 1"` — `CHEM UN1403`, `CHEM UN1500`, `CHEM UN1404`, `CHEM UN2443`
  - `"Sequence 2"` — `CHEM UN1604`, `CHEM UN1507`, `CHEM UN2443`
  - `"Sequence 3"` — `CHEM UN2045`, `CHEM UN2046`, `CHEM UN1507`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "One complete chemistry sequence, every course of whichever you pick.
  Sequences 1 and 2 run on into Organic Chemistry I in semester III; sequence 3
  covers organic chemistry in the first year instead and does not take
  `CHEM UN2443`. Each sequence carries its own general chemistry laboratory —
  `CHEM UN1500` in sequence 1, `CHEM UN1507` in sequences 2 and 3 — so there is
  no separate general chemistry laboratory requirement."
- **Footnotes:** none on any chemistry cell.
- **Catalog:** every code ✓ — `CHEM UN1403` 4.0, `CHEM UN1500` 3.0,
  `CHEM UN1404` 4.0, `CHEM UN2443` 4.0, `CHEM UN1604` 4.0, `CHEM UN1507` 3.0,
  `CHEM UN2045` 4.0, `CHEM UN2046` 4.0.
- **Trap #1, the whole reason this is a `sequence_choice`.** Eight codes across
  three semesters, written as `n_of { n: 3 }` or `n_of { n: 4 }`, would accept
  `CHEM UN1403` + `CHEM UN1507` + `CHEM UN2046` — a first term of sequence 1
  welded to two terms of sequence 3. That is a registrable schedule and it
  completes no sequence. It would also accept `CHEM UN1604` + `CHEM UN2443` +
  `CHEM UN1500`, which skips the intensive laboratory entirely.
- **Cross-file note for `seas-major-biomedical-engineering`.** BME's file says
  of its own sequence 3: *"Sequence 3 (`CHEM UN2045`–`CHEM UN2046`) is printed
  with no laboratory at all, and is transcribed as printed rather than as
  guessed."* On the **ChemE** page the same sequence 3 explicitly carries
  `CHEM UN1507` as its laboratory. That is not a BME bug — each file is
  faithful to its own page — but it is worth a line in the BME header, because
  it makes the BME omission look much more like a Bulletin slip than a real
  curricular difference.

### 7. `advanced-natural-science-laboratory` — "Advanced Natural Science Laboratory"

**Bulletin, Degree Track grid (Semester V), verbatim:** "Adv Natural Science
Lab[2]".

**Footnote 2, verbatim:**

> Total of 3 points required. Choose from `CHEM UN2493` ORGANIC CHEM. LAB I
> TECHNIQUES (1.5), `CHEM UN2496` ORGANIC CHEM. LABORATORY II (1.5),
> `CHEM UN2543` ORGANIC CHEMISTRY LABORATORY (3), `CHEM UN2545` INTENSIVE
> ORGANIC CHEM LAB (3), `CHEM UN3085` PHYSICL-ANALYTICL LABORATORY I (3), BIOL
> 2501 (3), EEEB 3015 (3), or another course approved by the major adviser.

- **Rule:** `points_matching { points: 3, select: { include: [...] } }` —
  include `CHEM UN2493`, `CHEM UN2496`, `CHEM UN2543`, `CHEM UN2545`,
  `CHEM UN3085`, `BIOL UN2501`, `EEEB UN3015`
  - An include-only selector is legal and does exactly what is wanted:
    `compileSelector` sets `hasShape: false`, and
    `matchesCompiledSelector` then matches the include set **and nothing else**
    (`selector.ts`, "Such a selector matches its `include` list and nothing
    else").
  - **It must be `points_matching`, not `n_of { n: 1 }`.** Two of the seven
    options are 1.5-point courses and the requirement is a 3-point total, so
    `CHEM UN2493` + `CHEM UN2496` is a complete answer and `CHEM UN2493` alone
    is not. `n_of { n: 1 }` would go green on half a requirement; `n_of { n: 2 }`
    would refuse a student who took the single 3-point `CHEM UN3085`.
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "3 points total, taken in semester V. Two of the options are
  1.5-point half-laboratories that pair to make the 3 points. The Bulletin also
  allows 'another course approved by the major adviser', which is not checked
  here."
- **Bulletin code hygiene — trap #4 and a transcription hazard.** The footnote
  writes **"BIOL 2501"** and **"EEEB 3015"** with no level letters and, unlike
  the five CHEM entries, as **plain text rather than course links**. The
  registrar's codes are `BIOL UN2501` and `EEEB UN3015`; transcribe them in
  full bulletin form and note the discrepancy in the file header.
- **Catalog resolution — three problems, all real:**
  - `CHEM UN2543` — **MISS.** Renders with a title on the Bulletin page
    ("ORGANIC CHEMISTRY LABORATORY"), so the code is right and the gap is ours
    (four-term catalog coverage). Keep it, per the `COMS W1005` / `MATH UN3027`
    precedent in `seas-major-mechanical-engineering`.
  - `CHEM UN2493` — present but **0.0 points in our catalog**, against the
    Bulletin's (1.5). A `points_matching` rule reading 0 would never let this
    course contribute. Flag for the transcriber.
  - `EEEB UN3015` — present ("INTRO-STAT-ECOLGY/EVOL BIO-LAB") but **0.0 points
    in our catalog**, against the Bulletin's (3). Same failure mode.
  - `CHEM UN2496` 1.5 ✓, `CHEM UN2545` 3.0 ✓, `CHEM UN3085` 4.0 ✓,
    `BIOL UN2501` 3.0 ✓.
  - **Consequence:** if the two zero-point records are not fixed first, this
    group will under-report for students on the organic-lab and EEEB routes.
    Under-reporting is the recoverable direction, so ship it anyway — but say so
    in the note, and file the catalog rows as a separate issue.

### 8. `chemical-engineering-core` — "Chemical Engineering Core"

**Bulletin, Degree Track grid, verbatim, in term order:**

> Semester I — `CHEN E1000` Chemical Engineering for Humanity
> Semester III — `CHEN E2100` Material and Energy Balances
> Semester IV — `CHEN E3020` ANALYSIS OF CHEM ENGIN PROBLMS
> Semester V — `CHEN E3110` PRINCIPLES OF TRANSPORT PHENOMENA;
> `CHEE E3010` PRIN-CHEM ENGIN-THERMODYNAMICS
> Semester VI — `CHEN E3230` REACTOR KINETICS/REACTOR DESIGN;
> `CHEN E4140` ENGINEERING SEPARATIONS
> Semester VII — `CHEN E4500` PROCESS ＆ PRODUCT DESIGN I;
> `CHEN E4300` CHEM PROC. CONTROL ＆ SAFETY
> Semester VIII — `CHEN E3810` CHEM ENG ＆ APPLIED CHEM LAB

- **Rule:** `all_of` — `CHEN E1000`, `CHEN E2100`, `CHEN E3020`, `CHEN E3110`,
  `CHEE E3010`, `CHEN E3230`, `CHEN E4140`, `CHEN E4500`, `CHEN E4300`,
  `CHEN E3810`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note:** "All ten. `CHEE E3010` is the one course in the core that is not a
  CHEN course — Principles of Chemical Engineering Thermodynamics is listed
  under CHEE. `CHEN E3810` is the chemical engineering laboratory, taken in the
  final semester."
- **Footnotes:** none on any of these cells.
- **Catalog:** all ten ✓ — `CHEN E1000` 1.0, `CHEN E2100` 3.0, `CHEN E3020` 3.0,
  `CHEN E3110` 3.0, `CHEE E3010` 3.0, `CHEN E3230` 3.0, `CHEN E4140` 3.0,
  `CHEN E4500` 4.0, `CHEN E4300` 3.0, `CHEN E3810` 3.0.
- **Splitting option:** the PDF chart puts `CHEN E1000`, `CHEN E2100` and
  `CHEN E3020` in a row labelled "CHEM. ENG. REQUIREMENT"; `CHEN E3110`,
  `CHEE E3010`, `CHEN E3230`, `CHEN E4140`, `CHEN E4500` in "REQUIRED COURSES";
  and the advanced natural-science lab, `CHEN E4300` and `CHEN E3810` in
  "REQUIRED LABS". Splitting the group along those lines is defensible;
  I recommend one group, because the HTML Degree Track table (the primary
  source) carries no row labels at all and the chart's placement of
  `CHEN E4300` ("Chem. eng. process control and safety") under "REQUIRED LABS"
  looks like a layout accident.
- **`CHEN E4510` is deliberately absent.** `CHEN E4510` PROCESS ＆ PRODUCT
  DESIGN II is in our catalog (3.0 points) and most peer programs require a
  two-term capstone, so its absence looks like a lost row. It is not: the HTML
  grid and the PDF chart independently print `CHEN E4500` alone, and the
  Semester VII total of 16 closes without it (4 + 3 + 3 nontech + 6 tech = 16).
  Do not add it. It is a natural technical elective, nothing more.

### 9. `engineering-foundations` — "Engineering Foundations"

**Bulletin, Degree Track grid, verbatim:**

> Semester II — `ENGI E1006` INTRO TO COMP FOR ENG/APP SCI
> Semester I *and* Semester II — `ENGI E1102` (taken Semester l or ll) THE ART
> OF ENGINEERING

**Curriculum tab, verbatim:** "Those wishing to major in chemical engineering
should also take `ENGI E1006` INTRO TO COMP FOR ENG/APP SCI in term II."

- **Rule:** `all_of` — `ENGI E1006`, `ENGI E1102`
- **sourceUrl:** `…#degreetracktextcontainer`
- **Note (adapt BME's, which has the same shape):** "Computing and The Art of
  Engineering. `ENGI E1006` is named with no alternative for chemical
  engineering students — unlike Mechanical Engineering and Operations Research,
  this page offers no `COMS W1004` substitute. `ELEN E1201` is not required for
  this degree. Principles of Economics is also required and is tracked on the
  Liberal Arts Core rather than repeated here."
- **Catalog:** `ENGI E1006` 3.0 ✓; `ENGI E1102` ✓ but with **null points** in
  our catalog against the Bulletin's 4 — worth a catalog fix, harmless for an
  `all_of` rule.
- **`ENGI E1102` belongs HERE, not on `seas-core`.** See the placement section
  below.

### 10. `technical-electives` — "Technical Electives" (`attested`)

**Bulletin, Curriculum tab, verbatim:**

> The Degree Track table also shows that a significant fraction of the
> junior-senior program is reserved for electives, both technical and
> nontechnical. Twenty-one points (7 courses) of technical electives are
> included in the junior and senior year requirements. Technical electives are
> science and/or technology based and feature quantitative analysis. Generally,
> technical electives must be 3000 level or above but there are a few exceptions
> including: [`PHYS UN1403`, `PHYS UN2601`, `BIOL UN2005`, `BIOL UN2006`,
> `BIOL UN2501`, `CHEM UN2444`]
>
> A full list of approved technical elective courses in each category can be
> found on the departmental website or obtained from the departmental advisers.
> The technical electives are subject to the following constraints:
>
> **1 Thermodynamics Elective:** One technical elective must fall within the
> category "thermodynamics electives": Chemical engineering courses with 50% or
> more content related to thermodynamics. Examples include: [`CHAP E4120`,
> `CHEN E4650`, `CHEN E4880`]
>
> **1 Transport Elective:** One technical elective must fall within the category
> "transport electives": Chemical engineering courses with 50% or more content
> related to transport phenomena (fluid mechanics, heat transfer, or mass
> transfer). Examples include: [`CHEN E4150`, `CHEN E4201`, `CHEN E4600`,
> `CHEN E4630`]
>
> **3 Engineering Technical Electives:** Three upper-level SEAS technical
> courses having significant engineering content. At least one of these three
> tech electives must have the designators BMCH, CHEN, CHEE, CHAP, or MECH.
> Qualifying courses are determined by Chemical Engineering advisors.
>
> **2 STEM Technical Electives:** The remaining two technical elective courses
> must comprise "advanced STEM" coursework, which includes the natural sciences,
> mathematically-oriented SEAS classes, and certain courses based on engineering
> topics. Qualifying courses are determined by Chemical Engineering department
> advisors. For a course to count towards this category, these STEM courses must
> be sufficiently advanced/technical (generally 3000 level or above), but do not
> necessarily contain engineering content. A limited number of natural science
> courses (e.g. Chemistry, Physics, Biology) with course number less than 3000
> level are approved for this category.
>
> Up to 6 points of `CHEN E3900` UNDERGRADUATE RESEARCH PROJECT may be counted
> toward the technical elective content. (Note that if more than 3 points of
> research are pursued, an undergraduate thesis is required.)

- **Rule:** `attested`
- **sourceUrl:** `…/chemical-engineering-bs/#curriculumtextcontainer`
- **Attestation note (draft):** "21 points — 7 courses — of technical electives
  in the third and fourth years, split by the department into one thermodynamics
  elective, one transport elective, three engineering technical electives (at
  least one with a BMCH, CHEN, CHEE, CHAP or MECH designator) and two advanced
  STEM electives. Every category is defined as 'qualifying courses are
  determined by Chemical Engineering advisors', and the full approved list is on
  the departmental website rather than in the Bulletin, so this one is yours to
  confirm. Up to 6 points of CHEN E3900 may count; more than 3 points of
  research requires a thesis."
- **Why not split out a checkable floor, the way BME does?** BME carries a
  `points_matching` group for its 6-point BMEN floor because BMEN is a real,
  populated subject code. ChemE's equivalent floor is "at least one … with the
  designators BMCH, CHEN, CHEE, CHAP, or MECH", and **three of those five
  designators have zero rows in our catalog** (`BMCH` 0, `CHAP` 0, `MECH` 0;
  `CHEE` has 2, `CHEN` has 59). A `points_matching` over the five would be a
  requirement that is checkable for some students and structurally unmeetable
  for others depending on which designator their course carries. Keep it
  attested and say why in the header.
- **Catalog resolution for the codes the prose names:** `PHYS UN1403` 3.0 ✓,
  `PHYS UN2601` 3.5 ✓, `BIOL UN2005` 4.0 ✓, `BIOL UN2006` 4.0 ✓,
  `BIOL UN2501` 3.0 ✓, `CHEM UN2444` 4.0 ✓, `CHEN E3900` 0.0–6.0 ✓,
  `CHAP E4120` **MISS**, `CHEE E4252` 3.0 ✓, `ORCA E2500` 3.0 ✓.

### 11. Nothing else. The nontechnical block is `seas-core`.

The Degree Track grid also prints `ENGL CC1010`, "One core humanities elective
(3–4)", "Three core humanities electives (11)", "Complete Required Nontech
Elective(s)", `PHED UN1001` and `PHED UN1002`. **Every one of those is already a
group on `seas-core`** (`university-writing`, `core-sequence`,
`art-or-music-hum`, `principles-of-economics`, `nontechnical-electives`,
`physical-education`). Do not repeat any of them here — that is trap #7, and it
is the exact duplication that was removed from three SEAS major files on
2026-08-24.

---

## Which file each requirement belongs on

| Requirement | File | Why |
|---|---|---|
| Calculus, ODE, math elective, physics, physics lab, chemistry sequence, advanced natural-science lab, the ten CHEN/CHEE core courses, technical electives | **`seas-major-chemical-engineering`** | `seas-core`'s header: "NOT ENCODED: the technical requirements (math, science, computing, the major's own track), which vary per department and belong on the department's own program." |
| `ENGI E1006` | **`seas-major-chemical-engineering`** | Computing is department-specific — ChemE names it with no alternative, MechE and OR offer substitutes. |
| **`ENGI E1102`** | **`seas-major-chemical-engineering`** | Deliberate. `seas-core` states it: "ENGI E1102 The Art of Engineering is required of every engineering student and this page says so, but it is encoded on each major rather than here, because a course held in both places is evaluated twice and the two copies can disagree." All four existing SEAS major files carry it. |
| **`ECON UN1105`** | **`seas-core` only** | Also deliberate, and the other half of the same rule. It is `seas-core`'s `principles-of-economics` group. It appears on the ChemE Degree Track grid (footnote 1) and **must not** be transcribed into this file — that is the duplication removed from MechE, BME and OR on 2026-08-24. |
| `ENGL CC1010`, Lit Hum / CC / Global Core, Art or Music Hum, List B electives, `PHED UN1001`/`UN1002` | **`seas-core`** | The 27-point nontechnical Core, shared by every engineering degree. |

---

## Point arithmetic

The HTML Degree Track table publishes **no** point values (every `hourscol` cell
is empty). The Bulletin-hosted PDF chart does, including per-semester totals.
Reconciliation below uses the chart's own footnote-2 convention: "Taking the
first track in each row and E1102 in Semester II."

**First and second years** (chart totals: 17 · 17 · 17 · 17 = **68**)

| Sem | Blocks | Sum |
|---|---|---|
| I | `MATH UN1101` 3 + `PHYS UN1401` 3 + `CHEM UN1403` 4 + `CHEM UN1500` 3 + `ENGL CC1010` 3 + `CHEN E1000` 1 | **17** ✓ |
| II | `MATH UN1102` 3 + `PHYS UN1402` 3 + `CHEM UN1404` 4 + `ENGI E1006` 3 + `ENGI E1102` 4 | **17** ✓ |
| III | `APMA E2000` 4 (+ `APMA E2001` 0) + `PHYS UN1494` 3 + `CHEM UN2443` 4 + one core humanities elective 3 + `CHEN E2100` 3 | **17** ✓ |
| IV | `MATH UN2030` 3 + three core humanities electives 11 + `CHEN E3020` 3 | **17** ✓ |

**Third and fourth years** (chart totals: 15 · 16 · 16 · 13 = **60**)

| Sem | Blocks | Sum |
|---|---|---|
| V | `CHEN E3110` 3 + `CHEE E3010` 3 + adv. nat. sci. lab 3 + nontech 3 + tech 3 | **15** ✓ |
| VI | math elective 3 + `PHED UN1001` 1 + `CHEN E3230` 3 + `CHEN E4140` 3 + nontech 3 + tech 3 | **16** ✓ |
| VII | `CHEN E4500` 4 + `CHEN E4300` 3 + nontech 3 + tech 6 | **16** ✓ |
| VIII | `PHED UN1002` 1 + `CHEN E3810` 3 + tech 9 | **13** ✓ |

**Degree total: 68 + 60 = 128.** Matches the SEAS B.S. requirement stated on the
First Year/Sophomore Program page ("the 128 points of credit required for a B.S.
degree") and on the APAM double-major page ("the regular 128-point
requirement"). **No mismatch anywhere — trap #6 clears.**

Two cross-checks that also close:

- **Technical electives:** 3 + 3 + 6 + 9 = **21 points**, exactly the
  Curriculum tab's "Twenty-one points (7 courses) of technical electives".
- **The 27-point nontechnical requirement:** `ENGL CC1010` 3 + one core
  humanities elective 3–4 + three core humanities electives 11 + years 3–4
  nontechnical 3 + 3 + 3 = **26–27**. This is why `seas-core` says List B is
  "9 to 11 elective points" rather than a flat 9: a student who takes the
  3-point Global Core route into Semester III lands at 26 and owes a tenth
  point. The ChemE chart budgets exactly 9. Encode nothing new; the range on
  `seas-core` already covers it.

**Catalog-versus-Bulletin point mismatches found while reconciling** (all
harmless to `all_of` / `n_of` rules, material to the one `points_matching` rule):

| Course | Bulletin | Our catalog |
|---|---|---|
| `CHEM UN2493` | 1.5 | **0.0** |
| `EEEB UN3015` | 3 | **0.0** |
| `PHED UN1001` | 1 | **0.0** (`PHED UN1002` is 1.0) |
| `ENGI E1102` | 4 | **null** |

---

## Not encodable

Each item is quoted verbatim, with the reason the rule language cannot hold it.

1. **Open-ended math elective.** "…or another course approved by the major
   adviser." (Footnote 4.) An advisor petition. Trap #4: a numeric floor over
   APMA/MATH/STAT would sweep in courses the department has not approved.
2. **Open-ended advanced natural-science laboratory.** "…or another course
   approved by the major adviser." (Footnote 2.) Same reason.
3. **The whole technical-elective taxonomy.** "Qualifying courses are determined
   by Chemical Engineering advisors" (twice), and "A full list of approved
   technical elective courses in each category can be found on the departmental
   website or obtained from the departmental advisers." The governing list is
   off-Bulletin, and the categories ("50% or more content related to
   thermodynamics") are content judgements no course record carries.
4. **The designator floor.** "At least one of these three tech electives must
   have the designators BMCH, CHEN, CHEE, CHAP, or MECH." Three of the five have
   no rows in our catalog; a rule over them is checkable for some students and
   not for others.
5. **The research cap and its thesis trigger.** "Up to 6 points of `CHEN E3900`
   … may be counted toward the technical elective content. (Note that if more
   than 3 points of research are pursued, an undergraduate thesis is required.)"
   A cap on how much of one course may count toward a block, plus a requirement
   conditional on how another requirement was satisfied. The language has
   neither.
6. **The elective specializations.** "To fulfill an elective specialization, the
   student must complete any combination of four courses (12 points total) from
   the list of suggested courses in that subject area." Four specializations —
   Advanced Materials, Biotechnology and Biopharmaceuticals, Climate/Environment
   /Energy Solutions, Data and Computational Science — each with its own
   `sc_courselist`. **These are not degree requirements** (the analogous BME
   concentrations were excluded on exactly this ground), and encoding them would
   put four optional 12-point blocks on every student's audit. Leave them out;
   name them in the header.
7. **The specializations' placeholder rows.** Three of the four specialization
   tables contain a literal row `CHEN XXXX` with a footnote reading "Polymer
   Science for Sustainability (taught as a `CHEN E4900` Topics in Chemical
   Engineering course in Spring 2025; it will be given its own course number in
   future semesters)" / "Sustainable Process Engineering (…)". A course with no
   number yet. Moot given (6), but record it.
8. **Term ordering.** The whole degree is published as an eight-semester grid
   with courses pinned to terms. The audit has no notion of "by semester IV".
9. **Combined Plan and transfer accommodation.** "…the chemical engineering
   program is designed to be readily accessible to participants in any of
   Columbia's Combined Plans and to transfer students. In such cases, the
   guidance of one of the departmental advisers in planning your program is
   required."
10. **The nontechnical exclusions.** "(Professional, workshop, lab, project,
    scientific, studio, music instruction, and master's-level professional
    courses do not satisfy the 27-point nontechnical requirement.)" This lives
    on `seas-core` and is already `attested` there.

---

## Footnotes resolved (every marker on both source tabs)

| Marker | Attached to | Resolution |
|---|---|---|
| Curriculum tab, `1` on `ORCA E2500` in the *Data and Computational Science* specialization table | the `ORCA E2500` row only | "These courses cannot be counted as technical electives, but they may be used for the **math elective**." Marker is on one row; the text says "These courses" (plural) — see *Open questions*. |
| Degree Track `1` | "One core humanities elective (3–4)" (Sem III) and, by content, "Three core humanities electives (11)" (Sem IV) | Names `HUMA CC1001`/`COCI CC1101`/initial Global Core course; `HUMA CC1002`/`COCI CC1102`/`ASCM UN2002`/second Global Core course; `ECON UN1105` (4) with `ECON UN1155` (0); `HUMA UN1121` or `HUMA UN1123` (3). **All of this is `seas-core`.** `ASCM UN2002` is **MISS** in our catalog. |
| Degree Track `2` | "Adv Natural Science Lab" (Sem V) | The seven-option 3-point laboratory list. → group 7. |
| Degree Track `3` | "Complete Required Tech Elective(s)" (Sems V, VI, VII, VIII) | "See the bulletin text for technical elective requirements." → group 10. |
| Degree Track `4` | "Math Elective" (Sem VI) | The six-option math elective list. → group 3. |

No other `<sup>` markers exist on either tab. The remaining `sc_footnotes` blocks
on the page belong to the four specialization tables (three of them the
`CHEN XXXX` note above), which are not requirements.

---

## The nine traps, one verdict each

1. **`sequence_choice` vs `n_of {n:2}`** — Applies twice. Physics is a
   `sequence_choice` (2×3). Chemistry is a `sequence_choice` (3 branches of
   4/3/3 courses) and is the more dangerous of the two, because eight codes over
   three semesters invite a flat `n_of`. Both encoded as sequences.
2. **Delegated blocks nobody picked up** — This is the whole job here, and the
   answer is ten groups, not three. The full Degree Track grid was read cell by
   cell and every cell is accounted for above, either on this file or on
   `seas-core` (see the placement table). Math ✓, physics ✓, physics lab ✓,
   chemistry incl. its lab ✓, advanced natural-science lab ✓, computing ✓,
   `ENGI E1102` ✓, PE → `seas-core` ✓, nontechnical → `seas-core` ✓.
3. **Footnotes** — Five markers on the page; all five resolved and attached in
   the table above.
4. **"Or higher" / open-ended substitutions** — Two instances, both "or another
   course approved by the major adviser" (footnotes 2 and 4). Recorded verbatim,
   not encoded. No "or higher" phrasing appears on this page.
5. **CourseLeaf eats labels** — One suspect: the Semester III physics-lab cell
   whose heading names sequences it does not list. Checked against the chart's
   Semester III total of 17 and it closes exactly. No lost label.
6. **Reconcile the arithmetic** — Done, block by block, against the PDF chart's
   own per-semester totals. 68 + 60 = 128, matching the published SEAS degree
   total. Four catalog point values disagree with the Bulletin and are tabled.
7. **Duplicated requirements across files** — `ENGI E1102` here, `ECON UN1105`
   on `seas-core` only, PE on `seas-core` only, no `ELEN E1201` at all. Stated
   in the placement table.
8. **Honors / accelerated sequences** — Hunted explicitly. Physics sequences 2
   (`UN1601`/`UN1602`) and 3 (`UN2801`/`UN2802` Accelerated Physics) are the
   honors routes and both are encoded. Chemistry sequences 2 (`UN1604`
   intensive) and 3 (`UN2045`/`UN2046` intensive organic in the first year) are
   the accelerated routes and both are encoded — sequence 3 is precisely the
   `cc-major-economics` shape, a student on the *harder* path who would be told
   to go back and take general chemistry if the group were transcribed as a
   one-lecture `n_of`. There is no honors calculus variant on this page
   (`MATH UN1207`/`UN1208` are not offered as options), and no Early Decision
   track of the kind Mechanical Engineering publishes.
9. **Courses the Bulletin names that our catalog lacks** — `CHEM UN2543`,
   `CHAP E4120`, `ASCM UN2002`. All three render with titles on the Bulletin (so
   the codes are right and the gap is ours) except `ASCM UN2002`, which is a
   `seas-core` concern anyway. Keep `CHEM UN2543` in group 7 per the
   `COMS W1005` precedent. Also flag the four point-value mismatches, which are
   the same class of problem one level down.

---

## Open questions

1. **Is `CHEN E1000` actually required?** The Curriculum tab calls it "the
   professional elective `CHEN E1000` Chemical Engineering for Humanity" and
   says students "should take" it. The Degree Track grid prints it as a plain
   required row, and the PDF chart's Semester I total of 17 does **not** close
   without its 1 point (3 + 3 + 4 + 3 + 3 = 16). The arithmetic wins, so I have
   it in `chemical-engineering-core` — but "professional elective" is odd
   language for a required course. **What would resolve it:** the ChemE
   department's own curriculum page, which returns HTTP 403 to curl, WebFetch
   and a browser user-agent alike; or a departmental advising sheet; or asking
   the department. This is the reason this dossier is 9 and not 10.
2. **What is the scope of the Curriculum-tab footnote 1?** The `<sup>1</sup>`
   marker sits on the `ORCA E2500` row alone, but the footnote reads "**These
   courses** cannot be counted as technical electives, but they may be used for
   the math elective." The last four rows of that table are `ORCA E2500`,
   `STAT GU4001`, `COMS W4721`, `COMS W4771`, and `STAT GU4001` is *already* in
   the math-elective footnote — which reads as corroboration that the footnote
   covers all four. If it does, `ORCA E2500` and possibly `COMS W4721`/
   `COMS W4771` should be added to group 3. I have **not** added them: guessing
   the scope of a footnote is exactly the failure mode the brief forbids.
   **What would resolve it:** the department, or a prior-edition diff of the
   same table.
3. **No secondary source was obtainable.** `cheme.columbia.edu` returns 403 to
   every client available in this environment. The Bulletin-hosted PDF chart is
   the closest thing to an independent check and it agrees with the HTML grid
   cell for cell, but it is the same publisher. If the department's page later
   becomes reachable, re-check items 1 and 2 and the technical-elective category
   lists.
4. **Does the general chemistry laboratory really live inside the chemistry
   sequence for every branch?** Sequence 1 carries `CHEM UN1500` and sequences 2
   and 3 carry `CHEM UN1507`, so on this page the answer is yes. But
   `seas-major-biomedical-engineering` records the same sequence 3 as having no
   laboratory. One of the two department pages is wrong about
   `CHEM UN2045`–`UN2046`. **What would resolve it:** the Chemistry department's
   own sequence description, or the registrar.

---

## Proposed golden records

Written by hand from the Bulletin. Ids and shape follow `lib/requirements/golden.ts`.
None of these expectations was computed by the evaluator.

### `cheme-accelerated-chemistry`

> **who:** "Chemical engineering major on chemistry sequence 3 — intensive
> organic chemistry in the first year instead of general chemistry."

The regression record for this program, and the direct analogue of
`econ-honors-math`. A student on the *hardest* chemistry route holds no
`CHEM UN1403`, no `CHEM UN1404` and no `CHEM UN2443`. Transcribed as a
one-lecture `n_of` (the MechE/OR shape) or as a two-course BME-style sequence,
this student is told to go back and take general chemistry — after having
completed a harder sequence the Bulletin publishes as sufficient.

```
programId: "seas-major-chemical-engineering"
taken: ["CHEM UN2045", "CHEM UN2046", "CHEM UN1507",
        "PHYS UN2801", "PHYS UN2802", "PHYS UN3081",
        "MATH UN1101", "MATH UN1102", "APMA E2000", "APMA E2101"]
expect:
  chemistry:            satisfied                    # sequence 3, all three courses
  physics:              satisfied                    # sequence 3, both terms
  physics-laboratory:   satisfied                    # PHYS UN3081
  calculus:             satisfied, completed 3
  differential-equations: satisfied                  # APMA E2101 is one of the two
  advanced-natural-science-laboratory: unmet, completed 0
  chemical-engineering-core: unmet, completed 0
  engineering-foundations: unmet, completed 0
```

Note the deliberate check on `physics-laboratory`: `PHYS UN3081` must satisfy the
laboratory group and must **not** also be counted as a third term of physics
sequence 3.

### `cheme-mixed-chemistry-sequence`

> **who:** "Chemical engineering major who took the first term of chemistry
> sequence 1 and then the second and third terms of sequence 3 — three chemistry
> courses, no completed sequence."

The schedule a flat `n_of { n: 3 }` would wrongly pass. Every course is real, the
student has done three terms of chemistry, and they have completed no sequence
the department recognises. Must read **in progress**, never satisfied — and
never unmet either, because they have genuinely started sequence 1.

```
programId: "seas-major-chemical-engineering"
taken: ["CHEM UN1403", "CHEM UN2046", "CHEM UN1507"]
expect:
  chemistry: in_progress
```

With the recommended encoding, `sequence_choice` scores sequence 3 at 2/3
(`UN2046` + `UN1507`) and sequence 1 at 1/4, reports sequence 3, and returns
`in_progress` with `CHEM UN2045` as the remaining candidate.

### `cheme-half-points-lab`

> **who:** "Chemical engineering major who satisfied the advanced natural-science
> laboratory with the two 1.5-point organic half-labs."

The record that distinguishes `points_matching` from `n_of`. A student holding
`CHEM UN2493` + `CHEM UN2496` has 3 points and is done; a student holding
`CHEM UN2493` alone has 1.5 and is not. `n_of { n: 1 }` calls both satisfied;
`n_of { n: 2 }` calls the single-3-point-course student unfinished.

```
programId: "seas-major-chemical-engineering"
taken: ["CHEM UN2493", "CHEM UN2496"]
expect:
  advanced-natural-science-laboratory: satisfied, completed 3   # points, not courses
```

**This record will FAIL against today's catalog**, because `CHEM UN2493` is
stored with 0.0 points. That is the point of writing it: it turns a silent
catalog defect into a red test. If the catalog is not fixed first, land the
record with the expectation set from the Bulletin and an explicit comment saying
which side is wrong — never soften the expectation to make it green.

### `cheme-no-econ-duplication` (cross-program guard)

> **who:** "Chemical engineering major who has taken Principles of Economics and
> The Art of Engineering, audited against both programs at once."

The trap-#7 guard, in the shape `scripts/dump-program.ts` was written for.
Running `seas-core` and `seas-major-chemical-engineering` together, `ECON UN1105`
must appear in **exactly one** group across the two programs (`seas-core`'s
`principles-of-economics`), and `ENGI E1102` in exactly one
(`seas-major-chemical-engineering`'s `engineering-foundations`).

```
taken: ["ECON UN1105", "ENGI E1102", "ENGI E1006"]
expect (seas-core):                        principles-of-economics: satisfied
expect (seas-major-chemical-engineering):  engineering-foundations: satisfied, completed 2
                                           # and NO principles-of-economics group exists here
```
