# Philosophy

- **Program id:** `cc-major-philosophy`
- **School:** CC (Columbia College) · **Kind:** `major` · **Department:** `Philosophy`
- **Degree points:** the major itself requires **a minimum of 30 points in philosophy**. There
  is no published course count. `degreePoints` on `Program` is only meaningful on
  `kind: "core"`, so it stays unset here; the 30 is a requirement group.
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#requirementstextcontainer`
- **Date researched:** 2026-08-26
- **Catalog resolution:** available. `.env.local` present, Supabase reachable, every code below
  checked against `courses` (terms 20263 / 20271 as `dump-program.ts` uses).
- **Confidence: 9/10.** Everything below is quoted, traced and reconciled, and nothing is
  approximated. The missing point is **not** a gap in my reading — it is that the Bulletin
  contradicts itself twice on this page (see *Open questions* Q1 and Q2) and only the department
  can say which text governs. I have recorded both readings rather than picking one silently.

---

## The shape of this page, and the one thing a transcriber must not miss

The Philosophy requirements tab states the major's requirements **twice**, in two places that do
not agree:

1. **`<h3> Required Coursework for all Programs`** — a prose `<ul>`, six bullets, headed
   *"At least 30 points in philosophy, chosen from courses prefixed with UN, GU, or GR\*,
   including:"*. This block governs the major, the joint major, the minor and the concentration.
2. **`<h3> Major in Philosophy`** — a prose sentence plus one `sc_courselist` table, headed
   *"The major requires a minimum of 30 points in philosophy chosen from courses prefixed with UN
   or GU:"*.

The two differ on the allowed prefixes (`UN, GU, or GR` vs `UN or GU`), on the contents of the
two area requirements, and on whether a substitution is offered at all. Both are on the same tab
of the same page. The dossier below quotes both for every group that they touch.

The **department's own PDF guide** (secondary source, read in full — see *Sources*) agrees with
the prose block, not the table.

---

## Requirement groups

Every group's `sourceUrl` is the same page anchor, because the department publishes the whole
major on one tab:

```
const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#requirementstextcontainer";
```

---

### 1. `history-of-philosophy-i` — "History of Philosophy I"

**Bulletin, prose block, verbatim:**

> PHIL UN2101 History of Philosophy I or another course in ancient or medieval philosophy (e.g.
> UN3131 Aristotle, UN3121 Plato).\*

**Bulletin, Major table row, verbatim:** `PHIL UN2101 | HISTORY OF PHILOSOPHY I |` (no points cell).

**Proposed rule:**

```ts
{ kind: "n_of", n: 1, courses: ["PHIL UN2101", "PHIL UN3131", "PHIL UN3121"] }
```

**Why `n_of` and not `all_of ["PHIL UN2101"]`:** the Bulletin names three courses in this
category with its own words. `all_of` would report a student who took `PHIL UN3121` Plato as
having failed a requirement the Bulletin says Plato satisfies. `n_of` over exactly the three
codes the Bulletin prints never over-counts (each is Bulletin-named) and under-counts strictly
less.

**Why not wider:** the category is open — *"or another course in ancient or medieval
philosophy"* — and the department publishes no list of what else is in it. A `numberRange`
approximation over PHIL would sweep in the entire subject. Not done.

**Note for the student:**
> History of Philosophy I, or another course in ancient or medieval philosophy. The Bulletin
> names Aristotle (PHIL UN3131) and Plato (PHIL UN3121) as examples and the category is open
> beyond them — any substitution must be settled with the Director of Undergraduate Studies, so
> a course outside these three will not be matched here. PHIL UN2101 carries a required 0-point
> discussion section, printed by the Bulletin under its legacy code PHIL V2111; only the lecture
> is matched.

**Footnotes resolved:** the trailing `*` resolves to the prose block's own footnote line,
*"​\* All substituted or related courses must be selected in consultation with the Director of
Undergraduate Studies (DUS)."* It attaches to this row, to row 2, to row 4, to row 5, and to the
word `GR` in the block's opening sentence. There are no `<sup>` markers anywhere in the
requirements container — the asterisks are literal characters (verified programmatically).

**Catalog resolution:** `PHIL UN2101` OK (4 pt, HISTORY OF PHILOSOPHY I) · `PHIL UN3131` OK
(3 pt, ARISTOTLE) · `PHIL UN3121` OK (PLATO, no points recorded — has not run in a term we
carry).

---

### 2. `history-of-philosophy-ii` — "History of Philosophy II"

**Bulletin, prose block, verbatim:**

> PHIL UN2201 History of Philosophy II or another course in the history of late medieval or early
> modern philosophy (e.g. PHIL UN3222 Descartes-Spinoza-Leibniz or PHIL UN3237 Late Medieval and
> Modern Philosophy).\*

**Bulletin, Major table row, verbatim:** `PHIL UN2201 | (blank) |` — **the Title cell is empty and
the code is not hyperlinked**, while every other code in the table links to
`/search/?P=PHIL%20UN2201`-style course pages. In CourseLeaf that is the signature of a code its
own course database no longer resolves.

