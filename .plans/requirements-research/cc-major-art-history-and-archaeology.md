# Art History

- **Program id:** `cc-major-art-history` — **not** `cc-major-art-history-and-archaeology`.
  See *Scoping* below; this is a naming correction, and it is the first finding in the dossier.
- **School:** CC (Columbia College) · **Kind:** `major` ·
  **Department:** `Art History and Archaeology`
- **Degree points:** the major is **11 courses, 36 to 43 points**, stated by the Bulletin in one
  sentence. `degreePoints` on `Program` is only meaningful on `kind: "core"`, so it stays unset;
  the course count becomes a group.
- **Bulletin edition:** 2026–2027
- **Primary source URL:**
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/art-history-archaeology/#requirementstextcontainer`
- **Date researched:** 2026-08-26
- **Catalog resolution:** available. `.env.local` present, Supabase reachable, every code below
  checked against `courses`.
- **Confidence: 8/10 — below the bar, and here is exactly what is blocking it.**
  Two things, both external, neither fixable by more work from me:

  **(a) The Art History Field Distribution Chart is unreadable.** It is the single artifact that
  says which course covers which historical period and which world region, and which Barnard
  `AHIS BC` courses count at all. The department publishes it as a Google Sheet; that sheet now
  returns **HTTP 401** on every published-URL variant (`pubhtml`, `pub?output=csv`, with and
  without `gid`), and the Wayback Machine holds **no capture of the sheet itself** — only of the
  page that links to it. I could not read it. This does not change the *rules* I propose (both
  distribution groups are `attested` under any reading, for reasons given below), but it does
  leave the `ten-art-history-courses` selector unverified against the department's own eligible-
  course list, and that is a counted group.

  **(b) `AHIS UN3007` is a code I cannot confirm.** The department's own worksheet says the Majors
  Colloquium is *"AHIS UN3000 or AHIS UN3007"*. The Bulletin names only `AHIS UN3000`, its Courses
  tab lists only `AHIS UN3000`, and `AHIS UN3007` is not in our catalog. One of the two sources is
  stale and I cannot tell which.

  Everything else meets the rubric: every group traced and quoted, every footnote resolved (there
  are none, and I verified that programmatically rather than by skimming), the point arithmetic
  reconciled against the published total **three independent ways**, every code checked, all nine
  traps given a verdict, and nothing approximated.

---

## Scoping: three majors on this page, no archaeology major anywhere on it

The task named this program "Art History and Archaeology" and asked whether the Bulletin treats
art history and archaeology as one major with a choice inside it, or as separate programs. The
answer is neither, and it is worth stating plainly because it changes the program id.

**"Art History and Archaeology" is the name of the department, not of a major.** The department
publishes three majors, and the Overview tab says so verbatim:

> The department offers three majors: Art History, History & Theory of Architecture, and a
> combined Art History+Visual Arts major; as well as two minors/concentrations: Art History, and
> History & Theory of Architecture.

The Requirements tab's headings confirm it exactly — `Major in Art History`,
`Major in History and Theory of Architecture`, `Combined Major in Art History+Visual Arts`,
`Minor in Art History`, `Minor in History and Theory of Architecture`, and, under
*"For students who entered Columbia in or before the 2023-24 academic year"*,
`Concentration in Art History` and `Concentration in History and Theory of Architecture`.
There is **no heading containing the word "Archaeology"** on the page.

**Archaeology is a separate Bulletin program on its own page.** It is the
*Interdepartmental Major in Archaeology*, run by the Center for Archaeology, at
`https://bulletin.columbia.edu/columbia-college/departments-instruction/archaeology/`, with its
own DUS (Prof. Hannah Chazin), its own headings `Major in Archaeology` / `Minor in Archaeology` /
`Concentration in Archaeology`, and its own overview beginning *"The Interdepartmental Major in
Archaeology"*. It is a different program with a different id (`cc-major-archaeology`) and a
different research dossier, and nothing about it belongs in this file.

**Consequence for the id.** `cc-major-art-history-and-archaeology` names a major that does not
exist. The repo's own precedent is `cc-major-english` with `department: "English and Comparative
Literature"` — the major takes the major's name, the department field takes the department's. So:
`id: "cc-major-art-history"`, `name: "Art History"`, `department: "Art History and Archaeology"`.
This dossier's filename keeps the assigned name so the task's paperwork lines up; the program id
should not.

**The two sibling majors are out of scope and each needs its own dossier**, because they are not
tracks inside this one — they are separate headings with separate course counts and separate point
ranges. `cc-major-history-and-theory-of-architecture` (11 courses, 37–43 points) and
`cc-major-art-history-visual-arts` (16 courses, 49–57 points). I read both closely anyway, because
they share this major's distribution language and because the point model has to explain all three
or it explains none. One of them contains a Bulletin arithmetic error — see *Point arithmetic*.

---

## The one structural hole on this page

The Requirements tab carries the heading **`<h3> Required Coursework for all Programs`** and
**nothing under it**. The raw HTML is:

```html
<h3 class="toggle"><span id="docs-internal-guid-…">Required Coursework for all Programs </span></h3>
<h3 class="toggle"><span id="docs-internal-guid-…">Major in Art History</span></h3>
```

One heading directly followed by the next, no paragraph, no list, no table between them.

This matters because on the Philosophy page the identically-named heading carries the entire
substance of the major. It is the CourseLeaf template's slot for shared, cross-program
requirements — and on this page it is empty. Two readings: the department genuinely has no shared
coursework (plausible; the three majors overlap but do not share a required block), or content was
lost the way the third Global Core alternative was lost on the SEAS core page.

I treated it as a possible delegated block and went looking for what would have been in it: I read
the Overview tab end to end, the department's archived requirement worksheet, and the Bulletin's
Courses tab. Nothing shared surfaced that is not already inside one of the per-major lists. I am
recording it as a hole rather than resolving it, because the honest statement is "the Bulletin
prints an empty heading here" and the cost of guessing at its contents is exactly the failure the
brief calls unrecoverable.

---

## Requirement groups

Every group's `sourceUrl` is the same page anchor:

```
const SOURCE =
  "https://bulletin.columbia.edu/columbia-college/departments-instruction/art-history-archaeology/#requirementstextcontainer";
```

The whole major is **three sentences of prose**. There is not a single `sc_courselist` table
anywhere in the requirements container (`c.find_all('table')` returns zero), so there is nothing
here a parser could read and every group below was transcribed by hand. The governing sentence,
verbatim:

