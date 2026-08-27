# Onboarding: degree changes must recalibrate the guess deck

**Status:** implemented — see §8 for what the work actually found
**Branch:** `fix-courses-recalibrate`
**Reported symptom:** "During onboarding, when we go back and change our year or major or school, the suggested courses we've taken don't change — they need to recalibrate." Specifically: **the top pre-checked chips stay.**

---

## 1. What is already built

`reconcileDegreeChange` (`lib/onboarding/state.ts:554`) exists and is wired through a single funnel:

```
components/onboarding/onboarding-flow.tsx:402
  updateDegree = (produce) =>
    updateOnboardingState((current) => reconcileDegreeChange(current, produce(current)))
```

All four degree controls route through it — `patch` (school, class year, custom major), `toggleProgram`, `toggleMinor`, `toggleNoMinors`. On a changed `degreeSignature` it drops every course where `isStudentAsserted` is false, i.e. `source === "onboarding_guess" && liked === null`, and resets `confirmationsSinceRerank`.

**So "no recalibration code exists" is not the problem.** The investigation below is about why the screen still looks frozen.

---

## 2. Root-cause candidates found by reading

Four distinct findings. They are not alternatives — several are probably true at once.

### 2.1 Tier 1 is Core-dominated — the leading explanation for the reported symptom

`programsFor` (`lib/profile/audit.ts:56`) **always prepends the school's Core**:

> "The Core is resolved from their school rather than picked, because a Columbia College student cannot elect out of the Core."

Tier 1 is `required && level <= ceiling && !withheld` (`lib/onboarding/guess.ts:528`), and the Core's `all_of` rules are the largest block of *required, low-level* courses a student has. So on a **same-school major switch (CC CS → CC Econ)** tier 1 barely moves: the pre-checked chips are Core courses that are still genuinely required.

The data recalibrates correctly. The screen looks frozen because the visible part of tier 1 is the part that legitimately did not change.

**Decision (§4): do not add UI to explain this.** Fix the data; if the Core chips are right, they stay.

### 2.2 `implied_by` bypasses every tier-1 guard

```js
// lib/onboarding/guess.ts:528
const tier = isImplied || (required && level <= ceiling && !withheldIds.has(courseId)) ? 1 : 2;
```

`isImplied` short-circuits the level ceiling **and** the withheld check. Prereqs pulled from surviving confirmations are pre-checked regardless of the new degree. Intentional (the comment defends it), but it means a set of tier-1 chips can persist across a degree change with no relationship to the new degree.

### 2.3 Deck-cache key drifts from the degree signature

| field | `degreeSignature` (`state.ts:488`) | `guessDeckCacheKey` (`guess-cache.ts:15`) |
|---|---|---|
| `school` | yes | yes |
| `classYear` | yes | yes |
| `programIds` (declared, sorted) | yes | yes |
| `customMajor` | **yes** | **no** |
| `courses` | no | yes |
| `dismissedCourseIds` | no | yes |

Two hazards:

1. **`customMajor` drift.** A change to the free-text major changes the signature but not the cache key. When `reconcileDegreeChange` happens to drop nothing (`state.ts:561` early-returns when `courses.length` is unchanged), the key is identical and a deck cached under the *other* major text is served.
2. **Unguarded cache write.** `prefetchGuessDeck` guards its write with `if (inflight?.key !== key) return result;` (`guess-cache.ts:54`). `loadGuessDeckCached` has **no such guard** (`guess-cache.ts:78-82`) — it sets `cached` and nulls `inflight` unconditionally. A slow in-flight request for an old key can land after a newer one and install a stale deck under its own key.

### 2.4 Provenance collapse — a strip tap is indistinguishable from a pre-check

`step-coursework.tsx:425` — tapping a strip chip calls `confirm(toGuestCourse(candidate))`, and `toGuestCourse` (`:485`) hardcodes `source: "onboarding_guess"`. Identical to what `applyDeck` writes for auto-pre-checked tier 1.