**Proposed rule:**

```ts
{ kind: "n_of", n: 1, courses: ["PHIL UN2201", "PHIL UN3222", "PHIL UN3237"] }
```

**Note for the student:**
> History of Philosophy II, or another course in the history of late medieval or early modern
> philosophy. The Bulletin names Descartes-Spinoza-Leibniz (PHIL UN3222) and Late Medieval and
> Modern Philosophy (PHIL UN3237) as examples; the category is open beyond them and any
> substitution is settled with the Director of Undergraduate Studies. None of these three has run
> in a term this catalog covers, so if you have taken one it will not be matched automatically —
> that is a gap in our data, not a judgement about your record.

**Catalog resolution — this is a trap-9 group, all three codes:**

| Code | In our catalog? | On the Bulletin's own Courses tab? |
|---|---|---|
| `PHIL UN2201` | **yes**, title `HISTORY OF PHILOSOPHY II`, **no points** (never ran in our four terms) | **no** — appears only inside other courses' prerequisite lines ("Prerequisite: at least one of PHIL UN2201, PHIL UN2301, or PHIL UN3251") |
| `PHIL UN3222` | **no** | **no** |
| `PHIL UN3237` | **no** | **no** |

So the Bulletin's Major table requires, by name, a course that the Bulletin's own course listings
do not offer. Keep all three codes anyway — the MechE precedent (`COMS W1005`, `MATH UN3027`) is
exactly this: dropping an option the Bulletin prints tells a student who took it that it did not
count. `dump-program` will list `PHIL UN3222` and `PHIL UN3237` under *courses named that are not
in our catalog*, which is the honest signal.

---

### 3. `logic` — "Symbolic Logic"

**Bulletin, prose block, verbatim:**

> PHIL UN3411 Symbolic Logic or, in exceptional cases, a more advanced course in logic.

**Bulletin, Major table row, verbatim:** `PHIL UN3411 | SYMBOLIC LOGIC |`

**Proposed rule:**

```ts
{ kind: "all_of", courses: ["PHIL UN3411"] }
```

**Why:** this is the one row on the page with no asterisk. The substitution — *"in exceptional
cases, a more advanced course in logic"* — is trap 4 verbatim: open-ended, unnamed, and not
guessable. There is no numeric floor over PHIL that means "a more advanced logic course"; PHIL
GU4424, GU4431 and GU4481 are logic-adjacent 4000-level courses and PHIL GU4900 is early modern
history at the same level. Recorded under *Not encodable*.

**Note for the student:**
> Symbolic Logic. In exceptional cases the department substitutes a more advanced logic course;
> the Bulletin names none, so no substitute is matched here. PHIL UN1401 Introduction to Logic
> does **not** count toward the major.

**Catalog resolution:** `PHIL UN3411` OK (4 pt, SYMBOLIC LOGIC).

---

### 4. `metaphysics-and-epistemology` — "Metaphysics and epistemology"

**Bulletin, prose block, verbatim:**

> At least one course in metaphysics; epistemology; philosophy of language; philosophy of science;
> phenomenology and existentialism, or a related course.\*

**Bulletin, Major table row, verbatim:**

> At least one course in either metaphysics or epistemology e.g., PHIL W3960, or a related course
> to be chosen in consultation with the director of undergraduate studies.

**Department PDF guide, verbatim:**

> At least one course in either metaphysics or epistemology (e.g., PHIL GU4501, UN3601, or a
> related course to be chosen in consultation with the Director of Undergraduate Studies)

**Proposed rule:**

```ts
{ kind: "attested", note: "…" }
```

**Why `attested` and not `n_of`.** This is the group where the permissive mistake is available
and must be refused. Every one of the three sources gives **examples** (`e.g.`), never a list,
and every one of them ends with *"or a related course to be chosen in consultation with the
DUS"*. There is no published approved-course list for this area — I looked for one on the
Bulletin (both tabs), and in the department's own Undergraduate Program Guide, which is the
document that would carry it. There is none. Writing `n_of` over the handful of `e.g.` codes
would mark the requirement unmet for the majority of students who satisfied it legitimately;
writing `n_matching` over a PHIL number band would mark it satisfied by courses the DUS will
reject. `attested` is the tier for a requirement whose membership is a judgement call, and this
is one.

**Note for the student:**
> One course in metaphysics, epistemology, philosophy of language, philosophy of science, or
> phenomenology and existentialism. The Bulletin's own examples are PHIL UN3601 Metaphysics,
> PHIL UN3960 Epistemology, PHIL GU4501 Epistemology, PHIL UN3551 Philosophy of Science and
> PHIL GU4481 Philosophy of Language, but the category is open and any related course has to be
> agreed with the Director of Undergraduate Studies — so no course number decides this one.