> Students must take three art history courses covering three of four distinct historical periods;
> two art history courses covering two of five distinct geographic regions; any two additional
> elective courses in art history; two art history seminars; a studio art course; and the Majors
> Colloquium. These courses may be taken in any order, though the seminars and the Colloquium are
> usually taken in junior and/or senior year.

3 + 2 + 2 + 2 + 1 + 1 = **11**, which is the count the Bulletin states in the sentence above it.
The list closes.

---

### 1. `majors-colloquium` — "Majors Colloquium"

**Bulletin, Requirements tab, verbatim:**

> The Majors Colloquium should be taken during junior year. Sign-up information will be circulated
> via the department listserv. The Majors Colloquium cannot be substituted by a transfer course.

**Bulletin, Overview tab, verbatim** — this is the only place on the Bulletin that gives the code:

> At the heart of the major is the Majors Colloquium (AHIS UN3000 INTRO LIT/METHODS OF ART HIST)
> which introduces students to different methodological approaches to Art History and critical
> texts that have shaped the discipline. This course also prepares students for the independent
> research required in seminars and advanced lecture courses, and should be taken during junior
> year.

**Bulletin, Courses tab, verbatim:**

> Majors Colloquium — Required course for all majors in the department.
> AHIS UN3000 INTRO LIT/METHODS OF ART HIST. 4.00 points. Required course for department majors.
> Not open to Barnard or Continuing Education students. Students must receive instructors
> permission.

**Proposed rule:**

```ts
{ kind: "all_of", courses: ["AHIS UN3000"] }
```

**The disagreement, recorded rather than resolved.** The department's own worksheet
(`arthistory.columbia.edu/content/major-and-minor-course-requirements`, Wayback capture
2026-07-06) opens every one of its three major checklists with:

> The Majors Colloquium: AHIS UN3000 or AHIS UN3007

The Bulletin names only `AHIS UN3000`, in two places. `AHIS UN3007` appears nowhere in the
Bulletin — not in the Requirements tab, not in the Overview tab, and not in the Courses tab, whose
`Majors Colloquium` section lists `AHIS UN3000` and nothing else. It is not in our catalog either.

**I trust the Bulletin and encode `AHIS UN3000` alone**, per the brief's rule that a departmental
page is a secondary source. The cost is an under-count for a student who took `AHIS UN3007`, which
sends them to the DUS — the recoverable direction — and the note tells them so. The alternative,
`n_of { n: 1, courses: ["AHIS UN3000", "AHIS UN3007"] }`, is the permissive reading; it is
defensible and I am recording it here so the transcriber can take it deliberately if they can
confirm the code. It is Q1 in *Open questions*.

**Note for the student:**
> The Majors Colloquium, AHIS UN3000. Required of every major in the department and best taken in
> junior year; sign-up is circulated on the department listserv, the instructor's permission is
> needed, it is not open to Barnard or Continuing Education students, and it cannot be satisfied
> by a transfer course. The department's own worksheet also lists AHIS UN3007 as an alternative
> colloquium; the Bulletin does not name it and it is not matched here, so ask the Undergraduate
> Program Coordinator if that is the one you took.

**Catalog resolution:** `AHIS UN3000` OK (4 pt, INTRO LIT/METHODS OF ART HIST) ·
`AHIS UN3007` **not in our catalog and not in the Bulletin**.

---

### 2. `ten-art-history-courses` — "Ten courses in art history"

**Bulletin, verbatim (the count):**

> The major in Art History requires 11 total courses and can range from 36 to 43 points depending
> on which classes a student takes to fulfill the requirements.

**Bulletin, verbatim (the one course of the eleven that is not art history):**

> The studio art requirement can be fulfilled by any studio course in the Visual Arts Department.
> It may be taken Pass/Fail.

Eleven total, one of which is a Visual Arts studio course, leaves **ten art history courses**: the
three period courses, the two region courses, the two free electives, the two seminars, and the
Colloquium.

**Proposed rule:**

```ts
{
  kind: "n_matching",
  n: 10,
  select: {
    subjects: ["AHIS"],
    numberRange: [1000, 4999],
    exclude: ["AHIS UN3002"],
  },
}
```

**Why this group exists at all.** It is the only countable spine the major has. Every other art
history requirement on this page is a distribution designation the Bulletin does not publish, so
without this group the audit would consist of one `all_of`, one `n_matching` over VIAR, and three
attested boxes — and it would never notice a student two art history courses short. This is the
`cc-major-english:ten-courses` construction, for the same reason and with the same shape.

**`numberRange: [1000, 4999]`, and why the ceiling is load-bearing.** The Bulletin's own Course
Numbering Structure section fixes the undergraduate band, verbatim:

> 1000-level courses are broad survey lectures open to all undergraduate students. They do not
> count toward a historical or geographical requirement, though they may count as an elective
> lecture (or as a required course for HTAC programs, in the case of AHIS UN1007).
> 2000-level courses are survey lectures focusing on a particular subject area…
> 3000-level courses are seminars open to undergraduate students only…
> 4000-4499–level courses are advanced bridge lectures open to undergraduate and graduate
> students…
> 4500-4999–level courses are advanced bridge seminars open to undergraduate and graduate
> students…

Nothing above 4999 is described. Our catalog carries **67 `AHIS` courses at 5000, 6000, 8000 and
9000** — graduate seminars and dissertation registration, none of which counts toward this major.
Subject alone would let all 67 in. This is precisely the fix made to `cc-major-english`'s
ten-course selector on 2026-08-24, and it costs a student nothing: the Bulletin's own numbering
section describes the major's courses as 1000- through 4999-level, and Barnard's `AHIS BC` codes
fall inside that band.

**`exclude: ["AHIS UN3002"]`, and why it is not fussiness.** The Bulletin, verbatim:

> The Senior Thesis is an optional project open to Art History, History and Theory of
> Architecture, and Art History+Visual Arts majors. All thesis writers are required to enroll in
> the year‐long (YC) course AHIS UN3002 Senior Thesis Seminar, which is offered as a 3‐point
> seminar in the fall and a 3‐point seminar in the spring. **This 6‐point year‐long seminar may
> substitute for a single elective lecture course.**