So `isStudentAsserted` cannot tell "we ticked this for you" from "you deliberately pressed this chip", and **a degree change silently erases deliberate taps.** This is the same defect as the reported one, seen from the other side: the predicate is too coarse in both directions.

`customMajor` is separately **completely inert** — `toAuditProfile` (`lib/onboarding/server.ts:171`) passes only `declaredProgramIds`, so free text never reaches `programsFor` or the deck. **Out of scope** (§4).

---

## 3. How prereq pulling works (reference — three separate mechanisms)

Established during the interview; the fix depends on knowing these are distinct.

**A. Server, from confirmations → tier 1, pre-checked.**
`impliedPrerequisites(confirmedIds, prereqs)` (`guess.ts:346`). Walks the chain through **unambiguous** links only — `unambiguousPrereqsOf` keeps a prereq only when the requirement names exactly one course (`choice.length === 1`). "W3134 requires W1004 **or** W1007" is ambiguous and is not pulled; "UN1102 requires UN1101" is. Noted `kind: "implied_by"`, `required: true` → tier 1 via the bypass in §2.2 → written onto the record by `applyDeck`.

**B. Server, from anything else plausible → tier 2, unchecked.**
Same chain walk over the whole evidence map (`guess.ts:422-427`), noted `kind: "typical"`, `required: false`.

**C. Client, on tap → immediate, no round trip.**
`collectImplied` (`step-coursework.tsx:297`) BFS over the deck's precomputed `impliesTaken` map. Writes the whole chain onto the record instantly as `source: "onboarding_guess"`.

The chain is transitive and depth-unbounded. Because C stamps `onboarding_guess`, one tap on a 4000-level course can deposit several courses that are all indistinguishable from invented guesses.

---

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Strip taps must survive a degree change.** Give a deliberately-pressed chip its own provenance. | Erasing a course the student pressed on purpose is the same bug wearing the other face. Explicitly kept in scope over the "minimal" option. |
| D2 | **A `liked` guess survives a degree change.** Keep current behavior, no warning, no re-surfacing. | Rating a course implies taking it. `liked === true` is an active tap; `null` (the default for un-tapped chips on the love screen) is not. The existing rule is correct. |
| D3 | **Retire prereq pulls with everything else; let the rebuilt deck re-add them.** No `pulledBy` field, no cascade tracking. | Mechanism A re-derives the prereqs of every *surviving* confirmation on the next deck build, so they come straight back. Self-correcting with no schema change. |
| D4 | **Reconcile at answer time.** Keep `reconcileDegreeChange` inside the degree write. | Current shape; the funnel comment at `onboarding-flow.tsx:392` already defends it. |
| D5 | **Plus a mount-time signature check** ("belt and braces"). | Closes the whole class of bug — a fifth degree control added later that bypasses `updateDegree` cannot silently reintroduce a stale deck. |
| D6 | **No new UI to explain recalibration.** No grouping by Core-vs-major, no toast. | "If the courses are right, the screen is right." Don't add chrome to explain a correct answer. |
| D7 | **`customMajor` stays fully inert. Out of scope.** | Explicitly deferred. Note as a known gap; no code change, including no cache-key change on its account. |
| D8 | **Find the actual break before hardening.** Reproduction matrix is deliverable #1. | The school-switch path has not been tested. Whether it fails determines whether this is a state bug or purely the Core-dominance effect of §2.1. |

---

## 5. Work

### Phase 1 — Reproduction matrix (blocking; do this first)

A test that, for each degree control, walks **forward → back → change → forward** and asserts the deck materially differs.