**A code the Bulletin gets wrong here.** The Major table prints `PHIL W3960`. There is no such
course: the live code is `PHIL UN3960 EPISTEMOLOGY` (4 pt), which the same page's Economics-
Philosophy table prints correctly. `PHIL W3960` is a legacy pre-`UN` code left in the table.
Transcribe `PHIL UN3960` if you name it at all; **never** `PHIL W3960`.

**Catalog resolution of the example codes:** `PHIL UN3601` OK (4 pt, METAPHYSICS) ·
`PHIL UN3960` OK (4 pt, EPISTEMOLOGY) · `PHIL UN3551` OK (3 pt, PHILOSOPHY OF SCIENCE) ·
`PHIL GU4501` **not in our catalog** (it *is* on the Bulletin's Courses tab, "PHIL GU4501
EPISTEMOLOGY. 3.00 points", so this is our gap, not the Bulletin's) · `PHIL W3960` **not in our
catalog and never will be**.

---

### 5. `ethics-social-and-political-philosophy` — "Ethics, social and political philosophy"

**Bulletin, Major table rows, verbatim (four consecutive rows):**

> Select at least one course in either ethics or social and political philosophy from the
> following:
> `PHIL UN2702 | Contemporary Moral Problems`
> `PHIL UN3701 | ETHICS`
> `PHIL UN3751 | POLITICAL PHILOSOPHY`
> A related course to be chosen in consultation with the director of undergradute studies.

**Bulletin, prose block, verbatim:**

> At least one course in social and political philosophy; ethics/moral philosophy;
> aesthetics/philosophy of art; or a related course.\*

**Proposed rule:**

```ts
{ kind: "n_of", n: 1, courses: ["PHIL UN2702", "PHIL UN3701", "PHIL UN3751"] }
```

**Why this one IS `n_of` and group 4 is not.** The table says **"from the following:"** and then
prints three codes. That is the department publishing a list — the only place on this page it
does so. Group 4 says "e.g.". The difference is the whole question the humanities majors turn on,
and here the Bulletin answers it differently for the two adjacent rows. Encode what it says.

The open escape (*"A related course to be chosen in consultation with the DUS"*) and the prose
block's extra category (*aesthetics/philosophy of art*, which the table omits entirely) go in the
note. The residual failure is an under-count for a student who used the escape, which sends them
to the DUS — the recoverable direction.

**Note for the student:**
> One course in ethics or in social and political philosophy. The Bulletin lists Contemporary
> Moral Problems (PHIL UN2702), Ethics (PHIL UN3701) and Political Philosophy (PHIL UN3751), and
> accepts a related course agreed with the Director of Undergraduate Studies, which is not
> matched here. The Bulletin's prose version of this requirement also accepts a course in
> aesthetics or philosophy of art; the Major table does not name that category, so check with the
> DUS before relying on it.

**Catalog resolution:** `PHIL UN2702` **not in our catalog, and not on the Bulletin's own Courses
tab either** — Contemporary Moral Problems has not been offered. It stays in the list anyway
(MechE precedent) and will show under *not in our catalog*. `PHIL UN3701` OK (4 pt, ETHICS) ·
`PHIL UN3751` OK (3 pt, POLITICAL PHILOSOPHY).

---

### 6. `major-seminar` — "Majors Seminar"

**Bulletin, prose block, verbatim:**

> At least one major seminar (PHIL UN3912) .

**Bulletin, Major in Philosophy prose, verbatim:**

> All majors must take at least one Majors Seminar (PHIL UN3912).

**Bulletin, Major table row, verbatim:** `PHIL UN3912 | SEMINAR |`

**Proposed rule:**

```ts
{ kind: "all_of", courses: ["PHIL UN3912"] }
```

Three independent statements on one page all name the same single code, with no substitution
offered. `all_of` is exact and correct.

**Bulletin, Courses tab, verbatim (the enrollment restriction):**

> PHIL UN3912 SEMINAR. 3.00 points. Required of senior majors, but also open to junior majors,
> and junior and senior concentrators who have taken at least four philosophy courses. This
> exploration will typically involve writing a substantial research paper. Capped at 20 students
> with preference to ph[ilosophy majors]…

**Note for the student:**
> The Majors Seminar. Required of senior majors and open to junior majors; capped at 20 students
> with preference given to philosophy majors, and the department fills it in a published priority
> order that starts with senior majors who have not taken one before. Register early.

**Catalog resolution:** `PHIL UN3912` OK (3 pt, SEMINAR).

---

### 7. `thirty-points` — "Thirty points in philosophy"

**Bulletin, prose block opening sentence, verbatim:**

> At least 30 points in philosophy, chosen from courses prefixed with UN, GU, or GR\*, including:

**Bulletin, Major in Philosophy sentence, verbatim:**

> The major requires a minimum of 30 points in philosophy chosen from courses prefixed with UN or
> GU:

**Proposed rule:**

```ts
{
  kind: "points_matching",
  points: 30,
  select: {
    subjects: ["PHIL"],
    numberRange: [1000, 4999],
    exclude: ["PHIL UN1401", "PHIL BC4050", "PHIL BC4051", "PHIL BC4052"],
  },
}
```

**This group is the reason a six-group transcription of this major would be wrong.** The six named
rows above come to roughly 22 points (see *Point arithmetic*). The major's floor is 30. A student
who took exactly the six named courses is **eight points short** and every one of their groups
would be green. This block is the only thing that says so, and it is stated only in one sentence
of prose, twice, in two forms.

**Cumulative by design.** The six named courses are *"including"* — the first of the thirty
points, not thirty more on top. This group therefore needs an allowlist entry in
`vacuity.test.ts`'s `CUMULATIVE_BY_DESIGN`, exactly like `cc-major-english:ten-courses`:

```
"cc-major-philosophy:thirty-points":
  'The Bulletin reads "At least 30 points in philosophy … including:" and then lists the six ' +
  "named requirements. They are the first of the thirty points, not thirty more beside them.",
```

**Why `numberRange: [1000, 4999]` — and the conflict it resolves.** `UN` runs 1000–3999 and `GU`
runs 4000–4999, so `[1000, 4999]` is exactly the Major table's "UN or GU". The prose block and
the department guide both say "UN, GU, **or GR**", and our catalog's PHIL `GR` courses sit at
5000, 6000 and 9000. Taking the wider reading would need `[1000, 6999]` — 9000-level PHIL is
doctoral dissertation and colloquium registration and must never count. I recommend the narrower
`[1000, 4999]`, because GR courses need instructor permission and are rare, because under-counting
sends a student to the DUS while over-counting sends them to the registrar after add/drop, and
because the narrow reading is the one printed under the heading *"Major in Philosophy"*. The wider
reading is recorded as Q1 in *Open questions*; if the department confirms it, the change is
`numberRange: [1000, 6999]` and nothing else.

**Why the three exclusions.**
- `PHIL UN1401` — the Bulletin says twice, on the same tab, *"PHIL UN1401 Introduction to Logic
  and Core Courses (Literature Humanities and Contemporary Civilization) do not count towards the
  undergraduate philosophy major."*
- `PHIL BC4050`, `PHIL BC4051`, `PHIL BC4052` — the Overview tab, verbatim: *"All courses offered
  by the Columbia-Barnard joint philosophy curriculum count toward the major at Columbia,
  excluding those courses specifically designed for Barnard students (PHIL BC4050/51 Senior
  Seminar and BC4052 Senior Essay)."* `numberRange` reads the four-digit number regardless of
  prefix (`selector.ts`), so `[1000, 4999]` matches `PHIL BC4050` unless it is excluded by name.
  These are, as it happens, the only three `PHIL BC` courses in our catalog.

Lit Hum and CC need no exclusion — they carry the `HUMA` and `COCI` subjects.

**Note for the student:**
> At least thirty points of philosophy, the six requirements above among them. Columbia and
> Barnard run one joint philosophy curriculum and all of it counts except the courses written for
> Barnard students — PHIL BC4050/BC4051 Senior Seminar and Senior Essay, and BC4052 — which are
> excluded here. PHIL UN1401 Introduction to Logic and the Core courses do not count. Courses in
> other departments count only when cross-listed or when the Director of Undergraduate Studies
> approves them, and neither is matched automatically.

**Catalog resolution:** the selector resolves against the live catalog; PHIL carries 114 course
rows, of which 4×1000-level, 13×2000, 33×3000 (30 UN + 3 OC), 3×4000 BC and 23×4000 GU fall inside
`[1000, 4999]`. The three `PHIL OC399x` codes inside the band (`Berlin Consortium for German
Studies`, `Supervised Study in France`, `Supervised Study in Cuba`) are Columbia-led study-abroad
registrations, which the Overview tab says are *"treated as Columbia courses"* — correctly matched.

---

## Point arithmetic

The Bulletin publishes exactly one number for this major: **a minimum of 30 points**. There is no
course count and no per-row point column — the `hourscol` cell of every row in the
`sc_courselist` table is empty (verified in the raw HTML). So the reconciliation runs the other
way: sum the named rows and show the remainder.

| Group | Course actually taken | Points |
|---|---|---|
| `history-of-philosophy-i` | `PHIL UN2101` | 4 |
| `history-of-philosophy-ii` | `PHIL UN2201` | 4 (see below) |
| `logic` | `PHIL UN3411` | 4 |
| `metaphysics-and-epistemology` | `PHIL UN3601` 4 / `UN3960` 4 / `GU4501` 3 / `UN3551` 3 | 3–4 |
| `ethics-social-and-political-philosophy` | `PHIL UN3701` 4 / `UN3751` 3 | 3–4 |
| `major-seminar` | `PHIL UN3912` | 3 |
| **Named subtotal** | | **21–23** |
| `thirty-points` floor | | **30** |
| **Unnamed remainder** | | **7–9 points, i.e. two or three further philosophy courses** |

`PHIL UN2201` is taken as 4 points by analogy with `PHIL UN2101`, its sibling half of the History
of Philosophy pair, which the Bulletin's Courses tab lists at 4.00. **This is the one number in
this dossier I could not source**: `PHIL UN2201` has no entry on the Bulletin's Courses tab and no
points in our catalog. It does not change the conclusion — the named rows fall short of 30 under
any value of it between 0 and 6 — and it is flagged in *Open questions* Q3.

**The mismatch is real and is the requirement, not an error.** The 30-point floor exceeds the six
named rows by two or three courses. A transcription with six groups and no `thirty-points` block
would report a student complete at 22 of 30 points. That is trap 6, found here, and it is the
single most valuable thing in this dossier.

Cross-checks on the other programs printed on the same page, which use the same six rows and
confirm the model: the **minor** requires 15 points and names no courses at all; the
**concentration** requires 24 points and names no courses at all. Both are stated as bare point
floors with no row list, which is the same construction with the "including" clause removed.

---

## Not encodable

Each item is quoted verbatim and paired with the reason the rule language cannot hold it.

1. **Grade minimum.** *"Courses in which a grade of D or below has been received do not count
   toward the major or minor."* (Stated twice — Program Planning and the Major's Notes list.)
   No grade minima; the rule language refuses them by design and we have no grades.

2. **Pass/fail restriction.** *"Except in unusual cases, no courses can be taken pass/fail to
   fulfill major requirements."* Needs the grading basis of each enrolment.

3. **The 1000-level cap.** *"No more than one course at the 1000-level can be counted toward the
   major."* A constraint *across* the set the student picks, not a property of any one course.
   `CourseSelector` counts courses matching a shape; it cannot say "and at most one of them may
   look like this". Narrowing `thirty-points` to `[2000, 4999]` would under-count the one
   1000-level course a student is legitimately allowed. Carried as a note. This is the identical
   situation to `cc-major-economics`'s "no more than one elective at the 2000-level".

4. **The 4000-level prerequisite.** *"With rare exceptions, students must take at least four
   courses in philosophy before enrolling in a 4000-level course."* A registration rule, and one
   with a stated exception; not a graduation requirement.

5. **GR-prefix permission.** *"Students may register for a GR-prefixed course only with instructor
   permission. Because these courses are capped, students should register early."* An enrolment
   restriction. Not encodable.

6. **The Majors Seminar cap and priority order.** *"Capped at 20 students with preference to
   philosophy majors"*, and the department guide's five-step registration priority (senior majors
   who have not taken one, then junior majors with 5+ philosophy courses, and so on). Enrolment,
   not curriculum.

