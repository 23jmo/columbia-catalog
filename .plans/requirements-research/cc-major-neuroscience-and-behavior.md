# Neuroscience and Behavior

- **School / kind:** Columbia College (`CC`) / `major`
- **Proposed program id:** `cc-major-neuroscience-and-behavior`
- **Proposed `name`:** `"Neuroscience and Behavior"`
- **Proposed `department`:** `"Biological Sciences and Psychology"` — see *The joint-administration problem* below
- **`degreePoints`:** none. `degreePoints` is only meaningful on `kind: "core"`; the CC degree total (124) lives on `cc-core`.
- **Bulletin edition:** 2026–2027
- **Primary source URLs** (the major is published on **two** CC pages, neither of which is complete on its own):
  - Biology half — https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/#requirementstextcontainer
  - Psychology half — https://bulletin.columbia.edu/columbia-college/departments-instruction/psychology/#requirementstextcontainer
  - Cross-check (not CC, do not cite as the source) — https://bulletin.columbia.edu/general-studies/majors-concentrations/neuroscience-behavior/
- **Date researched:** 2026-08-26
- **Confidence:** **9/10** — justification at the bottom.

---

## The joint-administration problem, stated up front

This is the first program in the repo administered by two departments, and the
repo's shape needs one decision made deliberately rather than by accident.

**Recommendation: ONE file, `lib/requirements/programs/cc-major-neuroscience-and-behavior.ts`, carrying all ten groups.**

The alternative — a biology file and a psychology file, or delegating the
biology half to `cc-major-biology` — is exactly trap #2. `seas-core` delegated
math/science/computing to the departments, `seas-major-computer-science` never
picked its share up, and a student was shown a CS degree with no physics. A
student declaring Neuroscience and Behavior declares **one** program and does
not care which department a requirement came from. Splitting it manufactures
a seam that has already failed once in this codebase.

`Program.department` is a single optional string, so it cannot hold two
departments. Two options, and I recommend the first:

1. `department: "Biological Sciences and Psychology"` — honest, renders fine,
   requires no type change.
2. Widen `department` to `string | string[]`. Not worth it for one program.

Provenance is preserved the right way regardless: **`RequirementGroup.sourceUrl`
is per-group**, so the six biology groups point at the Biological Sciences page
and the five psychology groups point at the Psychology page. That is what
`sourceUrl` on the group exists for (`types.ts`: "groups carry their own
`sourceUrl` because departments publish blocks on different pages").

### Do the two department pages agree?

**Substantively yes; in two places the wording differs, and in one place the
Psychology page contradicts itself.** All three are recorded below and none is
left to a transcriber's judgement.

| Question | Biological Sciences page | Psychology page | Verdict |
|---|---|---|---|
| Course count | "eleven courses … **six in biology and five in psychology**" | Requirements section: "eleven courses … **six** from the Department of Biological Sciences and **five** from the Department of Psychology". Transfer-guidance section: "eleven courses are required … **seven** from the Department of Biological Sciences and five from the Department of Psychology" | **Six.** See *Point arithmetic*. The "seven" is an error on the Psychology page. |
| Which biology electives | "Two additional 3000 or 4000 level biology lecture courses **from the list of Upper Level Electives under the Biology Major**" | "Two additional 3000- or 4000-level biology course **from a list approved by the biology adviser to the program**" | **Trust Biological Sciences.** It is the department that owns biology requirements, and its wording names a list that is actually published in the Bulletin. The Psychology page's wording points at nothing checkable. |
| Named biology courses | UN2005, UN2006, UN3004, UN3005 | identical | agree |
| Named psychology courses | "see the Psychology section in this Bulletin" — delegates | full P1–P5 list | Psychology page is authoritative for P1–P5; the biology page delegates explicitly and completely, so this is a *safe* delegation, not trap #2. |

### Does any course count toward both halves?

**No, and the Bulletin says so explicitly:** "No course may be counted twice in
fulfillment of the biology or psychology requirements described below."
(Psychology page, Major in Neuroscience and Behavior.) The two halves are
disjoint by subject anyway — BIOL on one side, PSYC/STAT on the other — so no
single course is reachable by both. The double-counting risk in this program is
**within** the biology half, not across it: see `biology-electives`.

---

## Requirement groups

Ten groups. Source URLs abbreviated below as:

- `BIO` = `https://bulletin.columbia.edu/columbia-college/departments-instruction/biological-sciences/#requirementstextcontainer`
- `PSY` = `https://bulletin.columbia.edu/columbia-college/departments-instruction/psychology/#requirementstextcontainer`

---

### 1. `general-chemistry` — "General Chemistry"

**Bulletin text, verbatim (both pages, identical):**

> CHEMISTRY COURSES
> One year of college chemistry is required prior to taking Introductory Biology.

and, in the framing sentence:

> In addition to one year of college general chemistry, eleven courses are required to complete the major in neuroscience and behavior—six in biology and five in psychology.

**Proposed rule:** `attested`

**Why not `sequence_choice` / `n_of` over `CHEM UN1403` + `CHEM UN1404`:** the
Bulletin's N&B block names **no chemistry course codes at all** — it is one
sentence of prose. The department's own checklist (secondary; see *Sources*)
writes the row as "General Chemistry: (or high-school equivalent) CHEM UN1403-1404
Gen. Chem I & II", and "**or high-school equivalent**" is an AP/placement route
that leaves nothing on a transcript. Encoding `all_of ["CHEM UN1403","CHEM UN1404"]`
would mark every placed-out student unmet, and would also miss the intensive
route (`CHEM UN1604` / `CHEM UN1507`) that the Biology major's own Chemistry
section accepts. Trap #4: not guessable, so not guessed.

**Proposed note:**
> One year of college general chemistry, finished before Introductory Biology. The Bulletin names no course codes here; the department's checklist gives General Chemistry I and II (CHEM UN1403–CHEM UN1404) as the usual route and accepts a high-school equivalent, which leaves nothing on your record — so this one is yours to confirm.

**sourceUrl:** `BIO`
**Footnotes:** none attach here.
**Catalog resolution:** n/a (no codes).

---

### 2. `introductory-biology` — "Introductory Biology"

**Bulletin text, verbatim (Biological Sciences page, N&B course list):**

> BIOLOGY COURSES
> One year of introductory biology.
> BIOL UN2005 & BIOL UN2006 — INTRO BIO I: BIOCHEM,GEN,MOLEC and INTRO BIO II:CELL BIO,DEV/PHYS

Psychology page prints the same two as items 1 and 2 of its Required Biology
Courses list.

**Proposed rule:** `all_of ["BIOL UN2005", "BIOL UN2006"]`

**Proposed note:**
> The full year, both terms. One year of general chemistry is a prerequisite. Each course carries a 0-point companion section (BIOL UN2015, BIOL UN2016) that is not matched here.

**sourceUrl:** `BIO`
**Footnotes:** none.
**Catalog resolution:** both resolve — `BIOL UN2005` INTRO BIO I (4 pt),
`BIOL UN2006` INTRO BIO II (4 pt).

**Open item, recorded rather than encoded:** the same page's *Repeating Biology
Courses* paragraph reads "Introductory biology I & II (**BIOL UN2005/6 & BIOL
UN2401/2**) may only be taken twice", and prerequisite lines across the
department are written "(BIOL UN2005 and BIOL UN2006) or (BIOL UN2401 and
BIOL UN2402)". `BIOL UN2401`/`UN2402` (Contemporary Biology I/II, 3 pt each,
"Same lectures as BIOL UN2006, but recitation is optional") is a parallel intro
sequence the department treats as equivalent elsewhere — but the **N&B
requirement text names only UN2005/UN2006**, and the Biology major's
Introductory Courses section says "Other sequences require permission in
advance." So it is *not* encoded as an alternative sequence. See *Open questions*.

