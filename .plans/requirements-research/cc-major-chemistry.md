# Chemistry (Columbia College)

- **Program id:** `cc-major-chemistry`
- **School:** CC (Columbia College) · **Kind:** `major` · **Department:** Chemistry
- **Degree points:** not published. `degreePoints` is documented as "only meaningful on `kind: "core"`", so leave it unset. See *Point arithmetic* — the Bulletin gives **no point total and no per-row points anywhere in the Chemistry major table**.
- **Bulletin edition:** 2026–2027
- **Primary source URL:** `https://bulletin.columbia.edu/columbia-college/departments-instruction/chemistry/#requirementstextcontainer`
- **Date researched:** 2026-08-26
- **Catalog resolution:** run against the live Supabase catalog on 2026-08-26 (`.env.local` present, DB reachable). **Every course code named below resolves.** Zero unmatched codes — the same clean result `cc-major-economics` has.

## Confidence: 8.5 / 10

Nine of the ten rubric items are fully met: every group is traced to a URL with verbatim rendered text, the page carries **zero footnote markers** (verified against the raw HTML — no `sc_footnotes`, no `<sup>` anywhere on the page), every code is in bulletin form and checked against our catalog, the honors math variant is found and encoded, all nine traps have verdicts, everything unencodable is listed, file ownership is stated, and the golden records were written by hand from the Bulletin.

**The half-point gap is trap #6.** The Chemistry major publishes no point total and no per-row points, so there is nothing to reconcile the block-by-block sum *against*. I computed the sum from the catalog's own point values (below) and it is internally consistent, but that is a self-check, not the independent cross-check the rubric asks for. The Physics dossier's 41-point figure is what a real reconciliation looks like; chemistry has no equivalent. **What would close it:** the department's own advising sheet or the DUS confirming a point total. `chem.columbia.edu` is behind Cloudflare and returns 403 to both `curl` and `WebFetch`, so I could not consult the secondary source at all.

---

## Requirement groups

The Bulletin splits this major across **two headings on one page**. The `Major in Chemistry` table is mostly pointers: its first row is "Select one of the chemistry tracks outlined above", its Physics row is "Select one of the physics sequences outlined above in the Guidelines section". Both targets live under **`Required Coursework for all Programs`**, higher up the same page. This is the `cc-major-economics` indirection problem — a parser reading the major table alone produces a chemistry requirement with zero courses in it.

Note also that the major table's own prose says *"Select one of the tracks outlined above in **Guidelines for all Chemistry Majors, Concentrators, and Interdepartmental Majors**"* — **a heading that does not exist on the page**. The actual heading is `Required Coursework for all Programs`. The link text is stale; the target section is unambiguous.

All groups take the same `sourceUrl`:

```
https://bulletin.columbia.edu/columbia-college/departments-instruction/chemistry/#requirementstextcontainer
```

---

### 1. `chemistry-track` — "Chemistry Track"

**Rendered text, verbatim** (heading `Required Coursework for all Programs` → `Chemistry Tracks`):

> All students who wish to start with Track 2 or 3 courses must take an assessment during orientation week ahead of fall semester. The results of the assessment are used to advise students which track to pursue. Unless otherwise specified below, all students must complete one of the following tracks:

> **Track 1**
> CHEM UN1403 GENERAL CHEMISTRY I-LECTURES
> CHEM UN1404 GENERAL CHEMISTRY II-LECTURES
> CHEM UN1500 GENERAL CHEMISTRY LABORATORY
> CHEM UN2443 ORGANIC CHEMISTRY I-LECTURES
> CHEM UN2444 ORGANIC CHEMSTRY II-LECTURES
> CHEM UN2493 ORGANIC CHEM. LAB I TECHNIQUES
> CHEM UN2494 ORGANIC CHEM. LAB II SYNTHESIS

> **Track 2**
> CHEM UN1500 GENERAL CHEMISTRY LABORATORY
> **or** CHEM UN1507 INTENSVE GENERAL CHEMISTRY-LAB
> CHEM UN1604 2ND TERM GEN CHEM (INTENSIVE)
> CHEM UN2443 ORGANIC CHEMISTRY I-LECTURES
> CHEM UN2444 ORGANIC CHEMSTRY II-LECTURES
> CHEM UN2493 ORGANIC CHEM. LAB I TECHNIQUES
> CHEM UN2494 ORGANIC CHEM. LAB II SYNTHESIS

> **Track 3**
> CHEM UN1507 INTENSVE GENERAL CHEMISTRY-LAB
> CHEM UN2045 INTENSVE ORGANIC CHEMISTRY
> CHEM UN2046 INTENSVE ORG CHEM-FOR 1ST YEAR
> CHEM UN2545 INTENSIVE ORGANIC CHEM LAB

And from the major table itself: *"Select one of the chemistry tracks outlined above."*

**Proposed rule: `sequence_choice`, four alternatives.**