7. **The Summer Session cap.** *"A maximum of two philosophy courses taken during the School of
   Professional Studies Summer Session can count towards the major."* Needs the term and school of
   each enrolment, and a cross-course cap.

8. **Transfer and study-abroad caps.** *"No more than 5 courses taken at another institution can
   count toward the major."* Transfer-credit provenance; explicitly outside the language.

9. **Residency.** *"Coursework in fulfillment of a major or minor in Philosophy must be taken at
   Columbia University unless explicitly noted here and/or expressly permitted by the Director of
   Undergraduate Studies."*

10. **The open substitutions themselves.** *"or, in exceptional cases, a more advanced course in
    logic"*, *"or another course in ancient or medieval philosophy"*, *"or a related course to be
    chosen in consultation with the director of undergraduate studies"*, and the footnote *"All
    substituted or related courses must be selected in consultation with the Director of
    Undergraduate Studies (DUS)."* Trap 4 in four places. None is a named set; none has a number
    band; each is an advisor petition.

11. **Cross-listed courses in other departments.** Overview tab: *"Courses offered by other
    departments do not count toward the major unless the course is cross-listed. In some cases,
    the DUS may grant an exception."* Cross-listings are per-term and not carried on the course
    record. Named in the `thirty-points` note.

12. **The senior thesis.** *"Undergraduates majoring in Philosophy or Economics-Philosophy may
    propose to write a senior thesis… Students whose proposals are approved should register for
    their faculty advisor's section of Supervised Independent Research for the spring term of
    their senior year."* **Optional, and an honors route, not a graduation requirement** — see
    *Trap 8* below. It is not a group. If it were ever wanted as a note, the registration codes are
    `PHIL UN3996` / `PHIL UN3997` Supervised Senior Research (3 pt each) and `PHIL UN3998`
    Supervised Individual Research (1–3 pt).