A thesis writer's record carries `AHIS UN3002` **twice** — one fall enrolment, one spring — under
one course code. Left in the selector, those two entries count as two of the ten, when the
Bulletin says the whole six-point year substitutes for **one**. That is a silent over-count of one
course, landing on exactly the students most likely to be near the line. Excluding the code
under-counts a thesis writer by one instead, which the note explains and which sends them to the
DUS. Under-count over over-count, every time.

**Cumulative by design.** The ten include the Colloquium and both seminars — they are ten of the
eleven, not ten beside them. This needs a `CUMULATIVE_BY_DESIGN` entry in `vacuity.test.ts`
alongside `cc-major-english:ten-courses` and `cc-major-psychology:eleven-courses`:

```
"cc-major-art-history:ten-art-history-courses":
  'The Bulletin states "11 total courses" and names the studio course as the one taken outside ' +
  "the department. The other ten — Colloquium, two seminars, three period courses, two region " +
  "courses and two electives — are the ten, not ten more beside them.",
```

**Note for the student:**
> Ten of the eleven courses in the major are art history courses; the eleventh is the studio
> course below. Columbia and Barnard art history courses both carry the AHIS subject and are
> matched here. Two things that count are not matched: the department also teaches courses under
> the AHUM and AHCE subjects (AHUM UN2604 Arts of China, Japan and Korea; AHUM UN2800 Arts of
> Islam; AHCE W4149 The Roman Art of Engineering), and the year-long Senior Thesis Seminar
> AHIS UN3002, which substitutes for one elective lecture and is deliberately left out so that its
> two enrolments are not counted as two courses. Art Humanities does not count toward the major.
> No more than three transfer courses may count, and the Colloquium can never be one of them.

**Catalog resolution:** the selector resolves live. `AHIS` carries 240 rows; 173 of them fall
inside `[1000, 4999]` (10 at 1000-level, 47 at 2000, 73 at 3000, 43 at 4000-level), and 67 sit at
5000 and above and are correctly excluded by the ceiling. Two known imperfections, both stated
rather than papered over:

- **The department's non-`AHIS` subjects are not matched.** `AHUM UN2604`, `AHUM UN2800` and
  `AHCE W4149` are printed in the Bulletin's own AHIS course listings and plainly count. Adding
  `subjects: ["AHIS", "AHUM"]` would be worse, not better: `AHUM` also holds `AHUM UN1399`,
  `AHUM UN1400` and `AHUM UN3830`, the Global Core *Colloquium on Major Texts* courses, which are
  not art history at all. Per-term cross-listings go in the note, exactly as
  `cc-major-history` handles them.
- **Six Barnard `AHIS BC` courses are studio, not art history**, and would count:
  `AHIS BC3002` / `BC3003` Supervised Proj Photography, `AHIS BC3004` Photographing the
  Anthropocene, `AHIS BC3530` / `BC3531` Advanced Senior Studio, `AHIS BC3867` Photo as Material:
  A Studio Lab. Whether they count is precisely what the unreadable Field Distribution Chart would
  say. This is the concrete cost of blocker (a), and it is Q2 in *Open questions*.

---

### 3. `distribution-historical-periods` — "Distribution — historical periods"

**Bulletin, verbatim:**

> Students must take three art history courses covering three of four distinct historical
> periods…
> The four historical period distribution categories are pre-400 CE; 400-1400 CE; 1400-1700 CE;
> and 1700-Present.

**Proposed rule:**

```ts
{
  kind: "attested",
  note: "Three courses, each covering a different one of the four historical periods — pre-400 CE, 400–1400 CE, 1400–1700 CE, and 1700–present. Which period a course covers is set per course per term on the department's Art History Field Distribution Chart, not by its course number; 1000-level survey lectures carry no period designation at all and cannot fill one of these three.",
}
```

**Why `attested`, and why the alternatives are worse.** This is the group the brief warns about,
and the honest answer here is not the comfortable one.

- **Is there a published approved-course list, which would make it `n_of`?** There is a chart, and
  I could not read it. The department publishes an *Art History Field Distribution Chart* as a
  Google Sheet, linked from
  `arthistory.columbia.edu/content/which-requirements-do-my-art-history-courses-fulfill`, whose
  text reads verbatim: *"The Art History Field Distribution Chart indicates which distribution
  requirements art history courses are eligible to fulfill. Please refer to this chart before
  signing up for classes."* The sheet returns **HTTP 401** on the `pubhtml`, `pub?output=csv` and
  bare-`pubhtml` URLs, and has no Wayback capture. So a list exists and I have not seen it.
- **Would it be `n_of` even if I had?** No. It is a departmental Google Sheet revised per term,
  not the Bulletin, and a course carries several designations at once. That is the same situation
  as English's *"Designations of distribution requirements can be found on the department's course
  listings site"*, which this repo already answered with `attested`, one group per Bulletin row.
- **Is there a subject-plus-number-range reading, which would make it `n_matching`?** No, and this
  is the decisive point. "Pre-400 CE" is a property of a course's *content*. `AHIS UN2109` Roman
  Art & Architecture and `AHIS UN2400` Nineteenth-Century Art in Europe are adjacent numbers in
  the same band covering periods seventeen centuries apart. No arrangement of `numberRange` can
  separate them, and `requirement_flags` does not carry art history period designations.
- **And the rule language cannot express "three of four distinct" at all.** Even given a perfect
  per-period list, satisfying this needs three courses in three *different* periods. A rule that
  counted three courses from a pooled list would mark a student satisfied by three courses all in
  1700-Present. `n_matching` counts; it cannot require distinctness across a partition. Splitting
  into four groups of one would be worse — it would demand all four periods, when the Bulletin
  asks for three.

So `attested`, and the note does the student's checking for them. This mirrors `cc-major-history`'s
treatment of its seminar band exactly: state the rule precisely enough that a student can verify
it, rather than checking it wrong.

**Bulletin cross-check that the note is right about 1000-level courses:** *"1000-level courses…
do not count toward a historical or geographical requirement, though they may count as an elective
lecture."* That sentence is why the note says so, and it is a real trap — a student who takes two
1000-level surveys has two of their ten courses but zero of their three periods.

---

### 4. `distribution-world-regions` — "Distribution — world regions"

**Bulletin, verbatim:**

> …two art history courses covering two of five distinct geographic regions…
> The five geographic region distribution categories are Africa; Asia; Europe/N.
> America/Australia; Latin America; and Middle East.

**Proposed rule:**