The Bulletin says "one of the following tracks", and the tracks are whole multi-course programs that share courses (`CHEM UN2443`/`UN2444`/`UN2493`/`UN2494` appear in both Tracks 1 and 2; `CHEM UN1500` appears in both Tracks 1 and 2; `CHEM UN1507` appears in both Tracks 2 and 3). Written as `n_of` over the union, a student holding `CHEM UN1403` + `CHEM UN1604` + `CHEM UN1500` + `CHEM UN2443` has four chemistry courses and has completed no track. This is trap #1 and it is the whole reason `cc-major-biology` uses `sequence_choice` for the same department's courses.

Track 2's internal `or` (`CHEM UN1500` **or** `CHEM UN1507`) has no home inside a `sequence_choice` branch, so it expands to two alternatives — exactly the way `cc-major-biology` expands its "Option 3" into two sequences that differ only in their final lab.

```
sequence_choice
  "Track 1 — general chemistry, then organic"
    CHEM UN1403, CHEM UN1404, CHEM UN1500,
    CHEM UN2443, CHEM UN2444, CHEM UN2493, CHEM UN2494
  "Track 2 — intensive general chemistry, general chemistry laboratory"
    CHEM UN1500, CHEM UN1604,
    CHEM UN2443, CHEM UN2444, CHEM UN2493, CHEM UN2494
  "Track 2 — intensive general chemistry, intensive laboratory"
    CHEM UN1507, CHEM UN1604,
    CHEM UN2443, CHEM UN2444, CHEM UN2493, CHEM UN2494
  "Track 3 — first-year organic chemistry"
    CHEM UN1507, CHEM UN2045, CHEM UN2046, CHEM UN2545
```