13. **Departmental honors.** *"a student must have a grade point average of at least 3.6 in the
    major"*, and *"Normally no more than 10% of the majors graduating in the department each year
    will receive departmental honors."* GPA and a quota.

14. **Advanced Placement.** *"The Department of Philosophy does not accept any advanced placement
    credit toward courses in the curriculum."* Worth a sentence in the file header — it is the
    opposite of the `ECON UN1105` AP situation noted on `seas-core`, and a reader who knows that
    precedent will look for it.

---

## Which file each requirement belongs on

**All seven groups belong on `lib/requirements/programs/cc-major-philosophy.ts` and nowhere else.**

- **Nothing is delegated to `cc-core`.** Philosophy states its own outside coursework — there is
  none. The major is entirely `PHIL` courses; there is no mathematics, science or language block
  hiding on another page. I read the whole Requirements tab and the whole Overview tab, not just
  the "Major in Philosophy" heading, precisely because that seam is what hid a science block from
  `seas-major-computer-science`. This page has no such seam.
- **Nothing of the Core belongs here.** Lit Hum and CC are `cc-core`'s, and the Bulletin says
  twice they do not count toward this major.
- **Warning for whoever encodes the joint major next.** `Joint Major in Economics-Philosophy` is
  printed on this same page and is a *different program* (`cc-major-economics-philosophy`, not yet
  encoded). If it is added, `PHIL UN3411` will exist on both files, and `ECON UN1105`,
  `ECON UN3211`, `ECON UN3213`, `ECON UN3412` will exist on both it and `cc-major-economics`. That
  is trap 7 exactly — the `ECON UN1105` duplication that was removed from three SEAS files. The
  joint major's requirements belong on the joint major's file alone; do not import them here.