---

### 3. `neurobiology` — "Neurobiology"

**Bulletin text, verbatim (Biological Sciences page):**

> One year of Neurobiology
> BIOL UN3004 & BIOL UN3005 — NEUROBIO I:CELLULAR & MOLECULR and NEUROBIO II: DEVPT & SYSTEMS

**Proposed rule:** `all_of ["BIOL UN3004", "BIOL UN3005"]`

**Proposed note:**
> Both terms. These are the two courses that make this a neuroscience degree rather than a biology one, and they are also on the Biology major's upper-level elective list — which is why they cannot be reused as your two biology electives below. 0-point recitations (BIOL UN3014, BIOL UN3015, BIOL UN3016) go with them and are not matched here.

**sourceUrl:** `BIO`
**Footnotes:** none.
**Catalog resolution:** both resolve — `BIOL UN3004` (3 pt), `BIOL UN3005` (4 pt).

---

### 4. `biology-electives` — "Biology Electives"

**Bulletin text, verbatim (Biological Sciences page):**

> Two additional 3000 or 4000 level biology lecture courses from the list of Upper Level Electives under the Biology Major.

**Psychology page's parallel text, verbatim:**

> Two additional 3000- or 4000-level biology course from a list approved by the biology adviser to the program. *NOTE: For students entering in Fall 2024 or later, two biology elective courses will be required. For students entering prior to Fall 2024, one biology elective course will be required.*

**Proposed rule:**

```
n_matching, n: 2, select: {
  excludeGroups: ["neurobiology"],
  include: [ …the 37 codes of the Biology major's Upper-Level Elective list… ]
}
```