**Laboratory verdict (the parent's explicit question).** Every general-chemistry and organic-chemistry laboratory on this major is **part of the track sequence, not its own group**:

| Course | Points | Role |
|---|---|---|
| `CHEM UN1500` General Chemistry Laboratory | 3 | inside Track 1; inside Track 2 as one of two alternatives |
| `CHEM UN1507` Intensive General Chemistry Lab | 3 | inside Track 2 (alternative) and Track 3 |
| `CHEM UN2493` Organic Chem. Lab I Techniques | **0** | inside Tracks 1 and 2 |
| `CHEM UN2494` Organic Chem. Lab II Synthesis | **0** | inside Tracks 1 and 2 |
| `CHEM UN2545` Intensive Organic Chem Lab | 3 | inside Track 3 |

`CHEM UN2493` and `UN2494` are genuinely **0.00 points** in both the Bulletin and our catalog. They are required and they add nothing to the point total; do not "correct" them.

**Note for the student:**
> One complete track, not a mix of them. Track 1 is the standard route; Tracks 2 and 3 require a department assessment exam taken during orientation week. Track 2 accepts either general chemistry laboratory — CHEM UN1500 or CHEM UN1507 — alongside CHEM UN1604. The general and organic chemistry laboratories are part of the track, so they are counted here rather than as a separate requirement. CHEM UN2493 and CHEM UN2494 carry 0 points and are still required.

**Footnotes:** none on this page.
**Catalog resolution:** all eleven distinct codes resolve.

---

### 2. `physical-chemistry` — "Physical Chemistry"

**Verbatim** (major table, under the `Chemistry` area header):

> CHEM UN3079 PHYSICAL CHEMISTRY I-LECTURES
> CHEM UN3080 PHYSICAL CHEMISTRY II-LECTURES

**Rule:** `all_of ["CHEM UN3079", "CHEM UN3080"]` — 4 + 4 = 8 points.
**Note:** "Both terms. The Bulletin says physical chemistry 'requires prior preparation in mathematics and physics'; the mathematics and physics requirements below are that preparation."

---

### 3. `physical-analytical-laboratory` — "Physical-Analytical Laboratory"

**Verbatim:**

> CHEM UN3085 PHYSICL-ANALYTICL LABORATORY I
> CHEM UN3086 PHYSICL-ANALYTCL LABORATORY II

**Rule:** `all_of ["CHEM UN3085", "CHEM UN3086"]` — 4 + 4 = 8 points.

**Laboratory verdict:** **its own requirement group.** These are two separate rows in the major table, outside every track and outside the physical chemistry lecture rows. The Bulletin's own prose calls them "the accompanying laboratory" for `CHEM UN3079`–`UN3080`, but it lists them as independent requirements, so they are transcribed as one. Splitting them from `physical-chemistry` rather than folding all four into a single `all_of` is a judgement call — see *Open questions* #3.

---

### 4. `advanced-organic-laboratory` — "Advanced Organic Chemistry Laboratory"

**Verbatim:** `CHEM UN3546 ADVANCED ORGANIC CHEMISTRY LAB`
**Rule:** `all_of ["CHEM UN3546"]` — 3 points.

**Laboratory verdict:** **its own requirement group.** It sits in the major table as a plain required row, unattached to any lecture and outside every track. Track 3 students take it in their second year alongside `CHEM UN2545`; Track 1 and 2 students take it in the third year. Either way it is required of everyone and is not part of a sequence.

(A single-course `all_of` is established practice here — see `seas-core`'s `university-writing`.)

---

### 5. `inorganic-chemistry` — "Inorganic Chemistry"

**Verbatim:** `CHEM GU4071 INORGANIC CHEMISTRY`
**Rule:** `all_of ["CHEM GU4071"]` — 4.5 points.

**This group must exist separately from group 7**, because group 7's selector reaches `CHEM GU4071` and would otherwise be satisfied by a course the student was required to take anyway. See group 7.

---

### 6. `senior-seminar` — "Senior Seminar"

**Verbatim:** `CHEM UN3920 SENIOR SEMINAR`
**Rule:** `all_of ["CHEM UN3920"]` — 2 points.

---

### 7. `research-or-advanced-course` — "Research or Advanced Course"

**Rendered text, verbatim:**

> Select one course from the following:
> CHEM UN3098 SUPERVISED INDEPENDENT RES
> OR Chemistry courses numbered CHEM GU4000 or above for 2 credit points or more

(The `CHEM UN3098` row is flush; the `OR Chemistry courses…` row is indented one level. Both belong to the "Select one course from the following:" header — confirmed against the raw table markup, not the rendered text.)

**Rule:**

```
n_matching
  n: 1
  select:
    subjects: ["CHEM"]
    numberRange: [4000, 9999]
    include: ["CHEM UN3098"]
    exclude: ["CHEM GU4145"]
    excludeGroups: ["inorganic-chemistry"]
```

**Why `n_matching` and not `n_of`.** The right-hand branch is open-ended over a level range, so the set cannot be enumerated. `n_matching` is also the only kind that carries a `CourseSelector`, which is where `excludeGroups` lives — and this group needs it.

**`excludeGroups: ["inorganic-chemistry"]` is load-bearing.** `CHEM GU4071` is a required course *and* falls inside `CHEM ≥ 4000`. Without the exclusion, a student who took the required Inorganic Chemistry and no research and no advanced elective reads this requirement as `1/1 DONE`. That is the exact failure `lib/requirements/vacuity.test.ts` screens for, and **the test will fail if this exclusion is omitted** — the vacuity student holds every `all_of` course, including `CHEM GU4071`. `excludeGroups` rather than `exclude: ["CHEM GU4071"]` because the former removes what the group *actually consumed*, which is the repo's documented preference.

**`exclude: ["CHEM GU4145"]`.** The Bulletin sets a floor of "2 credit points or more". `CourseSelector` has no points field, so the floor cannot be expressed as a rule. `CHEM GU4145` NMR SPECTROSCOPY is **1.00 point** in both the Bulletin and our catalog — the only `CHEM ≥ 4000` course currently below the floor that an undergraduate can plausibly take. Excluding it by code applies the Bulletin's own sentence with the data we have. This is a judgement, and it is recorded under *Not encodable* rather than hidden.

**Over-reach that stays.** `numberRange: [4000, 9999]` is the literal reading of "GU4000 or above" and it reaches `CHEM GR6155`, `GR6168`–`GR6170`, `GR6222`, `GR6231`, `GR8106`, `GR8108`, `GR8109`, `GR8120`, `GR8130`, `GR8223`, `GR8232`, `GR8300`, `GR8349`, `GR9201`, `GR9202`, `GR9307`. Most of those are real graduate courses that an advanced undergraduate genuinely could be permitted into, and the department says "or above". Three are not courses in any useful sense — `CHEM GR9201`/`GR9202` Preresearch Seminars and `CHEM GR9307` Research for the Doctorate. Capping the range at `4999` would under-count a student who took `CHEM GR6222`; leaving it open over-counts a doctoral registration nobody in the College holds. **Recommendation: keep `[4000, 9999]` and flag the three doctoral numbers in *Open questions*.** Do not invent a cap.

**Note for the student:**
> One course: either CHEM UN3098 Supervised Independent Research, or a chemistry course numbered CHEM GU4000 or above carrying at least 2 points. The 2-point floor is not checked automatically — CHEM GU4145 (1 point) is excluded by hand, but our catalog carries no point figure for CHEM GU4111, GU4313 or GU4324, so confirm the credit yourself. CHEM GU4071 is required elsewhere in this major and cannot fill this slot.

**Catalog resolution:** `CHEM UN3098` (4 pt) and `CHEM GU4145` (1 pt) both resolve. Thirty CHEM courses at 4000+ exist in the catalog; fifteen are GU-level and undergraduate-facing.

---

### 8. `physics` — "Physics"

**Rendered text, verbatim.** Major table row: *"Select one of the physics sequences outlined above in the Guidelines section."* The target, under `Required Coursework for all Programs` → `Physics Sequences`:

> Unless otherwise specified below, all students must complete one of the following sequences:

> **Sequence A** — For students with limited background in high school physics:
> PHYS UN1401 INTRO TO MECHANICS ＆ THERMO
> PHYS UN1402 INTRO ELEC/MAGNETSM ＆ OPTCS
> PHYS UN1403 INTRO-CLASSCL ＆ QUANTUM WAVES
> *For chemistry majors, the following laboratory courses are recommended, NOT required. For chemical physics majors, ONE of the following laboratory courses are required:*
> PHYS UN1494 INTRO TO EXPERIMENTAL PHYS-LAB
> PHYS UN3081 INTERMEDIATE LABORATORY WORK

> **Sequence B**
> PHYS UN1601 PHYSICS I:MECHANICS/RELATIVITY
> PHYS UN1602 PHYSICS II: THERMO, ELEC ＆ MAG
> PHYS UN2601 PHYSICS III:CLASS/QUANTUM WAVE
> *For chemistry majors, the following laboratory course is recommended NOT required. For chemical physics majors, the following laboratory course is required:*
> PHYS UN3081 INTERMEDIATE LABORATORY WORK

> **Sequence C** — For students with advanced preparation in physics and mathematics:
> PHYS UN2801 & PHYS UN2802 ACCELERATED PHYSICS I and ACCELERATED PHYSICS II
> *For chemistry majors, the following laboratory course is recommended NOT required. For chemical physics majors, the following laboratory course is required:*
> PHYS UN3081 INTERMEDIATE LABORATORY WORK

**Rule:**

```
sequence_choice
  "Sequence A"  PHYS UN1401, PHYS UN1402, PHYS UN1403
  "Sequence B"  PHYS UN1601, PHYS UN1602, PHYS UN2601
  "Sequence C"  PHYS UN2801, PHYS UN2802
```

**Laboratory verdict: NOT a requirement for this major, and it must not be encoded.** The lab rows sit inside the physics sequence tables and read as though they belong to the sequence; the qualifier sentence says the opposite. `PHYS UN1494` and `PHYS UN3081` are **recommended, not required, for chemistry majors** — they are required only for **chemical physics** majors, which is a different program on the same page. Encoding them would hand every chemistry major a red requirement for a course their adviser never asked for. This is the single easiest misread on the chemistry page.

**Note for the student:**
> One complete physics sequence, every term of whichever you pick. Sequences A and B run three terms; Sequence C runs two. The physics laboratory courses listed with each sequence — PHYS UN1494 and PHYS UN3081 — are recommended but NOT required for the chemistry major; the Bulletin requires them only of chemical physics majors.

**Cross-page discrepancy worth knowing:** the Physics department's own page prints the same Sequence A as `PHYS UN1401` + `UN1402` + **`UN2601`** for the *physics* major. The chemistry page prints `UN1403` for the *chemistry* major. Each file follows its own source — the same rule `seas-major-computer-science` applies to `COMS W4119` vs `CSEE W4119`.

---

### 9. `mathematics` — "Mathematics"

**Rendered text, verbatim** (major table, under the `Mathematics` area header):

> Select one of the following sequences:
> *Four semesters of calculus:*
> MATH UN1101 & MATH UN1102 & MATH UN1201 & MATH UN1202 — CALCULUS I and CALCULUS II and CALCULUS III and CALCULUS IV
> *Two semesters of honors mathematics:*
> MATH UN1207 & MATH UN1208 — HONORS MATHEMATICS A and HONORS MATHEMATICS B

**Rule:**

```
sequence_choice
  "Four semesters of calculus"      MATH UN1101, MATH UN1102, MATH UN1201, MATH UN1202
  "Two semesters of honors mathematics"  MATH UN1207, MATH UN1208
```

**This is the trap #8 group.** It is the `cc-major-economics` honors bug in a new department: four courses versus two, and a student who took the harder two-course path must not be told they failed a four-course requirement. `sequence_choice` is the only kind that gets this right — `n_of { n: 4 }` over the union would fail the honors student outright, and `n_of { n: 2 }` would pass `MATH UN1101` + `MATH UN1207`, which completes nothing.

**Note:** "One complete sequence. Four terms of calculus, or the two-term honors sequence. MATH UN1205 Accelerated Multivariable Calculus is accepted by several other departments but is not offered as an option here — the chemistry page names only these two routes."

**Not offered here:** unlike Biochemistry on the same page, the Chemistry major's math block has **no** "AP credit and one term of calculus" alternative. Do not copy that row across; it belongs to Biochemistry only.

---

## Point arithmetic

**The Bulletin publishes no total for this major and no points on any row.** I confirmed this against the raw HTML: every `<td class="hourscol">` in every Chemistry-major table is empty, and the strings "total credits", "total points" and "minimum of … points" appear nowhere in the requirements container. The only point figures anywhere near this program are `22 points` and `18 points`, and both belong to the **Concentration in Chemistry** (a legacy program for students who entered in or before 2023-24), not to the major.

So there is nothing to reconcile against. The reconciliation below is computed from the catalog's own point values and is offered as an internal consistency check, not as a match to a published number.

| Block | Minimum | Maximum |
|---|---|---|
| `chemistry-track` | 14 (Track 3: 3+4+4+3) | 19 (Track 1: 4+4+3+4+4+0+0) |
| `physical-chemistry` | 8 | 8 |
| `physical-analytical-laboratory` | 8 | 8 |
| `advanced-organic-laboratory` | 3 | 3 |
| `inorganic-chemistry` | 4.5 | 4.5 |
| `senior-seminar` | 2 | 2 |
| `research-or-advanced-course` | 2 (floor stated by the Bulletin) | 4.5 (`CHEM UN3098` is 4; `CHEM GU4071`-class courses are 4.5) |
| `physics` | 9 (Seq A 3+3+3, or Seq C 4.5+4.5) | 10.5 (Seq B 3.5+3.5+3.5) |
| `mathematics` | 8 (honors 4+4) | 12 (four calculus terms 3×4) |
| **Total** | **58.5** | **71.5** |

Track 2's two branches are both 15 points (3+4+4+4+0+0), between Track 3 and Track 1, so they do not move the bounds.

**Consistency checks that did pass:**
- Track 2's two branches are identical in every course except the laboratory, and both labs are 3 points — so the `or` is a genuine equal-weight alternative, not a lost row.
- `CHEM UN2408` (1 pt) appears in all three sample programs and in the major table, and is marked "(Recommended NOT required)" in the major table. Excluding it costs 1 point and is correct.
- No table in the major has a row-count that disagrees with a stated arithmetic, because no arithmetic is stated.

**One suspected lost row (trap #5), outside this program.** The `Minor in Chemistry` track tables each end with an **empty `<tr>`** — `[even lastrow] {} | {}` — where the major's equivalent tables end with a real course. That is CourseLeaf dropping a row. It affects `cc-minor-chemistry`, not this major; the major's own track tables have no empty rows. Flagged so that whoever transcribes the minor does not read the empty row as "nothing further".

---

## Not encodable

1. **"for 2 credit points or more"** (group 7, verbatim: *"OR Chemistry courses numbered CHEM GU4000 or above for 2 credit points or more"*). `CourseSelector` supports `subjects`, `numberRange`, `flag`, `include`, `exclude`, `excludeGroups` — **there is no points predicate**. The floor is approximated by excluding the one known sub-threshold course (`CHEM GU4145`, 1 pt) and named in the group note.

2. **Track eligibility.** *"All students who wish to start with Track 2 or 3 courses must take an assessment during orientation week ahead of fall semester."* Whether a student passed a placement assessment is not on any course record. The audit will happily report Track 3 satisfied for a student who was never eligible for it — which is harmless, since they could not have registered.

3. **The C-or-better condition on AP credit.** Verbatim: *"Students who register for CHEM UN1604 (2ND TERM GEN CHEM, INTENSIVE) are granted 3 points of credit; students who register for CHEM UN2045 (INTENSIVE ORGANIC CHEMISTRY I-CHEM UN2046 INTENSIVE ORGANIC CHEM II) are granted 6 points of credit. In either case, credit is granted only upon completion of the course with a grade of C or better."* Grade minima are explicitly outside the language.

4. **Departmental honors.** *"Departmental honors are awarded to 10 percent of the graduating majors each year. To be considered for department honors, students must have a grade point average of at least 3.6 in major courses and have participated in research on a project of high quality."* GPA and a quality judgement; not a requirement of the major in any case.

5. **Transfer and study-abroad equivalency.** *"Students who are transferring to Columbia should contact Dr. Vesna Gasperov … to have any chemistry courses assessed for equivalency."* Transfer credit equivalencies are named in `types.ts` as something the language deliberately cannot say.

6. **The `CHEM UN2408` recommendation.** *"CHEM UN2408 1ST YEAR SEM IN CHEMICAL RES (Recommended NOT required)"*. Recommendations are not requirements. Mention it in the `chemistry-track` note if desired; do not give it a group.

7. **The physics laboratory recommendation.** *"For chemistry majors, the following laboratory courses are recommended, NOT required."* Same reason. This one is dangerous rather than merely inert, because the rows sit inside the sequence table — see group 8.

8. **"Chemistry majors and interdepartmental majors usually postpone part of the Core Curriculum beyond the sophomore year."** Advice about term ordering. The audit has no notion of terms.

---

## Which file each requirement belongs on

**All nine groups belong on `cc-major-chemistry`.** Nothing is delegated and nothing is duplicated.

- **`cc-core` carries none of this.** Unlike the SEAS seam that hid an entire science block from `seas-major-computer-science`, the College Core has no technical block to delegate — `cc-core` is Lit Hum, CC, Art/Music Hum, Frontiers, University Writing, the two Science groups, Global Core, Foreign Language, PE and the swim test. The Chemistry department states its own outside coursework (physics, mathematics) in its own `Required Coursework for all Programs` section, exactly as Economics does.
- **Expected cross-counting, not duplication.** `CHEM UN1403`, `UN1404`, `UN1500`, `UN1507`, `UN1604`, `PHYS UN1401`, `UN1402`, `UN1403`, `UN1601`, `UN1602` and `UN2801` all carry `scienceB` + `scienceC` + `scienceRequirement` in our catalog (verified 2026-08-26), so a chemistry major's track courses will also match `cc-core`'s `science-b` and `science` groups. That is correct behaviour — `crossCountedCourseIds` surfaces it and the UI says "confirm with your adviser". It is not the `ECON UN1105` duplication bug, because the same requirement is not encoded twice. Note that `PHYS UN2601` and `PHYS UN2802` carry **no** flags, so a Sequence B or C student gets less Core cross-count than a Sequence A student.
- **Do not put anything on `cc-major-biology`** even though it names the same CHEM codes. See the disagreement table below.

### Disagreements with programs already in this repo

The parent asked specifically about `seas-major-biomedical-engineering`. Its `chemistry` group is:

```
sequence_choice
  "Sequence 1"  CHEM UN1403, CHEM UN1404, CHEM UN1500
  "Sequence 2"  CHEM UN1604, CHEM UN1507
  "Sequence 3"  CHEM UN2045, CHEM UN2046
```

Three real disagreements between how SEAS and CC treat the same CHEM course codes. **All three are faithful transcriptions of different Bulletin pages, so none is a bug in the existing file and none should be "fixed" from here.**

| | SEAS BME (Engineering bulletin) | CC Chemistry (College bulletin) |
|---|---|---|
| **Track 2 laboratory** | `CHEM UN1507` only — the lab is welded to `CHEM UN1604` | `CHEM UN1500` **or** `CHEM UN1507`. A student with `UN1500` + `UN1604` completes CC Track 2 and completes **no** BME sequence. |
| **Track 3 laboratory** | none — the BME header explicitly records "Sequence 3 is printed with no laboratory at all, and is transcribed as printed rather than as guessed" | `CHEM UN1507` **and** `CHEM UN2545`. The College page gives first-year organic a general-chemistry lab *and* an intensive organic lab. |
| **Organic chemistry** | absent — BME's chemistry stops at general chemistry | required in every track (`UN2443`/`UN2444`/`UN2493`/`UN2494`, or `UN2045`/`UN2046`) |

The Track 3 row is the interesting one: the College page's version of that track *does* carry laboratories, which is circumstantial evidence that the SEAS grid's Sequence 3 has a lab row missing rather than genuinely no lab. **I am not recommending a change to the SEAS file** — it is right about its own page, and the two schools do run different degrees. But whoever next re-verifies `seas-major-biomedical-engineering` should read this row.

A fourth disagreement, with `cc-major-biology` (whose `chemistry` group is transcribed from the **Biological Sciences** page, not this one):

| | `cc-major-biology` | CC Chemistry |
|---|---|---|
| Organic lab, standard track | `CHEM UN2493` + `UN2494` (0 pt each) | same |
| Organic lab, intensive general chem track | `CHEM UN2495` + `UN2496` (1.5 pt each) | **`CHEM UN2493` + `UN2494`** |
| Track 1 extras | includes `CHEM UN1501` GENERAL CHEMISTRY LAB-LECTURE | **does not list `CHEM UN1501` at all** |

Two departments publish different chemistry track lists for the same tracks. Each file follows its own page; do not reconcile them.

---

## Open questions

1. **What is the point total of the Chemistry major?** Nothing on the page states one, which is the only thing keeping this dossier below 9. **What would resolve it:** the department's own advising sheet or a reply from the DUS (Dr. Vesna Gasperov, `vg2231@columbia.edu`). `chem.columbia.edu` sits behind Cloudflare and returned HTTP 403 to both `curl` (with a browser user-agent) and `WebFetch`; a browser session would get it.

2. **Do `CHEM GR9201`, `GR9202` and `GR9307` need excluding from `research-or-advanced-course`?** They are inside the literal range "CHEM GU4000 or above" but they are Preresearch Seminars and Research for the Doctorate. **What would resolve it:** the DUS saying whether "GU4000 or above" is meant to stop at the GU level. Under-counting is the safe direction, so if in doubt, cap the range at `[4000, 6999]` and say so in the note — that keeps `CHEM GR6xxx` and drops the doctoral numbers.

3. **Should groups 2–6 be one `all_of` instead of five groups?** The Bulletin prints them as one flat run of rows under a single `Chemistry` area header. Five groups makes the laboratory structure visible on screen (which is what the parent asked for) and gives finer progress reporting; one group is closer to the page. `seas-major-mechanical-engineering` chose the one-group route for its ten MECE core courses; `cc-major-biology` splits. Either is defensible — **the five-group split is what this dossier recommends**, and switching to one `chemistry-core` group changes nothing about correctness, only about presentation and the `fraction` weighting.

4. **Is `CHEM UN1501` really not part of Track 1?** `cc-major-biology` includes it and the Chemistry department's own track table does not. `CHEM UN1501` resolves in our catalog with no point value. Most likely it is a 0-point lecture welded to `CHEM UN1500` — the same shape as `APMA E2001` beside `APMA E2000` on the SEAS files, which those files name in notes rather than require. **What would resolve it:** the course's own registrar record, or the DUS. Transcribe as printed (omit it) and mention it in the `chemistry-track` note.

---

## The nine traps, one line each

1. **`sequence_choice` vs `n_of { n: 2 }`** — Two groups are `sequence_choice` (`chemistry-track` with four alternatives, `physics` with three) and a third (`mathematics`) is `sequence_choice` over four courses versus two; all three would accept unsatisfying mixtures under `n_of`, and the tracks share courses so the mixture is a schedule a student really could build.
2. **Delegated blocks** — None. The Chemistry department states physics and mathematics in its own `Required Coursework for all Programs` section; `cc-core` has no technical block to delegate. Verified by reading the whole requirements container, not just the `Major in Chemistry` table.
3. **Footnotes** — **The page has none.** Verified against the raw HTML: no `sc_footnotes` element and no `<sup>` element anywhere on `chemistry/`. The parenthetical qualifiers ("(Recommended NOT required)") are inline title text, and every one of them is resolved above.
4. **"Or higher" / open-ended substitutions** — One: *"Chemistry courses numbered CHEM GU4000 or above for 2 credit points or more"*. Encoded as a `numberRange` because it is a bounded floor over one subject, with the 2-point half recorded verbatim as unencodable and the doctoral over-reach raised as an open question.
5. **CourseLeaf eating labels** — Suspected once, in the **Minor** track tables (a trailing empty `<tr>` in all three). The major's own tables are clean; every area header and every "Select one of the following" has its rows. No arithmetic mismatch to cross-check against, because the page states no arithmetic.
6. **Reconcile the arithmetic** — **Cannot be done.** No published total, no per-row points. The computed block sum is 58.5–71.5 points and is internally consistent. This is the reason for 8.5 rather than 9.
7. **Duplicated requirements across files** — None. All nine groups belong on `cc-major-chemistry`; `cc-core` carries nothing from this page. The overlap with `cc-core`'s Science groups is flag-driven cross-counting, which the engine reports rather than duplicates. Three genuine disagreements with `seas-major-biomedical-engineering` and one with `cc-major-biology` are tabulated above; all are different pages, not duplicate encodings.
8. **Honors / accelerated sequences** — Hunted for on every sequence. `mathematics` has the honors route (`MATH UN1207`–`UN1208`) and it is encoded. `chemistry-track` Tracks 2 and 3 *are* the accelerated variants and are encoded. `physics` Sequence C (`PHYS UN2801`–`UN2802`) is the accelerated route and is encoded. Nothing was left out; the Chemistry major's math block does **not** carry Biochemistry's "AP credit and one term of calculus" row.
9. **Courses the Bulletin names that our catalog lacks** — **None for this major.** Every one of the 25 distinct codes resolves. (For contrast, the *Biochemistry* major on the same page names `BIOC GU4501`, `BCHM UN3300`, `BIOC GU4512` and `BIOC GU4323`, none of which resolve — our catalog carries them as `BIOL GU4501`, `BIOL UN3300`, `BIOL GU4512`, `BIOL GU4323`. That subject-code drift will bite whoever transcribes `cc-major-biochemistry`.)

---

## Scoped out, with URLs

The Chemistry department page carries **four majors, a minor and a legacy concentration**. Only `Major in Chemistry` is transcribed here.

| Program | Status | URL |
|---|---|---|
| **Major in Biochemistry** | separate program, different requirements (adds `BIOL UN2005`/`UN2006`, biochemistry and molecular biology, a two-lab block and a choose-three advanced block; four physics sequences including `PHYS UN1201`–`UN1202`; three math routes including an AP one). Would be `cc-major-biochemistry`. **Beware the `BIOC`/`BCHM` subject codes that do not resolve.** | same page, `#requirementstextcontainer` |
| **Major in Chemical Physics** | separate program. Shares the tracks and the physics sequences but **requires one physics laboratory** where the chemistry major only recommends it, adds `PHYS UN3003`/`UN3007`/`UN3008` and `CHEM GU4221` or `PHYS GU4021`, and has a *third* math route ("Two semesters of advanced calculus: `MATH UN1202` & `MATH UN3027`"). Would be `cc-major-chemical-physics`. Cross-listed from the Physics page. | same page; also `https://bulletin.columbia.edu/columbia-college/departments-instruction/physics/#requirementstextcontainer` |
| **Major in Environmental Chemistry** | separate program, pulls in EESC and EAEE. Would be `cc-major-environmental-chemistry`. | same page |
| **Minor in Chemistry** | separate program (three tracks plus "an additional two classes"). Would be `cc-minor-chemistry`. **Its track tables each end in an empty row — suspect a dropped course.** | same page |
| **Concentration in Chemistry** | *"For students who entered Columbia in or before the 2023-24 academic year"*. Legacy. Uses `points_matching`-shaped rules ("Select 22 points of chemistry at the 2000-level or higher (excluding CHEM UN2408)"). | same page |
| **There is no ACS-certified track.** | The strings "ACS", "American Chemical Society" and "certified" appear **nowhere** on the page (verified by grep of the raw HTML). Track 1/2/3 are placement routes through general and organic chemistry, not certification tiers. The department's own framing is *"four distinct academic major programs … chemistry, chemical physics, biochemistry and environmental chemistry"*. | — |
| **GS Chemistry** | a different school's page; `School` is `"GS"`. Out of scope for a CC program. | `https://bulletin.columbia.edu/general-studies/majors-concentrations/chemistry/` |

---

## Proposed golden records

Written by hand from the Bulletin. Outcomes stated by reasoning about the rules, not by running the evaluator.

### 1. `chem-track-2-general-chemistry-lab`

**Who:** Track 2 student who took the *general* chemistry laboratory (`CHEM UN1500`) rather than the intensive one alongside `CHEM UN1604`.

**Why it matters:** this is the record that fails against a transcription copied from `seas-major-biomedical-engineering`, whose Sequence 2 is `CHEM UN1604` + `CHEM UN1507` with no `UN1500` alternative. The Bulletin's College page offers both labs; a student who took the one SEAS does not list would be told a completed track is unmet. It also fails against any transcription that flattens Track 2's `or` instead of expanding it into two alternatives.

```
programId: cc-major-chemistry
taken: CHEM UN1500, CHEM UN1604, CHEM UN2443, CHEM UN2444, CHEM UN2493, CHEM UN2494
expect:
  chemistry-track: satisfied, completed 6
```

*By hand:* the "Track 2 — general chemistry laboratory" alternative is exactly these six courses; all six are held; 6 of 6.

### 2. `chem-mixed-track`

**Who:** Student who took Calculus-style: `CHEM UN1403` (Track 1's first term), `CHEM UN1604` (Track 2's second term) and `CHEM UN1500`. Two terms of general chemistry, no completed track.

**Why it matters:** the trap #1 record. `n_of { n: 3 }` over the union of the tracks would call this satisfied. It is a schedule a real student could build — `CHEM UN1403` in the fall, then placing into the intensive course in the spring.

```
programId: cc-major-chemistry
taken: CHEM UN1403, CHEM UN1604, CHEM UN1500
expect:
  chemistry-track: in_progress, completed 2
```

*By hand:* the evaluator scores every alternative by fraction and reports the best. Track 1 holds `UN1403` and `UN1500` → 2/7 ≈ 0.29. Track 2 (general lab) holds `UN1500` and `UN1604` → 2/6 ≈ 0.33. Track 2 (intensive lab) holds `UN1604` → 1/6. Track 3 holds none → 0/4. Best is Track 2 (general lab) at 2 of 6: **in progress, and specifically not satisfied.** The reported `completed` is 2 either way, so the assertion is stable even if the tie-break changes.

### 3. `chem-inorganic-only`

**Who:** Student who has finished the whole required chemistry core including `CHEM GU4071` Inorganic Chemistry, and has taken no research and no advanced elective.

**Why it matters:** the vacuity record, stated by hand. Without `excludeGroups: ["inorganic-chemistry"]`, `research-or-advanced-course` matches the required `CHEM GU4071` and reports `1/1 DONE` for a requirement the student has not started. That is the identical failure `cc-major-biology`'s elective block had and the identical failure both computer science majors had. This record also pins the `inorganic-chemistry` group as satisfied at the same time, which is what makes the pair diagnostic.

```
programId: cc-major-chemistry
taken: CHEM UN3079, CHEM UN3080, CHEM UN3085, CHEM UN3086,
       CHEM UN3546, CHEM UN3920, CHEM GU4071
expect:
  physical-chemistry:              satisfied, completed 2
  physical-analytical-laboratory:  satisfied, completed 2
  advanced-organic-laboratory:     satisfied, completed 1
  inorganic-chemistry:             satisfied, completed 1
  senior-seminar:                  satisfied, completed 1
  research-or-advanced-course:     unmet, completed 0
  chemistry-track:                 unmet, completed 0
  physics:                         unmet, completed 0
  mathematics:                     unmet, completed 0
expectSatisfiedCount: 5
```

*By hand:* the second evaluation pass removes what `inorganic-chemistry` consumed (`CHEM GU4071`) from the pool before `research-or-advanced-course` is scored. Nothing else the student holds is `CHEM UN3098` or `CHEM ≥ 4000`. So the elective group sees an empty pool → 0 of 1, unmet.

### 4. `chem-track-3-honors-accelerated` *(edge case: every accelerated route at once)*

**Who:** The hardest-path student — Track 3 first-year organic chemistry, honors mathematics, accelerated physics — with the whole major finished.

**Why it matters:** every one of this student's three sequence choices is the *non-default* branch. A transcription that encoded only Track 1, only four-semester calculus, or only Sequence A would show this student three red requirements for having taken the harder route in all three — the `cc-major-economics` honors failure, tripled. It is also the record that proves Track 3 needs no `CHEM UN2443`/`UN2444`.

```
programId: cc-major-chemistry
taken: CHEM UN1507, CHEM UN2045, CHEM UN2046, CHEM UN2545,
       CHEM UN3079, CHEM UN3080, CHEM UN3085, CHEM UN3086,
       CHEM UN3546, CHEM UN3920, CHEM GU4071, CHEM GU4103,
       MATH UN1207, MATH UN1208,
       PHYS UN2801, PHYS UN2802
expect:
  chemistry-track:                 satisfied, completed 4
  physical-chemistry:              satisfied, completed 2
  physical-analytical-laboratory:  satisfied, completed 2
  advanced-organic-laboratory:     satisfied, completed 1
  inorganic-chemistry:             satisfied, completed 1
  senior-seminar:                  satisfied, completed 1
  research-or-advanced-course:     satisfied, completed 1
  physics:                         satisfied, completed 2
  mathematics:                     satisfied, completed 2
expectSatisfiedCount: 9
```

*By hand:* Track 3 is `UN1507` + `UN2045` + `UN2046` + `UN2545` — all four held, 4 of 4. Honors mathematics is `UN1207` + `UN1208` — 2 of 2. Physics Sequence C is `UN2801` + `UN2802` — 2 of 2. `CHEM GU4103` Organometallic Chemistry is 4.5 points, is `CHEM ≥ 4000`, is not `CHEM GU4145`, and is not what `inorganic-chemistry` consumed — so it fills the research-or-advanced slot. Nine of nine groups green.