- **A second warning about that joint major:** the page states its seminar code **two different
  ways** — the prose bullet says `ECPH UN4950 Senior Seminar in Economics and Philosophy`, the
  table row says `ECPH GU4950`. Neither is in our catalog. The Bulletin's Courses tab lists
  `ECPH GU4950`. Whoever encodes it should use `ECPH GU4950` and record the contradiction.

---

## Nine traps — verdict on each

1. **`sequence_choice` vs `n_of { n: 2 }`.** *Not applicable, and checked.* History of Philosophy
   I and II look like a sequence and are not one: they are two independent rows with two
   independent substitution clauses, and the Bulletin never uses the words "sequence" or
   "both terms". A student may satisfy row 1 with Plato and row 2 with History of Philosophy II
   and that is a complete, legitimate schedule. Two separate `n_of` groups is correct;
   `sequence_choice` would wrongly forbid the mixed path, and `n_of { n: 2 }` over all six codes
   would wrongly accept Plato + Aristotle with no early-modern course at all.
2. **Delegated blocks nobody picked up.** *Checked, none.* I read the entire Requirements tab
   (all eleven headings) and the entire Overview tab. There is no Degree Track table, no
   outside-department block, and no requirement delegated to the Core. The major is 30 points of
   `PHIL` and nothing else.
3. **Footnotes.** *One footnote marker on the page, resolved.* A literal `*`, attaching to the
   `GR` prefix in the block's opening sentence and to rows 1, 2, 4 and 5; it resolves to *"All
   substituted or related courses must be selected in consultation with the Director of
   Undergraduate Studies (DUS)."* There are **zero** `<sup>` elements and zero `sc_footnotes`
   blocks in the requirements container (verified programmatically). The six-item "Notes:" list
   under the Major table is not footnote-attached — it is a flat policy list, and all six items
   are resolved under *Not encodable*.
4. **"Or higher" / open-ended substitutions.** *Present, four times, all recorded verbatim and
   none encoded.* See *Not encodable* item 10. The most dangerous is the logic row — *"in
   exceptional cases, a more advanced course in logic"* — because a naive `numberRange` over PHIL
   4000-level would sweep in early modern history seminars.
5. **CourseLeaf eats labels.** *Present, three ways, none fatal but all worth knowing.*
   (a) `PHIL UN2201`'s Title cell is empty and its code is not hyperlinked, while every other code
   in the table links out. (b) The Major table has **no `areaheader` classes and no `blockindent`
   classes at all**: the row *"Select at least one course in either ethics or social and political
   philosophy from the following:"* and its three options render at exactly the same indent level
   as the three flatly-required courses. A parser reading this table produces an `all_of` over six
   codes, which is wrong in the direction that fails a complete student. (c) The Economics-
   Philosophy table on the same page renders `PROBABILITY ＆ DECISION THEORY` with a fullwidth
   ampersand `＆` (U+FF06), not `&`.
6. **Reconcile the arithmetic.** *Done, and it is the headline finding.* Named rows 21–23 points
   against a 30-point floor. See *Point arithmetic*. The gap is the requirement, not an error.
7. **Duplicated requirements across files.** *Checked and stated.* See *Which file* above. Nothing
   here duplicates `cc-core`, `cc-major-economics` or `cc-concentration-economics` today; the
   Economics-Philosophy joint major is the live risk and is flagged.
8. **Honors / accelerated sequences.** *Hunted for explicitly; there is none.* The department has
   no honors variant of any required course and no accelerated track. The senior thesis is
   optional and, per the Overview tab, one of **two** routes to honors — the other being faculty
   nomination with a writing sample, which involves no coursework at all. Encoding the thesis as a
   requirement would tell every non-thesis major they had failed the major. It is not a group.
   *(For contrast: the `cc-major-economics` bug was an honors sequence that was a complete,
   sufficient path and had no room in the encoding. Nothing on this page has that shape.)*