| Path | Change | Must observably change |
|---|---|---|
| School | CC → SEAS | Tier 1 swaps Core entirely (Lit Hum/CC block → University Writing + Art of Engineering + Calc/Physics). `typical.ts:44` proves these sets are disjoint. |
| Class year | 2028 → 2026 | `expectedLevelCeiling` rises (`guess.ts:110`), tier 1 grows. 2028 → 2029 lowers it and tier 1 must shrink. |
| Major | CC CS → CC Econ | Tier 1's **non-Core** portion swaps. Assert on the subset whose `reasons` carry `required_by` with a non-Core `programName` — asserting on the whole of tier 1 will fail for the reason in §2.1 and would be a wrong test. |
| Minor | add / remove | Named courses of the minor appear / disappear. |

Run each path twice: once with an empty record, once after the student has confirmed a few courses by search (student-asserted, must survive).

`lib/onboarding/onboarding.test.ts:480-584` already covers `reconcileDegreeChange` as a pure function. This matrix covers the **integration** — reducer → cache key → deck build — which is where the reported bug lives.

**Gate: if the school switch also fails, stop and diagnose.** That would mean reconcile is not firing or the cache is serving stale, and the fix is different from everything below.

### Phase 2 — Provenance split (D1)

- Add `onboarding_confirm` to `ONBOARDING_COURSE_SOURCES` (`lib/onboarding/state.ts:170`).
- New migration `0036_*.sql`: drop and re-add `student_courses_source_check` with the new value alongside `picker`, `transcript_paste`, `transcript_pdf`, `plan`, `onboarding_guess` (pattern at `supabase/migrations/0032_recommendation_profile.sql:54`).
- `step-coursework.tsx`: the strip's `onPress` (`:425`) stamps `onboarding_confirm`. `applyDeck`'s auto-write (`:225`) keeps `onboarding_guess`. `collectImplied`'s pulls (`:299`) keep `onboarding_guess` per D3.
- `isStudentAsserted` (`state.ts:544`) needs no edit — `source !== "onboarding_guess"` already admits the new value. Add a test that pins this, because the predicate's correctness now depends on the new source being spelled right.
- Check `lib/onboarding/migrate.ts` and `lib/profile/types.ts` for anything that switches on `source` and would drop or mislabel the new value. The `state.ts:163` header notes `lib/profile/types.ts`'s union is deliberately narrower and the DB constraint is the real contract — respect that boundary rather than widening another lane's file.

### Phase 3 — Cache correctness (§2.3)

- Guard the write in `loadGuessDeckCached` the way `prefetchGuessDeck` already guards its own (`guess-cache.ts:54` vs `:78`): only install `cached` and clear `inflight` when `inflight?.key === key`.
- Add a regression test: start a slow fetch for key A, start and resolve a fetch for key B, resolve A, assert `peekCachedGuessDeck` for B still returns B's deck.
- **Do not** add `customMajor` to the cache key — D7 keeps it inert, and adding it there without making it affect the deck would key on something that provably cannot change the result.

### Phase 4 — Mount-time signature check (D5)

- The deck carries the degree signature it was built from. Simplest shape: `GuessDeck` gains a `builtFor: string` field set by `buildGuessDeck` from the same inputs `degreeSignature` reads, or `loadGuessDeck` stamps `degreeSignature(state)` onto the returned deck.
- `StepCoursework` compares `deck.builtFor` against `degreeSignature(state)` on mount and after each commit; on mismatch it bumps `rerankToken` and ignores the warm-deck skip at `step-coursework.tsx:242`.
- This must not fight `paintedWarmDeckRef`. The existing skip exists so that writing tier 1 (which changes the cache key via `courses`) does not immediately force a second ranking pass. A signature check is orthogonal — it keys on the *degree*, which tier-1 writes never touch — so the two conditions compose rather than conflict. Pin that with a test: confirming a course must not trigger a rebuild.

### Phase 5 — Verify

- Re-run the Phase 1 matrix; every path must now pass.
- Manual walk on a dev server: CC/2028/CS → coursework → back ×3 → SEAS → forward. Confirm the Core block visibly swaps.
- Manual walk for D1: tap three strip chips, back, change major, forward. **The three tapped courses must still be on the record**; the auto-pre-checked ones must be gone.