```ts
{
  kind: "attested",
  note: "Two courses, each covering a different one of the five world regions — Africa, Asia, Europe/North America/Australia, Latin America, and the Middle East. As with the historical periods, the designation is set per course per term on the department's Art History Field Distribution Chart, and 1000-level survey lectures carry none.",
}
```

Same reasoning as group 3, and note the trap in the numbers: the **major** and the **combined
major** use **five** regions including Europe/N. America/Australia; the **minor**, the
**History and Theory of Architecture major**, and both **concentrations** use **four** and drop
Europe/N. America/Australia. The Bulletin prints both lists on the same page, four paragraphs
apart. Transcribing the wrong one gives an Art History major a requirement they do not have.

**Two separate groups, not one.** Periods and regions are two Bulletin sentences with two
different counts (three of four, two of five) and two different category sets. The English file's
convention is one group per Bulletin row so the UI shows the department's own structure; that is
right here too.

---

### 5. `seminars` — "Seminars"

**Bulletin, verbatim (the requirement):**

> …two art history seminars…

**Bulletin, verbatim (the numbering, from Course Numbering Structure):**

> 3000-level courses are seminars open to undergraduate students only. Seminars are
> limited‐enrollment classes which offer students the opportunity to explore a topic in‐depth with
> the instruction of a faculty member who is an expert in that field. Seminars typically require
> intensive reading and discussion, culminating in an extended research paper and oral
> presentation. Students must submit an application to be considered for enrollment in a seminar.
> …
> 4000-4499–level courses are advanced bridge lectures open to undergraduate and graduate
> students. …
> 4500-4999–level courses are advanced bridge seminars open to undergraduate and graduate
> students. As with undergraduate seminars, these courses require an application.

**Proposed rule:**

```ts
{
  kind: "attested",
  note: "Two art history seminars. The Bulletin numbers seminars at the 3000 level and at 4500–4999 — the 4000–4499 band in between is advanced bridge *lectures*, which do not count. There is no single number rule that picks out both seminar bands and skips the lectures between them, so this is not checked automatically. The Majors Colloquium and the Senior Thesis Seminar are their own requirements and are not among the two. Every seminar needs an application submitted through Vergil during the first week of registration.",
}
```

**Why `attested`, with the reasoning stated in full because this one looks encodable and is not.**

Art History states its seminar band more cleanly than History does — no "some summer courses at the
3000 level are lectures" caveat, and no "in your specialization" clause. So the first instinct is
`n_matching { n: 2, select: { subjects: ["AHIS"], numberRange: [3000, 3999] } }`. That is wrong,
and the Bulletin's own current course listings prove it. The Fall 2026 section headed
**"Fall 2026 Undergraduate and Bridge Seminars"** contains:

> AHIS UN3326 · AHIS UN3410 · AHIS UN3413 · AHIS UN3708 · **AHIS GU4505** · **AHIS GU4535** ·
> **AHIS GU4559** · **AHIS GU4646** · **AHIS GU4722** · **AHIS GU4841**  (all 4.00 points)

and the section headed **"Fall 2026 Undergraduate and Bridge Lectures"** contains
`AHIS GU4017`, `AHIS GU4062`, `AHIS GU4074`. **Six of the ten seminars actually offered that term
are in the 4500–4999 band, and there are 4000-level lectures sitting immediately below them.**

`CourseSelector` has one `numberRange`. `[3000, 3999]` misses more than half the seminars a student
can take. `[3000, 4999]` sweeps in the bridge lectures and marks the requirement satisfied by two
courses the department will not accept. `include` takes explicit codes, so the 4500-band would have
to be enumerated by hand from a list that turns over every term. **The rule language genuinely
cannot express this requirement**, and that is the whole reason `attested` exists.

The band goes in the note, where it does the student's checking for them without doing it wrong —
the same call `cc-major-history` made, reached by a different route.

**Two further reasons the naive selector would over-count**, worth recording because they survive
even if the band problem were solved: the `AHIS` 3000 band in our catalog holds
`AHIS UN3999` Supervised Individual Research and `AHIS BC3099` Independent Study — and the
Bulletin says *"Independent studies typically count toward lecture credit"* — plus three
`AHIS OC3xxx` study-abroad registrations and the six Barnard studio courses listed under group 2.

---

### 6. `studio-art` — "Studio art course"

**Bulletin, verbatim:**

> The studio art requirement can be fulfilled by any studio course in the Visual Arts Department.
> It may be taken Pass/Fail.

**Proposed rule:**

```ts
{
  kind: "n_matching",
  n: 1,
  select: { subjects: ["VIAR"], numberRange: [1000, 4999] },
}
```

**Why this one is counted when the distribution groups are not.** The Bulletin names a department,
not a designation — *"any studio course in the Visual Arts Department"* — and a department is
exactly what `subjects` expresses. Our catalog holds 111 `VIAR` courses, of which **51 fall inside
`[1000, 4999]`**: 39 `UN` (the undergraduate studio curriculum), 6 `GU` (the advanced bridge
studios) and 6 `AV` (MFA studios that happen to be numbered below 5000 — `VIAR AV2xxx`, `AV3xxx`,
`AV4501`). The remaining 60 sit at 5000 and above and are correctly excluded by the ceiling. The
overwhelming majority of the 51 are unambiguously studio: Basic Drawing, Painting I–III, Ceramics
I–II, Sculpture I–III, five printmaking courses, four photography courses, animation, moving image,
performance. Making a one-course requirement `attested` when the Bulletin states it this flatly
would be thin for no gain.

**The residual over-count, named rather than hidden:** four `VIAR` courses in the band are not
studio courses — `VIAR UN3800` Seminar in Contemporary Art Practice, `VIAR UN3900` / `UN3901`
Senior Thesis I and II, `VIAR UN3932` Independent Study. A student holding one of those and no
studio course would be told this requirement is met. It is one course out of eleven, the four codes
are named in the note, and an `exclude` list of four hand-picked codes would rot the first time
Visual Arts renumbers. Recorded as a deliberate judgement call, not an oversight. If the reviewer
disagrees, the fix is
`exclude: ["VIAR UN3800", "VIAR UN3900", "VIAR UN3901", "VIAR UN3932"]`.

**The department is more generous than the Bulletin here**, and the Bulletin wins: the department's
worksheet says *"One studio course in the visual arts **or architecture** (which may be taken
Pass/Fail)"*. The Bulletin says Visual Arts only. Architecture studios are not matched; the note
says so.