9. **Courses the Bulletin names that our catalog lacks.** *Five, all flagged, none dropped:*
   `PHIL UN2702` (Major table, and absent from the Bulletin's own Courses tab too),
   `PHIL W3960` (Major table; a dead legacy code, use `PHIL UN3960`), `PHIL UN3222` and
   `PHIL UN3237` (prose examples), and `PHIL GU4501` (department guide example; present on the
   Bulletin's Courses tab at 3.00 points, so this one is our gap). Plus `PHIL UN2201` and
   `PHIL UN3121`, which are *in* our catalog but carry no points because they have not run in any
   term we cover — the "we cannot tell" case rather than the "you did not take it" case.

---

## Open questions

**Q1 — Does the major accept `GR`-prefixed courses?** *(affects `thirty-points`)*
The Bulletin says both things on one tab: the prose block says *"prefixed with UN, GU, or GR"*,
the Major heading says *"prefixed with UN or GU"*. The department's own PDF guide says
*"UN, GU, or GR"*. Two of three sources say GR. I recommend the narrow reading anyway
(`numberRange: [1000, 4999]`), because under-counting is recoverable and because 9000-level PHIL
is doctoral registration. **What would resolve it:** one email to the DUS, or a future Bulletin
edition that makes the two sentences agree. **If GR is confirmed**, the fix is
`numberRange: [1000, 6999]` and nothing else — `[1000, 9999]` would be wrong in every case.

**Q2 — Which text governs the two area requirements, the prose or the table?**
*(affects `metaphysics-and-epistemology` and `ethics-social-and-political-philosophy`)*
The prose block's area 1 is five categories wide (*metaphysics; epistemology; philosophy of
language; philosophy of science; phenomenology and existentialism*); the table's is two
(*metaphysics or epistemology*). The prose block's area 2 includes *aesthetics/philosophy of art*;
the table's does not name that category at all. Both encodings above take the union — area 1
stays `attested` under either reading, and area 2's `n_of` list is the table's and is a subset of
the prose's, so **neither reading changes the proposed rules.** It changes only the notes. Flagged
because a future editor reconciling the page could narrow area 2's list, and then the `n_of` would
need to move with it. **What would resolve it:** the department's next-edition text.

**Q3 — What is `PHIL UN2201` worth, and is it still offered?**
It is required by name in the Major table, has an empty Title cell and no hyperlink there, has no
entry on the Bulletin's own Courses tab, and carries no points in our catalog. Our catalog does
hold the code and title. It is plausibly a course on hiatus that the table has not caught up with,
which is exactly what the prose block's substitution clause exists for. **What would resolve it:**
the department's course listing for a term we do not yet carry, or the DUS. **Impact:** none on
the rules — the `n_of` keeps the code either way, and `dump-program` will surface it — and none
on the arithmetic conclusion.

**Q4 — the department's live website could not be read.** `philosophy.columbia.edu` sits behind a
Cloudflare interstitial that returns 403 to every fetch I tried (direct, browser user-agent,
`r.jina.ai`), and the Wayback Machine holds no HTML capture of its undergraduate pages. My
secondary source is therefore the department's **Undergraduate Program Guide PDF, dated
20 Aug 2024** (`philosophy.columbia.edu/sites/…/Undergraduate%20Program%20Guide_20Aug2024.pdf`),
which fetches fine and is two Bulletin editions old. It agrees with the 2026–2027 Bulletin
everywhere they overlap, which is why I did not discount it — but it is not current, and per the
brief it is a secondary source and the Bulletin wins wherever they part. They do not part on
anything encoded above.

---

## Proposed golden records

Written by hand from the Bulletin text quoted above. None was computed from the evaluator.

### 1. `phil-six-required-only` — the record that catches the missing point block

```
who:       Philosophy major who took exactly the six courses the Bulletin names by row,
           and nothing else.
programId: cc-major-philosophy
taken:     PHIL UN2101, PHIL UN2201, PHIL UN3411, PHIL UN3601, PHIL UN3701, PHIL UN3912
expect:
  history-of-philosophy-i:                { status: "satisfied" }          // PHIL UN2101
  history-of-philosophy-ii:               { status: "satisfied" }          // PHIL UN2201
  logic:                                  { status: "satisfied" }          // PHIL UN3411
  ethics-social-and-political-philosophy: { status: "satisfied" }          // PHIL UN3701
  thirty-points:  { status: "in_progress", completed: 23, required: 30 }
```

**Why it is the important one.** Every named row is green and the student is **seven points and
two courses short of the major**. A transcription that stopped at the six rows scores this student
100% complete. `metaphysics-and-epistemology` and `major-seminar` are `attested`, so they report
`unmet` unless the fixture ticks them — that is the correct behaviour and the record should not
tick them, so the audit shows two attested boxes outstanding as well.

**Fixture hazard, stated because it will bite:** `PHIL UN2201` and `PHIL UN3121` carry **no
points** in our catalog, so `pointsFor` returns 0 for them and `thirty-points` would read 19, not
23. The golden fixture must supply `PHIL UN2201: 4` in its `POINTS` map (as `golden.ts` already
does for the Economics core), or the record documents our data gap instead of the Bulletin's rule.
Set it explicitly and comment why.

### 2. `phil-substituted-ancient` — the substitution edge case

```
who:       Philosophy major who took Plato instead of History of Philosophy I — the
           substitution the Bulletin itself names in parentheses.
programId: cc-major-philosophy
taken:     PHIL UN3121, PHIL UN2201, PHIL UN3411, PHIL UN3751, PHIL UN3912,
           PHIL UN3551, PHIL UN3960, PHIL UN3601
expect:
  history-of-philosophy-i:                { status: "satisfied" }   // PHIL UN3121 Plato
  history-of-philosophy-ii:               { status: "satisfied" }
  logic:                                  { status: "satisfied" }
  ethics-social-and-political-philosophy: { status: "satisfied" }   // PHIL UN3751
  thirty-points:                          { status: "satisfied" }
```

**Why.** It fails against the obvious wrong encoding, `all_of ["PHIL UN2101"]`, which would tell a
student holding a course the Bulletin explicitly offers as a substitute that they must go back and
take History of Philosophy I. This is the same shape as the `econ-honors-math` regression: a
complete path with no room in the encoding, and the student least likely to doubt the app.
Point check by hand: UN3121 (0 in our catalog — supply 4) + UN2201 (4) + UN3411 (4) + UN3751 (3) +
UN3912 (3) + UN3551 (3) + UN3960 (4) + UN3601 (4) = **29**, one point short — so make it **30** by
setting `PHIL UN3121: 4` in the fixture, or add a ninth course. State the arithmetic in the
record's comment; a golden record whose point total nobody added up is not a golden record.

### 3. `phil-barnard-senior-seminar` — the exclusion edge case

```
who:       Philosophy major padding their points with Barnard's senior seminar and senior
           essay, which the department excludes by name.
programId: cc-major-philosophy
taken:     PHIL UN2101, PHIL UN2201, PHIL UN3411, PHIL UN3701, PHIL UN3912,
           PHIL BC4050, PHIL BC4051, PHIL UN1401
expect:
  thirty-points: { status: "in_progress", completed: 19, required: 30 }
```

**Why.** `numberRange` reads the four-digit number irrespective of prefix, so `[1000, 4999]`
matches `PHIL BC4050` (4 pt) and `PHIL BC4051` (3 pt) unless they are excluded by name — and
`PHIL UN1401` (3 pt) unless it is too. Without the three exclusions this student reads 29 of 30
instead of 19 of 30: ten points of coursework the Bulletin says twice does not count toward the
major. It is the only record here that tests the `exclude` list, and the exclusions are the
easiest thing in this transcription to leave out.

---

## Sources

**Primary — Columbia Bulletin, 2026–2027 edition:**
- Philosophy, Requirements tab (all seven groups):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#requirementstextcontainer`
- Philosophy, Overview tab (Barnard exclusions, cross-listing rule, senior thesis, honors, AP):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#textcontainer`
- Philosophy, Courses tab (point values, the `PHIL UN3912` enrolment restriction, `PHIL GU4501`,
  the `PHIL V2111` corequisite, and the absence of `PHIL UN2702` and `PHIL UN2201`):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/philosophy/#coursestextcontainer`

**Secondary — department, and where it disagrees:**
- Columbia Department of Philosophy, *Undergraduate Program Guide*, 20 Aug 2024:
  `https://philosophy.columbia.edu/sites/philosophy.columbia.edu/files/content/Undergraduate%20Program%20Guide_20Aug2024.pdf`
  Agrees with the Bulletin's prose block on the `GR` prefix; supplies `PHIL GU4501` and
  `PHIL UN3601` as area-1 examples where the Bulletin table has the dead code `PHIL W3960`; adds
  the Majors Seminar registration priority order. **Trusted only as corroboration** — it is two
  editions old, and per the brief the Bulletin governs.
- `philosophy.columbia.edu` HTML pages: **unreachable**, Cloudflare 403 on every route tried, no
  Wayback HTML captures. Recorded rather than worked around.

**Repo:** `lib/requirements/types.ts`, `evaluate.ts`, `selector.ts`, `vacuity.test.ts`,
`golden.ts`, `programs/seas-core.ts`, `programs/seas-major-mechanical-engineering.ts`,
`programs/cc-major-economics.ts`, `programs/cc-major-english.ts`, `programs/cc-major-history.ts`,
`programs/cc-major-psychology.ts`. Catalog checked with `scripts/dump-program.ts` for shape and a
throwaway Supabase query for the individual codes (removed).