**`excludeGroups: ["neurobiology"]` is the single most important line in this
dossier.** `BIOL UN3004` and `BIOL UN3005` are BOTH on the Biology major's
Upper-Level Elective list (they are its first two rows). Written as
`n_of { n: 2 }` over that list, every N&B student who has finished the required
neurobiology year is scored **2/2 DONE** on an elective requirement they have
not started — two whole courses short of a degree. This is byte-for-byte the
bug that `cc-major-biology`'s `upper-level-electives` group was fixed for on
2026-08-24 ("`n_of` counted them twice, so a student with exactly two core
courses and no electives read `2/2 DONE`"). `excludeGroups` lives on
`CourseSelector` and `n_of` has no selector, which is why the rule kind must be
`n_matching` and the tier drops to `flagged`.

`introductory-biology` does **not** need excluding: `BIOL UN2005`/`UN2006` are
not on the elective list.

**The list (Bulletin form, in the Bulletin's own order).** This is the *Biology
major's* Upper-Level Elective enumeration, which the N&B page incorporates by
reference:

```
BIOL UN3004  BIOL UN3005  BIOL UN3006  BIOL UN3019  BIOL UN3022
BIOL UN3025  BIOL UN3031  BIOL UN3041  BIOL UN3073  BIOL GU4073
BIOL UN3300  BIOL UN3320  BIOL UN3404  BIOL UN3560  BIOL GU4560
BIOL UN3799  BIOL GU4799  BIOL GU4001  BIOL GU4002  BIOL GU4034
BIOL GU4035  BIOL GU4036  BIOL GU4075  BIOL GU4080  BIOL GU4193
BIOL GU4290  BIOL GU4300  BIOL GU4310  BIOL GU4323  CHEM GU4324
BIOL GU4402  BIOL GU4501  BIOL GU4510  BIOL GU4512  BIOL GU4551
BIOL GU4600  BIOL GU4777
```

37 codes (34 printed rows; `BIOL UN3073`/`GU4073`, `UN3560`/`GU4560` and
`UN3799`/`GU4799` are printed as "or" pairs). I diffed this against the live
Bulletin on 2026-08-26 and against
`lib/requirements/programs/cc-major-biology.ts` — **the encoded list is exactly
right, all 37, in the same order.**

**Transcription instruction:** do **not** re-type the list. Export it from
`cc-major-biology.ts` as a shared const (e.g. `BIOLOGY_UPPER_LEVEL_ELECTIVES`)
and import it here. Two literal copies of one Bulletin table is precisely the
drift trap #7 warns about — this is not the same *requirement* held twice (the
two majors are mutually exclusive, see *Not encodable*), it is the same *list*
typed twice, and the copies can rot apart.

**Proposed note:**
> Two more 3000- or 4000-level biology lecture courses, drawn from the Biology major's upper-level elective list. Neurobiology I and II are on that list but are already required above, so they cannot also count here. Students who entered Columbia before Fall 2024 need only one — this audit counts two, which is the current rule; if you entered earlier, one of these two is not owed. Five of the courses named below have no row in our catalog and will not match automatically. Anything not on the list needs a biology adviser's written approval in advance.

**sourceUrl:** `BIO`

**Footnotes resolved:** the `*NOTE` on the Psychology page attaches to the
Required-Courses framing sentence *and* is repeated inside this list item. It
is a **cohort rule**, not a footnote on a course: two electives for Fall 2024
and later entrants, one before. The rule language has no cohort switch, so
`n: 2` is encoded (the current entering cohort) and the older cohort is named in
the note. Recorded again under *Not encodable*.

**Catalog resolution** (checked 2026-08-26 against the live catalog, terms
20243/20251/20263/20271): **32 of 37 resolve. 5 do not:**
`BIOL UN3560`, `BIOL GU4002`, `BIOL GU4035`, `BIOL GU4193`, `BIOL GU4600`.
All five are printed by the Bulletin exactly as written, so none is a
transcription error — they are courses not offered in a covered term.
`BIOL UN3560` is the undergraduate number of `BIOL GU4560`, which does resolve.
Keep all 37: dropping an option the Bulletin offers tells a student who took it
that it did not count.

---

### 5. `psychology-introduction` — "The Science of Psychology" (P1)

**Bulletin text, verbatim (Psychology page, Required Psychology Courses, item 1):**

> PSYC UN1001 THE SCIENCE OF PSYCHOLOGY

**Supporting Bulletin text on the same page (Course Numbering Structure):**

> PSYC UN1021 Science of Psychology: Explorations and Applications is an alternative version of PSYC UN1001 THE SCIENCE OF PSYCHOLOGY and fulfills the same requirements.

**Proposed rule:** `n_of { n: 1, courses: ["PSYC UN1001", "PSYC UN1021"] }`

**Why UN1021 is in and `PSYC BC1001` is out.** UN1021 is admitted on the
Bulletin's own sentence — the same sentence `cc-major-psychology` already
relies on, and the department's N&B checklist independently lists "PSYC UN1001,
UN1021 or S1001". `PSYC BC1001` is *different here from the plain Psychology
major*: for that major the Bulletin directs transfer students to "enroll in
PSYC UN1001 **or PSYC BC1001**"; for N&B the corresponding paragraph says
"a maximum of **one** psychology course from another institution, **including
Barnard**, may be applied toward the psychology portion of the Neuroscience &
Behavior major", and requires a Major Requirement Substitution Form. Counting
BC1001 automatically would green-light a route that needs an approved petition
and silently spends the student's single Barnard slot. Under-counting sends
someone to their adviser; over-counting sends them to the registrar after
add/drop. **Do not copy the three-course list from `cc-major-psychology`.**

**Proposed note:**
> One of the two. PSYC UN1021 is the Bulletin's own alternative version of PSYC UN1001 and fulfils the same requirement. A 5 on the AP Psychology exam or a 7 on the Higher Level IB exam also satisfies this, but does not count as one of the eleven courses — you will need an extra course and this group will read unmet. PSYC BC1001 can be used only as your one permitted Barnard psychology course and only with an approved Major Requirement Substitution Form, so it is not matched here.

**sourceUrl:** `PSY`
**Footnotes:** none.
**Catalog resolution:** `PSYC UN1001` resolves (3 pt). **`PSYC UN1021` does
not** — it is on the Bulletin (course listing, 3.00 points) and has no row in
our catalog. Keep it; the group has a live alternative.

---

### 6. `neuroscience-lecture` — "Introduction to Neuroscience" (P2)

**Bulletin text, verbatim (Psychology page, item 2):**

> PSYC UN2430 COGNITIVE NEUROSCIENCE or PSYC UN2450 BEHAVIORAL NEUROSCIENCE or PSYC UN2470 Fundamentals of Human Neuropsychology

**Proposed rule:** `n_of { n: 1, courses: ["PSYC UN2430", "PSYC UN2450", "PSYC UN2470"] }`

**Proposed note:**
> One of the three. PSYC UN2470 is on the Bulletin but has no row in our catalog, so it will not match automatically. Whichever one you use here cannot also be your P4 psychology lecture course.

**sourceUrl:** `PSY`
**Footnotes:** none.
**Catalog resolution:** `PSYC UN2430` (3 pt) and `PSYC UN2450` (3 pt) resolve.
**`PSYC UN2470` does not** — it is on the Bulletin at 3.00 points (its
description is printed in the same page's course listing) and has no catalog row.

---

### 7. `statistics-or-research-methods` — "Statistics or Research Methods" (P3)

**Bulletin text, verbatim (Psychology page, item 3):**

> 3. One statistics or research methods course from the following:
> PSYC UN1420 RESEARCH METHODS - HUMAN BEHAVIOR
> PSYC UN1450 RESEARCH METHODS - SOCIAL COGNITION & EMOTION
> PSYC UN1455 RESEARCH METHODS: SOCIAL/PERSONALITY
> PSYC UN1490 RESEARCH METHODS - COGNITION/DECISION MAKING
> PSYC UN1610 STATISTCS-BEHAVIORL SCIENTISTS
> PSYC UN1660 Advanced Statistical Inference
> PSYC UN1920 The How-Tos of Research
> PSYC UN1950 Neuroscience Methods: Cells and Circuits
> STAT UN1101 INTRODUCTION TO STATISTICS (formerly STAT W1111)
> STAT UN1201 CALC-BASED INTRO TO STATISTICS (formerly STAT W1211)
> Please note, STAT UN1001 does not count towards the Neuroscience & Behavior major.

**Proposed rule:**

```
n_of { n: 1, courses: [
  "PSYC UN1420", "PSYC UN1450", "PSYC UN1455", "PSYC UN1490",
  "PSYC UN1610", "PSYC UN1660", "PSYC UN1920", "PSYC UN1950",
  "STAT UN1101", "STAT UN1201"
]}
```

**⚠ The one place a transcriber will get this wrong.** `cc-major-psychology`'s
`statistics` group is `["PSYC UN1610","PSYC UN1660","STAT UN1001","STAT UN1101",
"STAT UN1201"]` — correct for *that* major. For N&B the Bulletin says in
so many words that **`STAT UN1001` does not count**, and the list is ten courses
rather than five (it merges statistics and research methods into one slot, and
adds `PSYC UN1920` and `PSYC UN1950`, which are on no psychology-major list).
Copying the psychology group here produces a rule that passes a student who has
not met the requirement. Golden record `nb-stat-un1001-does-not-count` below
exists solely to catch that.

**Proposed note:**
> One course, statistics or research methods. STAT UN1001 is explicitly excluded from this major even though it counts for the Psychology major. A statistics course taken anywhere other than Columbia or Barnard cannot count, and AP Statistics never does; if you have taken statistics elsewhere the department asks you to use an intermediate or advanced Columbia course, or a PSYC 1400-level research methods course. PSYC UN1490, PSYC UN1660 and PSYC UN1920 are on the Bulletin but have no row in our catalog, so they will not match automatically.

**sourceUrl:** `PSY`
**Footnotes:** none.
**Catalog resolution:** 7 of 10 resolve — `PSYC UN1420` (4), `PSYC UN1450` (4),
`PSYC UN1455` (4), `PSYC UN1610` (4), `PSYC UN1950` (points null in our catalog;
4.00 on the Bulletin), `STAT UN1101` (3), `STAT UN1201` (3).
**Not in our catalog:** `PSYC UN1490`, `PSYC UN1660`, `PSYC UN1920` — all three
resolve on the Bulletin (UN1490 4.00 pt with a printed description; UN1660 and
UN1920 3.00 pt via the Bulletin's course search). Keep all three.

---

### 8. `psychology-lecture` — "Psychology Lecture Course" (P4)

**Bulletin text, verbatim (Psychology page, item 4):**

> 4. One additional 2000- or 3000-level psychology lecture course from the approved list here.
> *Please make careful note of this list, as courses not listed here will not count towards the P4 requirement.

("here" links to `https://psychology.columbia.edu/content/neuroscience-behavior-major#!#cu_accordion_item-1255`.)

**Proposed rule:** `attested`

**Why not `n_matching` over `{ subjects: ["PSYC"], numberRange: [2000, 3999] }`.**
Because the Bulletin says, in its own emphasis, that courses not on the list do
not count. A subject-plus-band selector would sweep in the department's
seminars (3200s/3400s/3600s), the 2.5-point Barnard laboratory sections
(`PSYC BC2106`, `BC2109`, `BC2114`, …), the supervised-research and honors
courses (`PSYC UN3910`, `UN3920`, `UN3930`, `UN3950`), and the P2 course the
student already used. That is trap #4 — a numeric floor over a subject sweeps in
unapproved courses — with an explicit Bulletin sentence forbidding it.

The approved list itself is published **only on the department website**, which
blocks automated fetching (see *Sources*), and it is revised per year. There is
nothing to transcribe and nothing that would stay true. `attested` is the tier
this exact situation exists for.

**Proposed note:**
> One more psychology lecture course at the 2000 or 3000 level, from the department's approved P4 list. The list is published on the Psychology Department's Neuroscience & Behavior page rather than in the Bulletin, and the Bulletin warns that a course not on it will not count — so this one is yours to confirm. It must be a different course from the one you used for P2.

**sourceUrl:** `PSY`
**Footnotes resolved:** the inline `*` here is the "Please make careful note of
this list" sentence; it attaches to item 4 only and is carried in the note.

---

### 9. `psychology-seminar` — "Advanced Psychology Seminar" (P5)

**Bulletin text, verbatim (Psychology page, item 5 plus its Note):**

> 5. One advanced psychology seminar from the approved list here
> Note: Students wishing to use a seminar course not listed above to meet the P5 seminar requirement must contact their psychology adviser before enrolling to request permission for an exception. Generally speaking, permission for such exceptions is only granted when there is a compelling case related to the student's research or area of study. Students requesting permission to use a course not on this list must ensure that their substantive coursework in the seminar (generally their final paper) is on a neuroscience-focused topic.

**Proposed rule:** `attested`

**Why not the psychology major's seminar bands.** `cc-major-psychology`'s
`seminar` group is described by number band ("3200s, 3400s, 3600s, 4200s,
4400s, 4600s") and is `attested` because those are three non-contiguous ranges.
The N&B P5 requirement is **a different requirement** — a curated,
neuroscience-focused subset published off-Bulletin, with a written-exception
process. Do not reuse the psychology note here; it would tell an N&B student
that any 3600s social-psychology seminar qualifies, and it does not.

**Proposed note:**
> One advanced psychology seminar from the department's approved P5 list, published on the Psychology Department's Neuroscience & Behavior page rather than in the Bulletin. A seminar not on the list needs your psychology adviser's permission before you enrol, and your final paper has to be on a neuroscience topic. This one is yours to confirm.

**sourceUrl:** `PSY`
**Footnotes:** none (the "Note:" is body prose, quoted above).

---

### 10. `major-requirement-checklist` — "Major Requirement Checklist"

**Bulletin text, verbatim (Psychology page, Guidance for Undergraduate Students):**

> All majors and concentrators in Psychology and majors in Neuroscience and Behavior should complete a Major Requirement Checklist (MRC) before consulting a program adviser to discuss program plans. At minimum, all students must submit a Major Requirement Checklist prior to the start of their final semester, so that graduation eligibility can be certified.

**Proposed rule:** `attested`

**Proposed note:**
> Submit a Major Requirement Checklist to the Psychology Department before the start of your final semester — the Bulletin makes it the minimum for graduation eligibility to be certified. Have the biology half reviewed by your adviser in Biological Sciences: this major is signed off by two departments and the checklist only covers one of them.

**sourceUrl:** `PSY`

This mirrors `cc-major-psychology`'s `major-requirement-checklist`, and is not a
duplication problem — a student holds one program or the other; N&B and
Psychology cannot both be declared (see *Not encodable*).

---

## Point arithmetic

**There is no published point total for this major.** The only published total
is a **course count**, and that is what must be reconciled.

### The course count reconciles — and it settles the "six vs seven" conflict

| Block | Rows | Courses |
|---|---|---|
| Introductory Biology | BIOL UN2005, BIOL UN2006 | 2 |
| Neurobiology | BIOL UN3004, BIOL UN3005 | 2 |
| Biology electives | two additional 3000/4000-level | 2 |
| **Biology subtotal** | | **6** |
| P1 Science of Psychology | 1 | 1 |
| P2 Neuroscience lecture | 1 | 1 |
| P3 Statistics / research methods | 1 | 1 |
| P4 Psychology lecture | 1 | 1 |
| P5 Advanced seminar | 1 | 1 |
| **Psychology subtotal** | | **5** |
| **Total** | | **11** ✓ matches "eleven courses are required" |

General chemistry sits outside the eleven ("**In addition to** one year of
college general chemistry, eleven courses are required"), which is why the
`general-chemistry` group is a group but not one of the eleven.

**The Psychology page's "seven from the Department of Biological Sciences and
five from the Department of Psychology" is wrong.** 7 + 5 = 12, which
contradicts "eleven courses are required" in the *same sentence*; the
enumerated biology list has exactly six rows on both pages; the Biological
Sciences page says six; the GS bulletin's dedicated N&B page says six; and the
department's own checklist has six biology rows. The "seven" appears once, in a
transfer-credit guidance paragraph, and nowhere else. Trap #6 found it, and it
resolves cleanly.

### Derived point range (for a sanity check only — do not encode)

Biology: 4 + 4 + 3 + 4 = 15, plus two electives at ≥3 points each → **21–23**.
Psychology: P1 3, P2 3, P3 3–4, P4 ≥3, P5 ≥3 → **15–18**.
Eleven courses ≈ **36–41 points**, plus roughly 8 points of general chemistry.
No Bulletin sentence states any of these numbers, so there is nothing to
reconcile against and nothing here belongs in the file.

---

## Not encodable

Each with the verbatim prose and the reason.

1. **Grade minimum and Pass/D/Fail.** "A grade of C- or higher must be earned
   and revealed on the transcript in any Columbia or Barnard course, including
   the first, that is used to satisfy the major requirements. The grade of P is
   not accepted for credit towards the Psychology major, Psychology
   concentration, or Neuroscience and Behavior major." — The language has no
   grade minima. (`types.ts`, "What this language deliberately CANNOT say".)

2. **The within-major double-count bar.** "No course may be counted twice in
   fulfillment of the biology or psychology requirements described below." — A
   statement about the *assignment* of courses to groups, not about any course.
   `excludeGroups` implements the one case where it bites mechanically
   (`biology-electives` vs `neurobiology`); the general rule cannot be stated.

3. **The Fall-2024 cohort split.** "For students entering in Fall 2024 or later,
   two biology elective courses will be required. For students entering prior to
   Fall 2024, one biology elective course will be required." — A rule keyed on
   matriculation term. `Program` has no cohort dimension. `n: 2` is encoded and
   the earlier cohort is named in the note.

4. **Cross-major exclusivity.** "Students can only choose one major/minor within
   the Department [of Biological Sciences]." / "You cannot major in: …
   Neuroscience & also major / minor in psychology." / "Students may not
   double-major in both Psychology and Neuroscience & Behavior, since both of
   these programs are housed in the same department." / "Because of the overlap
   between the Cognitive Science major and both Psychology and Neuroscience &
   Behavior, students should not plan to pursue a double major in those two
   programs." — Constraints across a student's *set* of programs. Nothing in
   `Program` or `RequirementRule` reaches another program.

5. **The general double-counting cap with other majors.** "Students can only
   double count two of the following fundamental courses for both a
   biology-related major/minor and any other major / minor they pursue: General
   Chemistry I & II or Calc I & II." and "Biochemistry (BIOL UN3300 or BIOL
   GU4501) cannot be counted for a biology-related major / minor and for any
   other major / minor." — "At most one/two courses may double count" is named
   in the brief as unrepresentable, and `crossCountedCourseIds` deliberately
   reports overlap rather than resolving it.

6. **Residency.** "All biology-related majors: at least 4 biology or
   biochemistry courses and at least 18 credits of the total (biology,
   biochemistry, math, physics, and chemistry) must be taken at Columbia." —
   Needs the school qualifier, which `CourseSelector` has no field for; the same
   reason `cc-major-psychology`'s `columbia-department-residency` is `attested`.
   Could be added as an eleventh `attested` group if desired; I have **not**
   proposed it, because unlike the psychology major's "6 of the 11" it is stated
   as a departmental blanket rule rather than as a row of this major's
   requirements. Flagging the choice rather than making it.

7. **Barnard and transfer caps.** "With the Advisor's approval, a maximum of one
   psychology course from another institution, including Barnard, may be applied
   toward the psychology portion of the Neuroscience & Behavior major. Transfer
   courses taken in any modality (in-person, online, or hybrid) may be eligible
   to count toward P1. Transfer courses must have been taken fully in-person to
   be eligible to count for P2-P5." and, on the biology side, "Students may
   substitute Barnard College courses only with prior permission from a Biology
   Department adviser." — Transfer-credit equivalencies; explicitly out of scope.

8. **Prerequisite enforcement and repeat limits.** "Course prerequisites are
   strictly enforced… Biology courses taken before the completion of any of its
   prerequisites, even with instructor approval, are not counted toward the
   major, minor, or interdepartmental majors." / "3000 & 4000 level biology
   courses may only be taken once." — Need a term-ordered transcript.

9. **Advisory content that is not a requirement.** "Many graduate programs in
   neuroscience also require one year of calculus, one year of physics, and
   chemistry through organic." — Advice, not a rule. Do not encode; a student
   shown a red calculus requirement on this major would take a course they do
   not owe.

10. **Honors.** "Note the students majoring in Neuroscience & Behavior may earn
    academic honors through the Department of Biological Sciences instead." The
    psychology route runs through the Psych/Neuro Senior Thesis Advanced
    Research (STAR) program with a 3.6 major GPA. Honors is not a graduation
    requirement — see trap #8 below for the *sequence* hunt, which is separate.

11. **Exception process.** "Any exceptions must be approved in advance by a
    biology adviser and students must receive an email notification of that
    approval." — Advisor petitions; explicitly out of scope.

---

## The nine traps — one-line verdicts

1. **`sequence_choice` vs `n_of {n:2}`.** Two two-course blocks exist
   (`introductory-biology`, `neurobiology`) but each is "both of these", not
   "one of several sequences" — `all_of` is correct, and there is no
   sequence-choice anywhere on this major. **Clear.**
2. **Delegated blocks nobody picked up.** Real and handled: the Biological
   Sciences page delegates all five psychology courses ("For the five courses
   required in Psychology, see the Psychology section in this Bulletin"), and
   the Psychology page delegates the biology list ("For the definitive list of
   biology requirements, see the Department of Biological Sciences website").
   **Both halves are picked up, on one file.** This is the trap the whole
   *joint-administration* section above exists to defuse.
3. **Footnotes.** Every marker on both pages resolved. The Biological Sciences
   N&B table carries **no** CourseLeaf `<sup>` markers. The Psychology
   requirements tab carries **no** `<sup>` markers either — its "footnotes" are
   three inline asterisks, all located and attached above: `*NOTE` (Fall-2024
   cohort, ×2 occurrences, same text) and `*Please make careful note of this
   list` (P4). **Clear.**
4. **"Or higher" / open-ended substitutions.** Three open doors, none guessed:
   general chemistry "or high-school equivalent" (→ `attested`), the P4 approved
   list (→ `attested`), the P5 approved list plus its adviser exception (→
   `attested`). **Clear.**
5. **CourseLeaf eats labels.** The one list whose arithmetic could hide a lost
   label is the biology block; six rows, six courses, matching the stated six.
   The Psychology P1–P5 list is a hand-authored `<ol>` whose numbering renders
   as "1., 2., 3., 4., 5." with items 1 and 2 losing their digits in the plain
   text — a rendering artefact I confirmed against the raw HTML, not a lost
   alternative. **Clear.**
6. **Reconcile the arithmetic.** Done, and it **found a live Bulletin error**:
   "seven from the Department of Biological Sciences" on the Psychology page,
   against "eleven courses" in the same sentence and "six" everywhere else.
   Resolved to six. **Found and resolved.**
7. **Duplicated requirements across files.** Three exposures, all addressed:
   (a) the *same major* is published on two CC pages plus a standalone GS page —
   it must live on **one** program file; (b) the biology elective list must be
   **imported** from `cc-major-biology.ts`, not re-typed; (c) `PSYC UN1001` and
   the research-methods courses also appear on `cc-major-psychology` — that is
   two different programs naming the same course, which is fine and is not the
   ECON UN1105 failure (that was one *degree* holding one requirement twice).
   **Addressed.**
8. **Honors / accelerated sequences.** Hunted explicitly. There is **no honors
   variant of any required sequence** — no honors intro biology, no honors
   neurobiology, no honors intro psychology. The two "harder path" analogues
   that do exist are both recorded: `PSYC UN1021` (encoded as an alternative to
   `PSYC UN1001`) and `BIOL UN2401`/`UN2402` (recorded, deliberately not
   encoded — see *Open questions*). The department's honors *program* is a thesis
   track (`PSYC UN3910`/`UN3920`), not a variant of a requirement. **Clear.**
9. **Courses the Bulletin names that our catalog lacks.** Nine, all kept and all
   named in notes: `PSYC UN1021`, `PSYC UN2470`, `PSYC UN1490`, `PSYC UN1660`,
   `PSYC UN1920` (named courses); `BIOL UN3560`, `BIOL GU4002`, `BIOL GU4035`,
   `BIOL GU4193`, `BIOL GU4600` (elective list). **Flagged, not dropped.**

---

## Which file each requirement belongs on

**All ten groups go on `lib/requirements/programs/cc-major-neuroscience-and-behavior.ts`.**
Nothing goes on `cc-major-biology.ts` or `cc-major-psychology.ts`, and nothing
should be removed from either of them. Register the new program in
`lib/requirements/programs/index.ts` alongside the others.

The only cross-file dependency is the **shared elective list constant**
exported from `cc-major-biology.ts` and imported here.

---

## Open questions

1. **Does `BIOL UN2401`/`BIOL UN2402` satisfy `introductory-biology`?**
   The department's *Repeating Biology Courses* paragraph and dozens of its
   prerequisite lines treat "(BIOL UN2005 and BIOL UN2006) or (BIOL UN2401 and
   BIOL UN2402)" as equivalent, but the N&B requirement text names only
   UN2005/UN2006, and the Biology major says other sequences need advance
   permission. If the answer is yes, this group becomes a `sequence_choice` with
   two alternatives, not an `all_of`. **This is the single most important open
   question for this program**, because it is the difference between an exact
   `all_of` and a wrong one, and it affects every GS-track and premedical
   student who took Contemporary Biology.
   *What would resolve it:* one sentence from a Biological Sciences
   undergraduate adviser, or the department's own N&B requirements page
   (`biology.columbia.edu/pages/neuroscience-and-behavior-major-requirements`),
   which is currently unreachable.

2. **The P4 and P5 approved lists.** Published only at
   `psychology.columbia.edu/content/neuroscience-behavior-major`, which returns
   403 to every automated fetch (Cloudflare interstitial). This does **not**
   change the encoding — both groups are `attested` either way, because the
   lists are off-Bulletin and revised annually — but it does mean the notes
   cannot name any example courses.
   *What would resolve it:* a human opening the page in a browser.

3. **Should a `columbia-residency` `attested` group be added?** See *Not
   encodable* item 6. The rule ("at least 4 biology or biochemistry courses and
   at least 18 credits … at Columbia") is real and a student can fail it, which
   is the argument `cc-major-psychology` used to promote its own residency rule
   from NOT-ENCODED to `attested`. I left the call to the transcriber because
   the biology rule is stated as departmental policy rather than as a row of
   this major.

4. **Does `PSYC UN1950` carry points in our catalog?** It resolves but with
   `points_min`/`points_max` null; the Bulletin gives 4.00. Harmless for `n_of`
   (which counts courses), but it would matter if this group were ever rewritten
   as `points_matching`.

---

## Proposed golden records

Hand-written from the Bulletin. Expectations stated by hand, not computed.

### `nb-biology-electives-not-free` — the regression record

> Neuroscience and Behavior major who has finished the required biology year and
> the required neurobiology year and has taken **no** other biology course.

```
programId: "cc-major-neuroscience-and-behavior"
taken: [
  "BIOL UN2005", "BIOL UN2006", "BIOL UN3004", "BIOL UN3005",
  "PSYC UN1001", "PSYC UN2430", "STAT UN1201"
]
expect:
  "introductory-biology":  { status: "satisfied",   completed: 2 }
  "neurobiology":          { status: "satisfied",   completed: 2 }
  "biology-electives":     { status: "unmet",       completed: 0 }   ← THE ASSERTION
  "psychology-introduction":        { status: "satisfied" }
  "neuroscience-lecture":           { status: "satisfied" }
  "statistics-or-research-methods": { status: "satisfied" }
```

*Why:* `BIOL UN3004` and `BIOL UN3005` are the first two rows of the Biology
major's Upper-Level Elective list. Written as `n_of { n: 2 }` over that list —
the obvious transcription — this student reads `2/2 DONE` on two courses they
have not taken. Only `n_matching` with `excludeGroups: ["neurobiology"]` gets
this right. This is the same failure `cc-major-biology` shipped and fixed.

### `nb-stat-un1001-does-not-count` — the copy-from-psychology record

> Neuroscience and Behavior major who took STAT UN1001 Introduction to
> Statistical Reasoning for the statistics requirement.

```
programId: "cc-major-neuroscience-and-behavior"
taken: [
  "PSYC UN1001", "PSYC UN2450", "STAT UN1001",
  "BIOL UN2005", "BIOL UN2006"
]
expect:
  "statistics-or-research-methods": { status: "unmet", completed: 0 }  ← THE ASSERTION
  "psychology-introduction": { status: "satisfied" }
  "neuroscience-lecture":    { status: "satisfied" }
  "introductory-biology":    { status: "satisfied", completed: 2 }
  "neurobiology":            { status: "unmet",     completed: 0 }
```

*Why:* the Bulletin says "Please note, STAT UN1001 does not count towards the
Neuroscience & Behavior major." `cc-major-psychology`'s statistics group **does**
include `STAT UN1001`, so the cheapest way to write this group is to copy that
list — and that produces a rule which passes a student who has not met the
requirement. This record fails against the copied list and passes against the
Bulletin's.

### `nb-alternative-intro-psych` — the edge case (alternative course + mid-sequence)

> Neuroscience and Behavior major who took PSYC UN1021, the Bulletin's
> alternative version of the introductory course, and is one term into
> introductory biology.

```
programId: "cc-major-neuroscience-and-behavior"
taken: ["PSYC UN1021", "PSYC UN1610", "BIOL UN2005"]
planned: ["BIOL UN2006"]
expect:
  "psychology-introduction":        { status: "satisfied", completed: 1 }  ← THE ASSERTION
  "statistics-or-research-methods": { status: "satisfied", completed: 1 }
  "introductory-biology":           { status: "satisfied", completed: 2 }   (UN2006 planned; planned counts, marked)
  "neurobiology":                   { status: "unmet",     completed: 0 }
  "biology-electives":              { status: "unmet",     completed: 0 }
  "neuroscience-lecture":           { status: "unmet",     completed: 0 }
```

*Why two things at once:* (a) the Bulletin's N&B block names only
`PSYC UN1001`, so an over-literal transcription marks this student unmet on a
requirement they have finished — the `econ-honors-math` failure mode, applied to
the "alternative version" rather than the honors version; (b) `PSYC UN1021` has
no row in our catalog, so this record also pins the behaviour of a named course
we cannot resolve. If you would rather keep the record purely about (a), swap
the planned `BIOL UN2006` for a completed one and drop the mid-sequence half.

---

## Sources

**Primary (Bulletin, 2026–2027).** All quoted text above was taken from the
rendered pages, verified against the raw CourseLeaf HTML for footnote markers
and heading structure.

- Biological Sciences (CC) — `.../columbia-college/departments-instruction/biological-sciences/`
- Psychology (CC) — `.../columbia-college/departments-instruction/psychology/`
- Neuroscience and Behavior (GS, cross-check only) — `.../general-studies/majors-concentrations/neuroscience-behavior/`
- Biological Sciences (GS, cross-check only) and Psychology (GS, cross-check only)
- Bulletin course search, for point values of `PSYC UN1660`, `PSYC UN1920`,
  `PSYC UN1950`

**Secondary (departmental).** Used only where it agrees with or supplements the
Bulletin, never against it — per the brief.

- `psychology.columbia.edu/.../N&B_MAJ_checklist__0.pdf` — the current N&B
  Requirement Checklist. Confirms six biology rows, the Fall-2024 elective
  split, "PSYC UN1001, UN1021 or S1001" for P1, and "General Chemistry: (or
  high-school equivalent) CHEM UN1403-1404".
- `psychology.columbia.edu/.../MRC_N&B_Honors.pdf` — **stale**, and a good
  illustration of why the brief says never to trust a departmental advising
  sheet over the Bulletin: it shows *one* biology elective, P2 as
  "PSYC UN1010 or UN2450", and a P3 list missing UN1660/UN1920/UN1950. Every
  one of those is out of date against the 2026–2027 Bulletin. **Do not
  transcribe from it.**

**Unreachable.** `psychology.columbia.edu/content/neuroscience-behavior-major`
and `biology.columbia.edu/pages/neuroscience-and-behavior-major-requirements`
both return HTTP 403 (Cloudflare interstitial) to every automated fetch
attempted. These hold the P4/P5 approved lists and the biology adviser's
approved list. Stated here rather than worked around.

**Catalog.** `.env.local` present, database reachable. Every course code above
was checked against the live `courses` table on 2026-08-26 (terms 20243, 20251,
20263, 20271 — note the hole where Fall 2025 / Spring 2026 would be).

---

## Confidence: 9/10

| Rubric item | Status |
|---|---|
| Every group traced to a URL, rendered text quoted verbatim | ✅ ten groups, both source pages, per-group `sourceUrl` |
| Every footnote marker on every source page resolved | ✅ no `<sup>` markers exist on either page; all three inline asterisks located and attached |
| Point arithmetic reconciled against the published total, shown | ✅ the published total is a *course count*; reconciled to 11, and the reconciliation caught the page's "seven" error |
| Every course code in bulletin form and checked against the catalog | ✅ all checked; 9 unresolved codes named individually |
| Honors/accelerated variants hunted explicitly | ✅ none exist; the two alternative-path analogues both recorded |
| Nine traps considered with a verdict | ✅ above |
| Everything unencodable listed rather than approximated | ✅ eleven items |
| Which file each requirement belongs on, stated | ✅ one new file; shared const imported, not copied |
| Golden records hand-written from the Bulletin | ✅ three, one of them an edge case |

**What is holding it at 9 rather than 10:** the `BIOL UN2401`/`UN2402` question
(open question 1). It is the only place where a plausible reading of the
department's own prose would change a rule kind, and the page that would settle
it is behind a bot wall. Everything else is either resolved or correctly parked
in `attested`, where the unresolved P4/P5 lists cost the transcription nothing.