**Note for the student:**
> One studio course in the Visual Arts Department, which may be taken Pass/Fail. Any VIAR studio
> course counts — drawing, painting, ceramics, sculpture, printmaking, photography, moving image.
> VIAR UN3800 Seminar in Contemporary Art Practice, VIAR UN3900/UN3901 Senior Thesis and
> VIAR UN3932 Independent Study are matched by this rule but are not studio courses, so do not
> rely on them. The department's own worksheet also accepts an architecture studio; the Bulletin
> names Visual Arts only, so an ARCH studio is not matched here — check with the DUS.

**Catalog resolution:** `VIAR UN1000` OK (3 pt, BASIC DRAWING) · `VIAR UN2200` OK (3 pt,
CERAMICS I) · `VIAR UN2300` OK (3 pt, SCULPTURE I). The selector resolves against the 51 `VIAR`
courses in the band; the six `AV`-prefixed MFA studios among them carry no points in our catalog,
so they match the selector but are of no practical concern for a course-count rule.

---

### A group I considered and recommend leaving out

**`additional-elective-courses`** — *"any two additional elective courses in art history"*.
`cc-major-history` has an equivalent (`additional-history-courses`, `attested`) and the argument
for parity is real. I recommend against it here for the reason that file itself gives: whether a
course is "additional" depends on which of the ten the other rows already claimed, so the box means
nothing on its own — and unlike History, this major already has a countable ten-course group that
notices when a student is short. Adding it would be one more unmet attested box for a requirement
the audit already covers. Recorded so the decision is visible rather than accidental.

---

## Point arithmetic

The Bulletin publishes one range for this major: **36 to 43 points across 11 courses**. It gives no
per-course points anywhere in the requirements text. The reconciliation therefore has to be built
from the Courses tab's point values, and it closes exactly.

**Point values, from the Bulletin's own Courses tab (2026–2027):**

| Kind of course | Points | Evidence |
|---|---|---|
| Majors Colloquium `AHIS UN3000` | **4** | Courses tab: "AHIS UN3000 … 4.00 points" |
| Seminars (3000-level and 4500–4999) | **4** | Every course under "Fall 2026 / Spring 2026 Undergraduate and Bridge Seminars" is listed at 4.00 |
| Lectures (1000/2000-level and 4000–4499) | **3 or 4** | Under "Undergraduate and Bridge Lectures": `AHIS UN2321` 3.00, `AHIS UN2400` 3.00, `AHIS UN2411` 3, `AHIS UN2317` 4.00, `AHIS UN2622` 4.00, `AHIS GU4023` 4.00, `AHIS GU4110` 3.00 |
| Visual Arts studio | **3** | Every `VIAR` UN studio course in our catalog is 3 points |
| Senior Thesis Seminar `AHIS UN3002` | **3 + 3 = 6** | Bulletin: "offered as a 3-point seminar in the fall and a 3-point seminar in the spring" |

**Block-by-block sum:**

| Block | Courses | Points each | Subtotal |
|---|---|---|---|
| Majors Colloquium | 1 | 4 | 4 |
| Two seminars | 2 | 4 | 8 |
| Studio art (VIAR) | 1 | 3 | 3 |
| Three period courses + two region courses + two electives | 7 | 3 – 4 | 21 – 28 |
| **Total** | **11** | | **36 – 43** |

**Published total: 36 to 43. Reconciled, exactly, at both ends.**

**Two independent cross-checks on the same page**, because a model that fits one range could be a
coincidence and a model that fits three is not:

- **Combined Major in Art History+Visual Arts** — Bulletin: *"requires 16 total courses and can
  range from 49 to 57 points."* Composition: Colloquium 4 + seven art history courses (21–28) +
  21 points of Visual Arts studio (the department's worksheet: *"21 points in Visual Arts covering:
  VIAR UN1000 Basic Drawing (3 points); VIAR UN2200 Ceramics I or VIAR UN2300 Sculpture I
  (3 points); and five additional VIAR 3-point studio courses (15 points)"*) + one seminar (4) or a
  Visual Arts senior project (3). Minimum 4 + 21 + 21 + 3 = **49**. Maximum 4 + 28 + 21 + 4 =
  **57**. ✅
- **Major in History and Theory of Architecture** — Bulletin: *"requires 11 total courses and can
  range from 37 to 43 points."* Composition: `ARCH UN1020` (3, fixed) + Colloquium 4 + two
  seminars 8 + `AHIS UN1007` + five further art history courses. Minimum 3 + 4 + 8 + 4 + 5×3 =
  **37**. Maximum 3 + 4 + 8 + 4 + 5×4 = **43**. ✅ — and this also **derives `AHIS UN1007` at
  4 points**, which our catalog does not carry (the course has not run in a term we cover) and
  which the Bulletin never states. Both ends only close if it is 4.

**One genuine Bulletin error, found by the reconciliation and reported because it is on this page.**
The History and Theory of Architecture major's own enumeration does not sum to its own stated
total. Verbatim:

> Students must take AHIS UN1007 Introduction to the History of Architecture; ARCH UN1020
> Introduction to Architectural Design and Visual Culture; three art/architectural history courses
> covering three of four distinct historical periods; one art/architectural history course covering
> one of four distinct geographic regions; **any additional elective course** in art/architectural
> history; two art/architectural history seminars; and the Majors Colloquium.

1 + 1 + 3 + 1 + **1** + 2 + 1 = **10**, against a stated *"11 total courses"* and a stated 37-point
floor that only closes at eleven. The department's worksheet says *"The remaining **two** courses
are the student's choice"*, which makes it eleven and makes the arithmetic close. **The Bulletin's
singular "any additional elective course" is a typo for two.** This is trap 6 in its pure form — the
list's arithmetic does not match the stated total — and whoever writes
`cc-major-history-and-theory-of-architecture` needs to know before they encode one elective.

The Art History major itself has no such discrepancy: its enumeration sums to 11 and its points
close at 36–43.

---

## Not encodable

Each item verbatim, with the reason.

1. **Enrolment restrictions on the Colloquium.** *"Not open to Barnard or Continuing Education
   students. Students must receive instructors permission."* and *"Sign-up information will be
   circulated via the department listserv."* Registration eligibility, not curriculum.
2. **Enrolment restrictions on every seminar.** *"Students must submit an application to be
   considered for enrollment in a seminar."* and, from the Overview, *"Students interested in
   enrolling in any seminars at the 3000-level must submit an application for the seminar through
   Vergil during the first week of registration… The instructor of the seminar will review the
   applications and enroll accepted students directly from the Vergil wait-list."* This is the
   "by permission of the department" case the brief names.
3. **The transfer-course cap and the Colloquium's transfer prohibition.** *"No more than three
   transfer courses may be counted toward the major or the concentration. No more than one transfer
   course may be counted toward the minor."* and *"The Majors Colloquium cannot be substituted by a
   transfer course."* Transfer-credit provenance; explicitly outside the language.
4. **Residency.** *"Coursework in fulfillment of a major, minor, or concentration must be taken at
   Columbia University unless explicitly noted here and/or expressly permitted by the DUS."*
5. **"Three of four" and "two of five" distinctness.** The rule language counts courses matching a
   shape; it cannot require that the matches fall in different cells of a partition. Discussed
   under groups 3 and 4 — the reason those groups are `attested` even before the chart problem.
6. **The Field Distribution Chart itself.** *"The Art History Field Distribution Chart indicates
   which distribution requirements art history courses are eligible to fulfill."* A per-term
   departmental spreadsheet; a course carries several designations at once; not in
   `requirement_flags` and not in the Bulletin.
7. **Which Barnard courses count.** *"Many art history courses offered in the Art History
   Department at Barnard are treated as part of the available curriculum… Please refer to the
   Undergraduate Field Distribution Chart, linked from this page, to confirm which courses may
   count."* Note the "many" — not "all". Same chart, same problem.
8. **Which Summer Session courses count.** *"Courses taken in a Summer Term may be used toward
   requirements… only as articulated in the Department of Art History and Archaeology guidelines
   or by permission of the DUS."*
9. **The Senior Thesis, in every part.** It is **optional**, so it is not a group at all. Its
   entry conditions are in any case unencodable: *"Prospective thesis writers should have a GPA of
   at least 3.7 in art history courses and should have completed at least six courses counting
   toward the major requirements, preferably including at least one seminar. The DUS reviews the
   applications…"*, plus faculty sponsorship, an August proposal, and *"Prerequisites: the
   departments permission"* on `AHIS UN3002`. GPA, a course-count gate, and a departmental
   decision. The one part that touches the audit is the substitution — six points replacing one
   elective lecture — which is handled by excluding `AHIS UN3002` from group 2.
10. **The withdrawal rule.** *"If a student withdraws after the fall term, they will receive a
    P/F grade for the fall term which cannot be applied to the major."* A grading-basis rule.
11. **Departmental honors.** *"To be considered for departmental honors, students must have a GPA
    of at least 3.7 in classes for the major and have submitted a senior thesis of distinction…
    Normally, no more than ten percent of the graduating majors in the department receive
    departmental honors."* GPA and a quota.
12. **Advanced Placement.** *"The department does not grant credit for Advanced Placement or
    International Baccalaureate courses."* Worth a header sentence.
13. **Art Humanities.** *"While Art Humanities does not count toward the major, minor, or
    concentration requirements, students intending to declare one of these programs are encouraged
    to enroll in Art Humanities in their first or second year."* No exclusion is needed in the
    selector — Art Hum is `HUMA UN1121`, a different subject — but a student will ask, so it goes
    in the note.
14. **Independent study's status.** *"Students may complete an independent study project for 3
    points. Independent studies typically count toward lecture credit; exceptions may be made with
    the approval of the DUS."* "Typically" and "exceptions" are not encodable; the practical effect
    is that `AHIS UN3999` counts toward the ten but not toward the two seminars, which is why the
    seminar group is `attested`.

---

## Which file each requirement belongs on

**All six groups belong on `lib/requirements/programs/cc-major-art-history.ts` and nowhere else.**

- **The studio requirement belongs here, not on a Visual Arts program.** It is a requirement the
  Art History department imposes; `VIAR` courses have no program file of their own today, and if
  one is ever added, the studio rule must not be copied onto it. A course held in two places is
  evaluated twice and the copies can disagree — the `ECON UN1105` duplication.
- **Nothing is delegated to `cc-core`, and I checked rather than assumed.** I read the whole
  Requirements tab (all fifteen headings) and the whole Overview tab. There is no Degree Track
  table, no mathematics or science block, and the only Core interaction the page names is
  subtractive: Art Humanities does not count. The one place a delegated block *could* have hidden
  is the empty `Required Coursework for all Programs` heading, which is discussed above and which
  I am reporting as a hole rather than filling in.
- **Do not merge the three majors into one file.** `Major in Art History`,
  `Major in History and Theory of Architecture` and `Combined Major in Art History+Visual Arts`
  have different course counts, different point ranges, different region category sets (five vs
  four) and different required courses. They are three `Program` objects. Merging them would repeat
  the `cc-major-english` matriculation-year problem — two majors under one id — with three.
- **`AHIS UN1007` belongs on the HTAC file, not this one.** It is required for History and Theory
  of Architecture and is an ordinary elective for Art History. It needs no group here.

---

## Nine traps — verdict on each

1. **`sequence_choice` vs `n_of { n: 2 }`.** *Not applicable, and checked.* Nothing in this major
   is a sequence. The one thing that looks like one — the year-long Senior Thesis Seminar, fall
   plus spring — is a single course code (`AHIS UN3002`, a `YC` year-long course) taken twice, not
   two courses, and it is optional besides. The Bulletin uses the word "sequence" nowhere on the
   page.
2. **Delegated blocks nobody picked up.** *Checked; one suspicious empty heading, reported not
   filled.* `Required Coursework for all Programs` carries no content on this page while carrying
   the whole major on the Philosophy page. I read both tabs end to end and found nothing shared
   that is not already inside a per-major list. See *The one structural hole*.
3. **Footnotes.** *Zero footnote markers on the page, verified programmatically.* The requirements
   container has no `<sup>` elements, no `sc_footnotes` block, no `dl`, and — unusually — no
   `<table>` at all. The whole major is prose. There is nothing to attach and nothing to miss.
4. **"Or higher" / open-ended substitutions.** *One, recorded verbatim and not encoded:*
   *"This 6‐point year‐long seminar may substitute for a single elective lecture course."* It is
   not a course substitution in the usual sense but a two-enrolments-count-as-one rule, and it is
   handled by the `AHIS UN3002` exclusion in group 2 rather than by a rule. The department's
   *"or architecture"* widening of the studio requirement is the other one, and the Bulletin's
   narrower text governs.
5. **CourseLeaf eats labels.** *Present, and it is the page's defining feature.* The empty
   `Required Coursework for all Programs` heading is the clean case — a heading whose content was
   dropped, exactly the shape of the lost Global Core label on the SEAS core page. Two smaller
   ones: the Course Numbering Structure paragraph about seminars is split mid-sentence across two
   `<p>` elements (*"3000-level courses are seminars open to undergraduate students only.
   Seminars"* / *"are limited‐enrollment classes…"*), and the whole requirements text is wrapped in
   `docs-internal-guid-…` spans, meaning it was pasted from a Google Doc — which is also the most
   likely origin of the HTAC "any additional elective course" singular/plural error below.
6. **Reconcile the arithmetic.** *Done, closes exactly at both ends, and cross-checked twice.*
   36–43 across 11 courses, reconciled block by block; the model then independently reproduces the
   combined major's 49–57 and the HTAC major's 37–43, and in doing so derives `AHIS UN1007` at 4
   points. **It also found a real error on the page**: the HTAC major enumerates 10 courses against
   its own stated 11, and the department's worksheet confirms the Bulletin's text is the wrong one.
   See *Point arithmetic*.
7. **Duplicated requirements across files.** *Checked and stated.* See *Which file* above. The live
   risks are the two sibling majors on this page and any future Visual Arts program; both are
   named.
8. **Honors / accelerated sequences.** *Hunted for explicitly; there is none, and this matters.*
   The Senior Thesis is the only advanced track and the Bulletin says three times, in three
   paragraphs, that it is **optional**: *"The Senior Thesis is an optional project open to Art
   History, History and Theory of Architecture, and Art History+Visual Arts majors."* Encoding it
   as a requirement would fail every non-thesis major. It is not a group. The one way it touches
   the audit — six points substituting for one elective — is handled by the group 2 exclusion, and
   it is the second golden record below. There is no honors variant of the Colloquium, no
   accelerated seminar path, and no alternative to the studio course.
9. **Courses the Bulletin names that our catalog lacks.** *One, plus two data gaps, all flagged:*
   `AHIS UN3007` — named by the department worksheet as the alternative Majors Colloquium, absent
   from the Bulletin entirely and from our catalog; it is deliberately **not** encoded and the
   reason is stated. `AHIS UN1007` and `AHIS UN3000`-adjacent 1000-level codes are *in* our catalog
   but carry no points because they have not run in a term we cover — "we cannot tell", not "you
   did not take it". `AHCE W4149` is in our catalog under the id `AHCE4149W`; the Bulletin prints
   it `AHCE W4149`, which `parseBulletinCode` handles.

---

## Open questions

**Q1 — Is `AHIS UN3007` a second Majors Colloquium code?** *(affects `majors-colloquium`)*
The department's worksheet says *"The Majors Colloquium: AHIS UN3000 or AHIS UN3007"* in all three
of its major checklists. The Bulletin names only `AHIS UN3000`, in its Requirements tab, its
Overview tab and its Courses tab. `AHIS UN3007` is not in our catalog. I encoded `AHIS UN3000`
alone. **What would resolve it:** the department's live course listing, or one email to the
Undergraduate Program Coordinator. **If confirmed**, the change is
`{ kind: "n_of", n: 1, courses: ["AHIS UN3000", "AHIS UN3007"] }` and a note that `AHIS UN3007`
will not resolve against our catalog.

**Q2 — Which Barnard `AHIS BC` courses count toward the ten?** *(affects
`ten-art-history-courses`, the only counted art history group)*
The Bulletin says *"**Many** art history courses offered in the Art History Department at Barnard
are treated as part of the available curriculum"* and points at the Field Distribution Chart —
"many", not "all". Six `AHIS BC` courses in our catalog are plainly studio, not art history
(`BC3002`, `BC3003`, `BC3004`, `BC3530`, `BC3531`, `BC3867`), and my selector counts them. **What
would resolve it:** the Field Distribution Chart, which is the blocker described at the top of this
dossier — a published Google Sheet that now returns 401 with no archived copy. **Interim
recommendation:** leave the selector as written and carry the six codes in the note, because
`exclude`-ing them by hand encodes a snapshot of a Barnard catalogue that turns over. Revisit when
the chart is readable.

**Q3 — Is the empty `Required Coursework for all Programs` heading a lost block?**
See *The one structural hole*. **What would resolve it:** the 2025–2026 Bulletin edition, or the
next edition, or the department. **Impact if it turns out to be lost:** unknown by definition,
which is exactly why it is recorded rather than assumed away.

**Q4 — Does the studio requirement accept an architecture studio?**
The Bulletin says *"any studio course in the Visual Arts Department"*; the department's worksheet
says *"One studio course in the visual arts or architecture"*. The Bulletin governs and `ARCH` is
not matched. **What would resolve it:** the DUS. **If confirmed**, the change is
`subjects: ["VIAR", "ARCH"]` — but note that `ARCH` carries 243 courses in our catalog, of which
216 are graduate `A`-prefixed studio and seminar courses, so the ceiling `[1000, 4999]` becomes
essential rather than merely tidy.

**Q5 — the department's live website could not be read.** `arthistory.columbia.edu` sits behind a
Cloudflare interstitial returning 403 to every route tried (direct, browser user-agent, WebFetch,
`r.jina.ai`). My secondary source is the **Wayback capture of 2026-07-06** for the requirement
worksheet and **2026-08-15** for the chart's landing page — both recent, both within this Bulletin
edition, and both quoted above with their capture dates. This is why Q1 and Q2 are open rather
than answered.

---

## Proposed golden records

Written by hand from the Bulletin text quoted above. None was computed from the evaluator.

### 1. `arthist-complete` — the control

```
who:       Art History major who finished the major the ordinary way: Colloquium, two
           seminars, seven lecture/elective courses, one studio course.
programId: cc-major-art-history
taken:     AHIS UN3000,                                   // Majors Colloquium (4)
           AHIS UN3410, AHIS UN3444,                      // two seminars (4 + 4)
           AHIS UN2109, AHIS UN2315, AHIS UN2400,         // three period courses (3+3+3)
           AHIS UN2602, AHIS UN2622,                      // two region courses (3+4)
           AHIS UN1007, AHIS GU4062,                      // two electives (4+3)
           VIAR UN1000                                    // studio (3)
expect:
  majors-colloquium:          { status: "satisfied" }
  ten-art-history-courses:    { status: "satisfied", completed: 10, required: 10 }
  studio-art:                 { status: "satisfied", completed: 1,  required: 1 }
```

Eleven courses; ten of them `AHIS`, one `VIAR`. Hand-summed points: 4 + 4 + 4 + 3 + 3 + 3 + 3 + 4 +
4 + 3 + 3 = **38**, inside the published 36–43. The three distribution groups are `attested` and
correctly report `unmet` unless the fixture ticks them; the record should leave them unticked so
the audit visibly still owes three boxes.

### 2. `arthist-thesis-writer` — the edge case, and the one that matters

```
who:       Art History major writing a senior thesis. Their record carries AHIS UN3002
           twice — the fall half and the spring half of the year-long seminar — and the
           Bulletin says the whole six points substitute for ONE elective lecture.
programId: cc-major-art-history
taken:     AHIS UN3000,
           AHIS UN3410, AHIS UN3444,
           AHIS UN2109, AHIS UN2315, AHIS UN2400,
           AHIS UN2602, AHIS UN2622,
           AHIS UN1007,                                   // nine AHIS courses so far
           AHIS UN3002, AHIS UN3002,                      // fall + spring thesis seminar
           VIAR UN1000
expect:
  ten-art-history-courses:    { status: "in_progress", completed: 9, required: 10 }
  majors-colloquium:          { status: "satisfied" }
  studio-art:                 { status: "satisfied" }
```

**Why it is the important one.** Without `exclude: ["AHIS UN3002"]` this student reads **11 of 10**
— the two thesis enrolments counted as two courses when the Bulletin says they substitute for one.
The audit would tell a student who is one elective short that they are finished, which is the
add/drop-deadline failure. With the exclusion they read 9 of 10, one short, and the note explains
why; they go to the DUS, who confirms the substitution. Under-count over over-count, and this
record is what makes the choice enforceable.

**Fixture note:** the two `AHIS UN3002` entries need distinct `termCode` values (a fall and a
spring) so the record reads as one year-long enrolment rather than a duplicated row, and so that a
future reader does not "clean up" what looks like a typo.

### 3. `arthist-graduate-courses` — the ceiling

```
who:       Art History major padding their count with the department's graduate seminars,
           which the Bulletin's numbering section does not describe and the major does not
           accept.
programId: cc-major-art-history
taken:     AHIS UN3000,
           AHIS UN2109, AHIS UN2315, AHIS UN2400,
           AHIS GR6650, AHIS GR8010, AHIS GR8025, AHIS GR8033, AHIS GR8040,
           AHIS GR8055, AHIS GR8060,
           VIAR UN1000
expect:
  ten-art-history-courses:    { status: "in_progress", completed: 4, required: 10 }
  majors-colloquium:          { status: "satisfied" }
  studio-art:                 { status: "satisfied" }
```

**Why.** Our catalog carries **67 `AHIS` courses at 5000 and above** — 51 of them at 8000-level.
Subject alone would score this student 11 of 10 on the strength of seven doctoral seminars. Only
the `numberRange` ceiling stops it, and this is the only record that tests it. It is the same bug
`cc-major-english` shipped with `CLEN 6475` and `CLEN 6511`, transplanted to a department whose
graduate catalogue is five times larger. Use whichever `AHIS GR8xxx` codes are live when the record
is written; the point is the band, not the codes.

---

## Sources

**Primary — Columbia Bulletin, 2026–2027 edition:**
- Art History and Archaeology, Requirements tab (all six groups, the numbering structure, all
  three majors):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/art-history-archaeology/#requirementstextcontainer`
- Art History and Archaeology, Overview tab (the `AHIS UN3000` code, the senior thesis, the
  Barnard and transfer rules, Art Humanities, honors, AP, the chart link):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/art-history-archaeology/#textcontainer`
- Art History and Archaeology, Courses tab (all point values, the seminar/lecture split that
  decides group 5, the `AHIS UN3000` and `AHIS UN3002` restrictions):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/art-history-archaeology/#coursestextcontainer`
- Archaeology (the separate interdepartmental major, confirming this dossier's scope):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/archaeology/`
- Columbia College departments index (confirming Art History and Archaeology and Archaeology are
  two distinct Bulletin programs):
  `https://bulletin.columbia.edu/columbia-college/departments-instruction/`

**Secondary — department, and where it disagrees:**
- *Major and Minor Course Requirements*, Department of Art History & Archaeology — read via
  Wayback capture **2026-07-06**, because the live site returns Cloudflare 403:
  `http://web.archive.org/web/20260706204134/https://arthistory.columbia.edu/content/major-and-minor-course-requirements`
  Supplies the eleventh HTAC course that the Bulletin's own enumeration drops; supplies
  `AHIS UN3007`; widens the studio requirement to "visual arts or architecture". **Trusted for the
  HTAC arithmetic** (where it agrees with the Bulletin's own stated total against the Bulletin's own
  list, so it is resolving an internal contradiction rather than overriding the Bulletin) and **not
  trusted for `AHIS UN3007` or the architecture studio**, where it adds something the Bulletin does
  not say.
- *Which Requirements Do My Art History Courses Fulfill?* — Wayback capture **2026-08-15**:
  `http://web.archive.org/web/20260815132446/https://arthistory.columbia.edu/content/which-requirements-do-my-art-history-courses-fulfill`
- *Art History Field Distribution Chart* — **unreadable.** Published Google Sheet at
  `docs.google.com/spreadsheets/d/e/2PACX-1vS8CPCNeYqPiDe6n2gFj4dSJGYyv1kNyUHwAieU40zC7LNx5CcHiIqXQpoDqo60Vg/pubhtml?gid=1088936380`;
  returns HTTP 401 on `pubhtml`, on `pub?output=csv`, with and without `gid`, and has no Wayback
  capture. This is blocker (a) and the reason this dossier is 8/10.

**Repo:** `lib/requirements/types.ts`, `evaluate.ts`, `selector.ts`, `vacuity.test.ts`,
`golden.ts`, `programs/seas-core.ts`, `programs/seas-major-mechanical-engineering.ts`,
`programs/cc-major-economics.ts`, `programs/cc-major-english.ts`, `programs/cc-major-history.ts`,
`programs/cc-major-psychology.ts`. Catalog checked with `scripts/dump-program.ts` for shape and a
throwaway Supabase query for the individual codes and subject bands (removed).