---

## 6. Explicitly out of scope

- `customMajor` doing anything at all (D7). Known gap: the "Other" box is a dead input as far as the deck is concerned.
- Any UI signalling that recalibration happened (D6).
- Relaxing the `implied_by` tier-1 bypass (§2.2). Noted as a follow-up: it can pre-check a course above the student's level ceiling on the strength of a single tap. Not this bug.
- Making the tier-2 strip more major-sensitive. `typical.ts` is school+year driven by design and its header defends that.

---

## 7. Acceptance criteria

1. Changing **school** and returning to coursework replaces the pre-checked Core block with the new school's.
2. Changing **class year** raises or lowers the level ceiling and the pre-checked set changes accordingly.
3. Changing **major** replaces the non-Core portion of the pre-checked set; Core chips correctly persist.
4. A course added via **search** or **transcript import** survives every degree change.
5. A course added by **tapping a strip chip** survives every degree change. *(new — D1)*
6. A course we **auto-pre-checked** and the student never touched does not survive a degree change.
7. A course marked **`liked === true`** survives a degree change. *(D2)*
8. A course the student **removed** stays removed across a degree change — `dismissedCourseIds` is untouched by reconcile (`state.ts:548`).
9. Confirming a course does **not** trigger a deck rebuild outside the existing `RERANK_BATCH_SIZE` cadence.
10. No stale deck can be served after a concurrent fetch resolves out of order.

---

## 8. What the implementation found

### 8.1 Phase 1 gate: the pure path was already correct

`lib/onboarding/recalibrate.test.ts` — the reproduction matrix — **passed on every row without any production change**. School, class year, major, and minor each rebuild the deck correctly; student-asserted courses survive; refusals persist.

So the reducer was never the bug. That moved the cache and the client wiring from "belt and braces" to the actual suspects, and it is why §2.3 became the fix rather than a footnote.

Two things the matrix had to be corrected about before it could be trusted, both recorded in the file:

- **`buildGuessDeck` skips confirmed courses.** Re-deriving a deck from a state whose tier 1 is already on the record returns an *empty* tier 1. That is correct behaviour, and comparing a remembered deck against a re-derived one reads as a total wipe. The harness now returns the deck that actually landed alongside the state it produced.
- **`ENGL CC1010` (University Writing) is required by both Cores.** "No College Core course survives a switch to SEAS" is the wrong assertion; the test asserts on *College-only* Core courses, computed as a set difference via `namedCoursesOf`.

And one finding that looks like a bug and is not: **2028 → 2027 lifts the level ceiling from 3000 to 4000 and changes tier 1 not at all**, because every 4000-level course CC Computer Science names is an `n_of` elective and only *required* courses reach tier 1. The ceiling binds between 2029 and 2028 (8 chips → 12). The test uses that pair and says why.

### 8.2 The real defect: an unguarded cache write

`loadGuessDeckCached` installed its result unconditionally. `prefetchGuessDeck` has always guarded its own write. The two share `inflight`, and that asymmetry produced **two** failures, both now pinned in `lib/onboarding/guess-cache.test.ts` (they failed before the fix, pass after):

1. A stale request landing last **overwrote the current degree's deck**.
2. Worse: it cleared `inflight` unconditionally — the very flag `prefetchGuessDeck` reads to decide whether its own result is still wanted. A prefetch that had **completed correctly** then concluded it was stale and discarded its deck, so the coursework screen the prefetch existed to warm opened on the skeleton instead.

The guards are only correct together; each reads state the other maintains.

### 8.3 Out-of-scope findings, recorded rather than fixed

- **`lib/db/student-profile.ts:52`** — `toSource()` coerces any value outside `["picker","transcript_paste","transcript_pdf","plan"]` to `"picker"`. Both `onboarding_guess` and `onboarding_confirm` therefore read back from the database as "Added by hand" on the profile screen. Pre-existing for `onboarding_guess`; the new value inherits it exactly, so this is not a regression. Fixing it means widening `CourseSource` in `lib/profile/types.ts`, which the state module's own header says belongs to another lane.
- **Tier 1 cannot tell first-year Core from sophomore Core.** `COCI CC1101` (Contemporary Civilization, a sophomore course) and `HUMA CC1001` (Lit Hum, first-year) are both 1000-level, so the level ceiling admits both for a first-year. `typical.ts` has `afterYears` banding that expresses exactly this distinction, but it only feeds tier 2. A first-year currently arrives with Contemporary Civilization pre-checked.
- The `implied_by` tier-1 bypass (§2.2) is unchanged.

### 8.4 Files

| File | Change |
|---|---|
| `lib/onboarding/recalibrate.test.ts` | new — reproduction matrix, provenance, signature stability |
| `lib/onboarding/guess-cache.test.ts` | new — cache semantics and both race regressions |
| `lib/onboarding/guess-cache.ts` | guarded the write in `loadGuessDeckCached`; added `clearGuessDeckCache` |
| `lib/onboarding/state.ts` | added `onboarding_confirm`; documented `isStudentAsserted`'s negation |
| `lib/onboarding/store.ts` | `restartOnboarding` clears the deck cache |
| `components/onboarding/step-coursework.tsx` | strip taps write `onboarding_confirm`; mount-time degree-signature rebuild |
| `supabase/migrations/0036_onboarding_confirm_source.sql` | new — widened `student_courses_source_check` |

**Migration 0036 was applied to production before the code ships**, and the constraint verified. This ordering is not optional: the sign-in migration RPC (`0033`) passes `source` straight through with no allow-list, so a client writing `onboarding_confirm` against the old constraint would abort the whole transaction and lose the student's entire onboarding session.

### 8.5 End-to-end browser evidence

Walked on a dev server against a headless Chrome, guest (signed-out) flow, `localStorage` cleared first.

**A — arrive as Columbia College / 2028 / Computer Science.** Nine pre-checked chips: seven Core (`COCI CC1101`, `COCI CC1102`, `ENGL CC1010`, `HUMA CC1001`, `HUMA CC1002`, `HUMA UN1121`, `HUMA UN1123`) and two major (`COMS W3203`, `CSEE W3827`).

**B — deliberately tap two strip chips** (`COMS W1004`, `COMS W1007`). They land as `onboarding_confirm`; the nine auto-pre-checked chips remain `onboarding_guess`. **The provenance split is visible on the record**, which is the whole point of D1.

**C — step back and switch to Columbia Engineering.** The record immediately becomes:

```
{"step":"school","school":"SEAS","programs":[],
 "courses":["COMS W1004[onboarding_confirm]","COMS W1007[onboarding_confirm]"]}
```

All nine guesses retired. Both deliberate taps survived. This is D1 and the reported bug, both satisfied in one transition.

**D — arrive on coursework for the new degree.** Seven pre-checked chips, and the deck is genuinely a SEAS deck: `ENGI E1102`, `ENGI E1006`, `MATH UN1101`, `ECON UN1105`, plus `ENGL CC1010` — the one Core course both schools require (§8.1) — and the two carried taps.

```
dropped from the CC deck : COCI CC1101, COCI CC1102, HUMA CC1001, HUMA CC1002,
                           HUMA UN1121, HUMA UN1123, COMS W3203, CSEE W3827
added by the SEAS deck   : ENGI E1102, ENGI E1006, MATH UN1101, ECON UN1105
deck actually changed    : true
deliberate taps survived : COMS W1004, COMS W1007
```

Eight of nine chips replaced. The lone survivor is the course that is genuinely required by both.

One thing the walk turned up that is **not** a bug: re-selecting an already-selected class year clears it (`step-degree.tsx:250` — `classYear === year ? null : year`). That is a deliberate toggle, and `null` is a supported answer with its own "not sure" chip at `:257`.
