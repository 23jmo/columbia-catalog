# Columbia Catalog — blockers & decisions log

Things that need Johnathan's attention. Appended as they come up; nothing here
blocks the build unless marked **BLOCKING**.

## Decisions taken (2026-08-23)

| Decision | Choice |
|---|---|
| Supabase org | `dbsmahstbdkeqoskeqwd` (may pause/archive/delete `flutterli-mvp`) |
| Crawl scope | Fall 2026 (`20263`) + Spring 2027 (`20271`), all ~900 subjects |
| Reviews | Build pipeline, ship with no review data |
| Email | Resend |
| Region | `us-east-1` — Columbia is in NY; matches Vercel `iad1` default |

## Open items

### 1. Supabase MCP is signed into the wrong account
The `claude_ai_Supabase` MCP connector authenticates to org `twzkmnnlskfzaijujvnv`
(projects: tabby, LinkedIn Semantic Search, TASA Spotted). Your Supabase **CLI**
is signed into the account holding `dbsmahstbdkeqoskeqwd`. Using the CLI for all
provisioning. If you want the MCP connector usable for this project later,
re-auth it against the same account.

### 2. Resend needs an API key + verified domain
`RESEND_API_KEY` and a verified sending domain are required before seat alerts
actually deliver. The alert sweep and templates will be built and tested against
a dry-run transport; flipping to live delivery is a one-env-var change.

### 3. Reviews have no credentials
Per your call: pipeline only, no data. Rating filters ship with "include
unrated" defaulted ON so unreviewed courses never vanish. To turn data on later:
- CULPA — needs a partnership (spec §12 explicitly prefers this over scraping)
- Reddit — needs `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT`
- Claude extraction — needs `ANTHROPIC_API_KEY` (heuristic extractor is default)

### 4. RESOLVED — registration milestones are in, from the bulletin
`registration_milestones` holds 19 rows: 11 for Fall 2026, 8 for Spring 2027,
ingested through the normal crawl lane (job → parse → quarantine →
`ingest_academic_calendar`), not seeded by hand.

**What was actually blocking.** Nothing about the data. This was recorded as
"registrar.columbia.edu returns 403 / is behind a Cloudflare challenge", which
was true and stayed true — that host is still not fetched, and the bot
challenge is still not evaded. But the requirement was never "fetch that URL",
it was "know when registration opens", and Columbia publishes those dates in
more than one place. `bulletin.columbia.edu/columbia-college/academic-calendar/`
answers a plain request with the full 2026-2027 calendar, and the crawler
already talks to that host.

That makes three blockers in a row (#12, #17, this one) filed against a
specific tool or URL rather than against the information being sought. The
question that unstuck all three: *what do I actually need to know, and who
else knows it?*

**What it took.** The bulletin uses a third layout — a three-column
Month / Day / Event grid — with three traps worth naming, each now covered by
a contract test against the captured page:

1. **The month is sticky.** It is printed once per month and left blank on
   every row after it, so a row read on its own is a bare day number with no
   month. That parses as nothing, so the failure would have been an empty
   table rather than a wrong one.
2. **Headings name two seasons.** The August table is titled "Late Summer
   Dates and Deadlines related to the Fall 2026 term" — first-season plus
   first-year reads that as Summer 2026 and files every Fall registration date
   under a term outside the crawl scope.
3. **Rows mention terms they are not about.** "End of Change of Program
   period ... Last day to uncover letter grade for Fall 2026 course" is a
   *Spring* deadline. Only registration states its own term unambiguously, so
   only registration re-attributes; everything else takes the heading's term.

**What it unlocked beyond the annotations.** The calendar also names the first
and last day of instruction, so `terms.starts_on` / `ends_on` are populated for
both live terms (Fall 2026: Sep 8 – Dec 14; Spring 2027: Jan 19 – May 3). Those
had been null since the schema was written, which meant `.ics` export fell back
to a per-season month/day shape — Fall opening September 2 against a real
September 8 (a phantom first week of meetings) and Spring opening January 20
against a real January 19 (a dropped first Tuesday).

**Still open, smaller:** the 30-second registration tier reads
`RegistrationWindow[]`, and nothing yet loads those from
`registration_milestones` into the scheduler — the windows exist in the
database but the escalation path is not wired to them. Watched subjects run on
the 2-minute hot tier meanwhile, which is the same documented degradation as
before, now for a narrower reason.

---

## 5. BLOCKING (product) — Columbia removed meeting times from the public directory

**Status: confirmed by fetching the pages. This changes what the schedule
builder can be for the terms you picked.**

Every Fall 2026 subject page and every Fall 2026 section detail page now says:

> NOTE: Students, Instructors, and Staff should use Vergil Course Search …
> **Class meeting days, times and classroom assignments are now only appearing
> in Vergil.**

and where the day/time used to be printed there is now a link:

> Day, Time & Location — *View Class Schedule & Location in Vergil*

I found the cutoff by fetching COMS for each term and counting `Day/Time:` rows:

| Term | Public day/time? |
|---|---|
| Spring 2024 (20241) | yes |
| Fall 2024 (20243) | yes |
| Spring 2025 (20251) | yes — **last term that has them** |
| Fall 2025 (20253) | no |
| Spring 2026 (20261) | no |
| Summer 2026 (20262) | no |
| **Fall 2026 (20263)** | **no** |
| **Spring 2027 (20271)** | no (not yet published at all) |

Everything else on the page is intact and ingesting correctly — call number,
enrollment count, cap, "as of" timestamp, instructor, points, description,
grading mode, method of instruction, department, division. Seat tracking, seat
history, alerts, search, and the whole provenance story are unaffected. The
first real COMS ingest wrote 155 sections with correct seat counts and correct
`source_as_of` values, and 0 meetings.

**What this breaks (spec §8, §9, §14):** the schedule grid has nothing to place,
conflict detection has nothing to compare, the campus map has no rooms to route
between, inter-campus commute warnings cannot fire, and `.ics` export has no
events. The parser and the `meetings` table are correct and populate fine for
2025-and-earlier terms — the data simply is not published any more.

Vergil is the only current source and it is behind UNI login. Spec §2 forbids
storing a Vergil/SAS bearer token, so I have not attempted it.

**Options, in the order I would pick them:**

1. **Historical inference, labelled as such** (my recommendation, and it fits
   the product's existing discipline). Crawl 20251/20243/20241, and when a
   course has no current meeting time, show the most recent term it did:
   *"typically meets TR 11:40–12:55 · from Spring 2025, not confirmed for Fall
   2026."* Never presented as fact, never used for a hard conflict error — a
   soft "these usually overlap" warning instead. This is the same rule already
   applied to seat counts: show the number, always show where it came from.
   Cost: adds ~900 more subject-term jobs per historical term to the crawl.
2. **Let the student type it in.** The schedule already supports custom blocks;
   a section with no known time gets an "add times" affordance. Honest, but it
   makes the student do the registrar's work.
3. **Pursue read-only Vergil/CUIT API access** (`vergil_api_spec.md` §7). The
   correct long-term fix, and it also unblocks item 4 above. Needs a human at
   Columbia to sponsor it.
4. **Ship the schedule as course-list-only for current terms** — no grid, no
   conflicts. Least work, worst product.

### Option 1 SHIPPED — and here is what it actually recovers

Historical inference is built and live, not waiting on a decision.
`lib/db/typical-meetings.ts` holds the fallback, and the schedule grid, the
home plan snapshot and the calendar shell all consume it with an explicit
`historical` source tag. Nothing in that module can produce a bare `Meeting`
that would be mistaken for a confirmed one, and hard conflicts are never raised
from it — two historical patterns overlapping is "these usually clash", which
is a warning, not a claim about the actual timetable.

Measured coverage for Fall 2026 (8,540 sections):

| | sections | share |
|---|---|---|
| Confirmed times (Bulletin) | 1,500 | 17.6% |
| Historical pattern available, labelled as such | 3,213 | 37.6% |
| No time information at all | 3,827 | 44.8% |

So **55% of Fall 2026 sections can be placed on a grid**, against 17.6% from
the public directory alone. That is the whole value of option 1, and it is the
honest ceiling: the remaining 3,827 are mostly professional-school sections
that were never in the undergraduate Bulletin and have no prior term to borrow
from, plus genuinely new courses. Spring 2027 has 0 confirmed times because
the term is barely published yet.

The 44.8% is not recoverable without Vergil (option 3). It is not a bug to be
found later — it is the size of what Columbia stopped publishing.

**Still worth pursuing:** option 3, read-only Vergil/CUIT access, which would
take this to 100% and also unblock open item 4. It needs a human at Columbia.

---

## 6. RESOLVED — Google SSO is live

You created the OAuth client and enabled the provider. Verified against the
live endpoints rather than assumed:

- `GET /auth/v1/authorize?provider=google` now returns **302 to Google**. It
  previously returned `400 "Unsupported provider: provider is not enabled"`.
- Following that redirect reaches Google's real consent flow
  (`<title>Sign in - Google Accounts</title>`, `app_domain` = our Supabase
  project) with **no** `redirect_uri_mismatch` and no `invalid_client`, so the
  client ID and the registered redirect URI are both correct.
- `hd=*` and `prompt=select_account` are forwarded intact to Google, which is
  what keeps Barnard students eligible — see the "Why `hd` is `*`" note in
  `lib/db/auth.ts`.
- Production has every Supabase env var the callback route needs.

**One setting still worth confirming, because it fails silently.** Supabase
validates `redirect_to` at CALLBACK time, not at authorize time — I probed it
with a bogus `redirect_to=https://evil.example.com/steal` and it was echoed
back unchanged, so the authorize response cannot tell us whether the allowlist
is right. If `/auth/callback` is not listed, Google will sign the student in
and Supabase will then bounce them to the Site URL (often `localhost:3000`)
instead of back to the app. Check:

Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:

```
http://localhost:3000/auth/callback
https://columbia-catalog.vercel.app/auth/callback
```

and set Site URL to `https://columbia-catalog.vercel.app`.

The end-to-end proof is a real sign-in, which needs your credentials and is
therefore yours to run: open the deployed app, press "Save a plan", and sign in
with a columbia.edu or barnard.edu account. A `users` row appearing is the
confirmation. If anything goes wrong the app now says which stage failed
rather than failing blank — `?auth_error=` is rendered by `AuthErrorNotice`.

## 7. Resend: API key + a verified sending domain (seat alerts)

**What is blocked:** the seat-opened email, and nothing else. The whole alert
lane is built and runs end-to-end today — `sections_opened_since` detects the
transition, `pending_seat_alerts` finds the watchers owed one and dedupes
against `alerts_sent`, `/api/alerts/sweep` renders and sends, and
`record_alerts_sent` books it. Only the transport is missing.

Without a key the sweep reports `stoppedBecause: "email_not_configured"`,
records nothing as sent, and leaves the alerts pending. The first sweep after
the key lands delivers whatever is still inside the 90-minute window. It fails
loudly in the summary rather than silently, because a sweep that sends nothing
and says nothing looks identical to a sweep with nothing to send.

**What I need from you:**

1. resend.com → API Keys → create one with **Sending access**.
2. Domains → add a domain you control and complete the DNS records. Resend
   refuses to send from an unverified domain, so this is not optional.
3. Add both to `.env.local` and to the Vercel project:
   ```
   RESEND_API_KEY=re_...
   ALERT_FROM_EMAIL="Columbia Catalog <alerts@yourdomain.tld>"
   ```

There is no fallback and deliberately no mock. A stubbed sender that logged to
the console would let the whole feature pass a smoke test while every watcher
got nothing.

---

## 8. Vercel plan: cron frequency — RESOLVED IN CODE, still worth knowing

**Confirmed by a failed deploy, and Vercel is stricter than I assumed:**

> Hobby accounts are limited to daily cron jobs. This cron expression
> (*/5 * * * *) would run more than once per day.

It **rejects the deploy** rather than silently coercing the schedule, which is
the better failure — nothing shipped looking configured while alerts arrived a
day late.

**What I changed, so this is not blocking you.** `vercel.json` now asks for two
daily crons (07:00 and 08:00 UTC), which Hobby accepts. Alert latency no longer
depends on them: `lib/alerts/trigger.ts` runs the sweep off the **write**
instead of off a clock. A seat can only open when an ingest records a new
reading, and every ingest — browser worker or cron — passes through
`/api/crawl/submit` or `/api/crawl/cron`, so both now fire a throttled,
detached sweep on the way out. This is spec §10's own principle ("browsers are
the engine, cron is the safety net") applied to mail.

Practically: alert latency is now one crawl interval, not one cron interval,
and on Hobby that is *better* than the every-2-minutes cron would have been for
any section a visitor's browser is refreshing. The daily cron is the floor for
a catalog nobody is looking at.

Correctness does not depend on the throttle. `runAlertSweep` dedupes in
`alerts_sent` keyed on the exact transition timestamp, so two concurrent sweeps
send one email between them. The throttle saves queries.

**Upgrading to Pro is still worth it** for the hourly full-catalog refresh
(spec §10's own numbers assume it) — but nothing is broken without it, and no
decision from you is needed to ship.

---

## 9. `TEST` subject disabled in the crawl queue

Not a blocker, a note. The registrar publishes a `TEST` subject whose rows carry
course numbers above 9999, which `courses_course_number_check` rejects — taking
the whole page's ingest down with it. It is a sandbox subject with no real
classes, so its crawl job is now `enabled = false` rather than failing on every
sweep. Re-enable it only if the constraint is ever widened.

---

## 10. Fixed, logged for the record — Barnard's bulletin is a different host

Not something you need to do; worth knowing because it silently cost us 53
departments' worth of course descriptions.

`bulletin.columbia.edu/sitemap.xml` advertises `/barnard-college/…` paths and
the section root 301s, but every Barnard department page 404s on the Columbia
host — they are served from `catalog.barnard.edu`. Discovery therefore produced
53 jobs that looked correct and could never succeed. `catalog.barnard.edu` is
now on the crawl allowlist (GET-only, https-only and the per-host spacing are
unchanged; its robots.txt does not disallow the `courses-instruction` tree) and
the backfill knows which origin a `barnard-college/` path belongs to.

---

## 11. RESOLVED — sections of one course are distinguishable now

The directory prints one title per *course*, so `COMS 6998`'s 24 Fall 2026
sections all rendered identically though they are 24 different classes. The
note said "nothing currently enqueues those jobs" — that is no longer true.
The `section_detail` queue was filled (5,433 jobs), migration 0017 added
`sections.title`, and the per-section titles came in with it.

Verified against the exact case this item was written about:

```
COMS6998E 001  READINGS LANGUAGE DESIGN
COMS6998E 002  ADV TPCS COMPETITIVE PROG
COMS6998E 003  Hyperscale+AI Infrastruct
COMS6998E 004  CONTINUAL LEARN MEM MDLS
...
```

All 8,540 Fall 2026 sections carry a title, and 5,103 of them differ from their
course's title — which is the number that matters, since a section title that
merely repeats the course title tells a student nothing.

Titles are stored faithfully and suppressed downstream when they duplicate the
course title, rather than being dropped at ingest: the directory's own SHOUTED
abbreviations ("ADV TPCS COMPETITIVE PROG") are ugly but real, and normalising
them at write time would be inventing data.

## 12. RESOLVED — Semantic search ships, with no model and no credential

**Status: semantic search is on by default. No dependency was added, no API key
is required, and the artifact is inside spec §19's budget for the first time.**

This was recorded as the one place where AGENTS.md rule 2 (no `npm install`) and
the product requirement genuinely collided. It did not. The collision came from
an assumption in how the problem was stated, not from the problem.

### The assumption that was wrong

`QueryEmbedder` is `(query: string) => Float32Array | null` — synchronous,
because spec §9 says search never touches the network. That was read as "the
query must be embedded by a model, therefore a model must run in the browser,
therefore `@huggingface/transformers` (~30 MB), therefore an npm install".

The middle step does not follow. A model is one way to place a query in the
embedding space, and it is only necessary if the space is otherwise opaque to
us. It is not: we ship a fully labelled sample of it. Every course's vector is
in the sidecar, and the inverted index says exactly which courses contain any
given term. So a term's position is recoverable as the TF-IDF-weighted centroid
of the documents containing it, and a query's is the sum of its terms':

    v(query) = normalize( Σ_terms idf(t) · Σ_docs(t) w(t,d) · v(d) )

That is `createFoldInQueryEmbedder` (lib/search/query-embedder.ts). It is
synchronous, offline, allocates one vector per keystroke, and adds nothing to
the download — it reads postings the client already holds for lexical search.

It is also **provider-agnostic**: the derivation never mentions where document
vectors came from, so it works unchanged in an LSA space, an OpenAI space, or
anything `IndexEmbeddingInfo.model` may name later.

### And document vectors no longer need a credential either

`lib/search/lsa.ts` builds them by factoring the catalog's own text —
randomized truncated SVD of the TF-IDF term-document matrix, ~250 lines of
arithmetic, no imports beyond our own tokenizer. On the real catalog: 8,746
terms over 4,878 courses, **4.3 seconds**.

`readEmbeddingProviderFromEnv` still wins when `EMBEDDING_API_KEY` is set, and
a hosted encoder is genuinely better on paraphrase and on world knowledge the
catalog never states. But LSA is not a placeholder — co-occurrence across 4,878
course descriptions is exactly the signal that separates "machine learning"
from "medieval history", which is what ranking step 3 is for.

### What the measurements said

Eight representative queries, top-10, against the real catalog:

- **Semantic fusion moves 18/71 positions (25%) versus lexical-only.** The
  signal is doing work, not decorating.
- **The int8 rescore block moves 7% of positions and costs 1.4 MB gzipped.**
  That is the entire spec §19 budget spent on a refinement nobody would notice,
  so it is now off by default (`EMBEDDING_RESCORE=1` restores it). Binary-only
  agreed with rescore on 66/71 top-10 slots.
- **Latency holds.** Over 1,600 searches against the real index, fusion moves
  p50 from 0.10 ms to 0.81 ms and p95 from 0.88 ms to 1.84 ms, worst case
  2.70 ms — comfortably inside a keystroke, which is the promise the whole
  local-index architecture exists to keep.
- Artifact: lexical 2.76 MB + sidecar 223 KB = **2.97 MB against a 3.00 MB
  budget.** Note the caveat from item 10: Vercel's edge gzip runs ~57 KB worse
  than `gzipSync`, so on the wire this is roughly at the line rather than
  26 KB under it.

### The real ceiling, stated honestly

A term the catalog never uses has no documents to average, so it contributes
nothing, and a query made entirely of such terms returns null and search stays
lexical-only. A sentence encoder could place an unseen word from its own
pretraining; this cannot. That is a genuine gap versus option (1) in the
original write-up — and it is still the correct failure, because inventing a
direction for a word the corpus has never seen returns confident neighbours of
nothing.

Semantic fusion also **re-ranks lexical candidates rather than retrieving new
ones** — a pre-existing decision in `SearchEngine.applySemantic` ("keeps recall
predictable and the filter pass bounded"), left untouched. It means the classic
synonymy win is bounded by lexical recall: fusion can promote the right course
among the candidates, but cannot surface one that shares no query term. Lifting
that is a real change to the engine's cost model and was out of scope here.

Covered by 12 tests across `lib/search/lsa.test.ts` (topic separation,
determinism, degenerate corpora) and `lib/search/query-embedder.test.ts`
(fold-in geometry, unknown-term null, block/index mismatch, re-ranking, and
that an exact lexical match still wins outright).

---

## 13. RESOLVED — Building coordinates are in, from OpenStreetMap

Spec §11 says "Buildings are geocoded once", and spec line 638 already named
OSM as the source. Done: **51 of 60 buildings now carry real coordinates**,
applied by migration 0025 and mirrored into `lib/schedule/buildings.ts`.

**Source.** Centroids of named building footprints from OpenStreetMap via the
Overpass API. © OpenStreetMap contributors, ODbL 1.0 — which permits storing
and redistributing them with attribution, unlike the geocoder terms that ruled
out option 2 in the original write-up.

**Nothing was guessed.** Every value is a matched footprint. 36 matched OSM's
name exactly; 5 matched on containment (Columbia's "Mathematics Building" is
OSM's "Mathematics"); 10 needed an explicit alias, each a deliberate
identification rather than a fuzzy hit — Columbia's "Seeley W. Mudd Building"
is OSM's "Mudd Hall", the International Affairs Building is mapped under the
school that occupies it, and NYSPI is two OSM buildings of which the Institute
proper is the Pardes Building.

Every match was then checked against a bounding box for its campus zone before
being accepted, so a same-named building elsewhere in Manhattan could not be
adopted silently.

**Nine are still NULL, on purpose**: Engineering Terrace, the Journalism
Building, Teachers College, Lehman Hall, Alumni Auditorium (a room inside
another building), the Allan Rosenfield Building, and the three off-campus
sites (Baker Athletics Complex, Lamont-Doherty, Nevis). OSM does not name
them where we looked. A wrong coordinate does not look wrong — it renders as a
confident walking time — so these keep degrading to the zone estimate, which
`walkMinutesBetween` already does for any pair missing one.

**What it changed.** Within-campus walks are measured rather than flat.
Mudd → Havemeyer is 186 m and Mudd → Lerner is 440 m; they used to return the
same number. A `buildings_coords_paired` check constraint now enforces both
coordinates or neither, since a half-populated row is worse than an empty one.

Two schedule tests changed as a direct result, and the second is the point:

- One asserted `lat` was null, which encoded the absence of geocoding as
  expected behaviour. It now pins the rule that survived — a cross-campus hop
  uses the zone table even when both ends are geocoded, because straight-line
  distance between campuses is not a walk.
- "Soft-notes a tight intra-Morningside walk" paired Mudd with Pupin and
  **stopped firing**, correctly: they are 140 m apart, about two minutes, and
  an eight-minute gap is comfortable. The flat rate had been warning about a
  stroll across the street — the kind of false alarm a student learns to
  ignore, which is how a real one gets missed. The test now uses Butler to
  Knox Hall (122nd Street, a real eleven-minute walk), and a new test pins
  that Mudd → Pupin produces no warning at all.

## 4. A quarantine table is sitting in the database (housekeeping, not a blocker)

**Update 2026-08-24:** Fall 2026 now holds 2,476 meetings and the term-match
fix has been verified end to end several times over, so
`meetings_quarantine_0020` (2,194 rows) has done its job and could be dropped
at any point. Deliberately NOT dropped: it is the only copy of what the
misfiled data looked like, dropping it is irreversible, and 2,194 rows cost
nothing to keep. Yours to bin whenever you want it gone.

`meetings_quarantine_0020` holds 2,194 rows and can be dropped once you are
satisfied with the Fall 2026 / Spring 2027 map.

**Why it exists.** `ingest_bulletin` was filing bulletin meeting patterns under
the wrong term. It resolved a section on `(course_id, section_code)` alone and
then took `order by term_code desc limit 1` — the row's own term was never
consulted. A Bulletin department page mixes terms in one document, so for the
7,206 course+section keys that exist in more than one term, a Spring listing was
deleted-and-rewritten onto whichever term sorted highest. The write carried
building and room, so the campus map pinned rooms classes do not meet in. Fall
2026 read 603 meetings, 597 with a building — which looked like the crawl
succeeding.

Caught by the columbia-catalog-46 session, which was working in the campus card
lane and noticed the numbers were too good. Fixed in `f477af2` / migration 0020,
which matches on the row's own term and writes nothing at all for a row whose
term it cannot read.

**Why the rows were kept rather than deleted outright.** They are real patterns
off a real page — wrong only about which term they belong to. Keeping them means
a mistake in my cleanup costs a restore instead of another 127 fetches against
Columbia, which our read-only, rate-limited posture makes expensive.

**To drop it** once the re-drain has refilled the live terms and the map looks
right: `drop table meetings_quarantine_0020;`

Nothing reads this table. It costs a few hundred KB and will not affect the app
if left in place indefinitely.

---

## 14. Removed sections — FIXED (the remainder is not a spec item)

**Status: the retry loop is fixed, and withdrawn sections no longer appear
anywhere. What is left is presentation only: they vanish silently rather than
being shown struck through, and closing that needs a file I may not touch.**

The Directory serves a TOMBSTONE, not a 404, when a section is pulled: HTTP
200, 474 bytes, "Section removed from the Directory of Classes". Example:
https://doc.sis.columbia.edu/subj/GNPH/P8090-20251-D01/

At 474 bytes it clears `MIN_PLAUSIBLE_HTML_CHARS` (200), so it was never
caught as a truncated response — it went to `parseSectionDetail`, which
correctly refused to invent an identity and threw. That produced a parse
error, exponential backoff, and a job retrying forever a page whose answer
will never change.

### What is fixed

- `isSectionTombstone` (lib/ingest/parsers/section-detail.ts) recognises the
  page. A predicate rather than a parser return value: a tombstone is not a
  section with fields missing, it is a different document that happens to live
  at a section's URL. Matches title OR heading, so a template tweak to one
  cannot silently restore the infinite retry. No size gate — a cap between the
  474-byte tombstone and a 4.4KB section page has no margin, and its failure
  mode is silent.
- Migration 0024 adds `sections.withdrawn_at` and `mark_section_withdrawn`,
  which is idempotent and does NOT re-stamp an already-marked section (the
  value that matters is when it was FIRST seen gone).
- `ingestHtml` marks the section and completes the job **ok**, then waits out
  the ordinary weekly section-detail cadence. Deliberately not disabled:
  disabling assumes a withdrawal is permanent, and a weekly re-read of a
  handful of pages is the only way we would learn a section came back. The
  ingest fingerprint is deliberately NOT written — a tombstone has zero
  records, and fingerprinting it would make the section's return look like a
  suspicious jump and be refused by the quarantine guard.
- Verified live: all 8 known tombstones now report `withdrawn 5 / failed 0`
  instead of 5 failures; 0 jobs still carry the parse error; sections carry
  `withdrawn_at`; `consecutive_failures` reset to 0 and next fetch is 7–8 days
  out, jittered.

### What is also fixed: they no longer appear anywhere

Withdrawn sections are filtered out of every read, and the filter is in one
place per path rather than sprinkled across call sites:

- **`rowToCourseWithSections`** — the mapper all eight embedded reads funnel
  through. It already filtered by term, so the withdrawn filter sits on the
  same line. Doing it here rather than at the eight `COURSE_WITH_TERM_SECTIONS_SELECT`
  call sites matters: a filter repeated eight times is a filter that gets
  applied seven times after the next edit.
- **`getSection` / `getSections`** — `.is("withdrawn_at", null)` at the query.
  These back the MCP plan tools, so this is what stops a withdrawn section
  being added to a plan at all.
- **`getSeatStates`** — a withdrawn section has no live seat state, only a
  count frozen at whatever it read when Columbia pulled it. Returning that
  under a "seats now" heading is worse than returning nothing.
- **`getPriorSections`** (course history) — a section Columbia withdrew should
  not shape "what this course is usually like".
- **Deliberately NOT filtered**: the section-code label lookup in
  `course-history.ts`, which resolves ids the caller already holds. Filtering
  there would blank the label for a row that plainly exists, turning a
  withdrawn section into an unnamed one rather than an absent one.

Verified against live data: `getSection` on a withdrawn id returns null, a
live id is unaffected, `getSections`/`getSeatStates` drop it from a mixed
batch, and a course whose only section was pulled comes back with zero
sections. Pinned by four mapper tests in `lib/db/schema.test.ts`.

### What is NOT fixed — and why

**A withdrawn section disappears silently rather than being shown struck
through.** For a student who was watching it, that is an empty space where a
section used to be, with no explanation.

**This is not a spec item.** The spec never mentions withdrawn, removed, or
cancelled sections anywhere — the struck-through treatment was my own idea
about what would be kinder, not a requirement anyone wrote down. What the spec
does imply (never show stale data as live, never retry a settled answer
forever) is done. Listing this as an open spec gap overstated it.

The blocked step is small and specific: the domain `Section` type in
`lib/types.ts` has no `withdrawnAt` field, and **AGENTS.md rule 1 forbids
modifying `lib/types.ts`** (another agent depends on its exact contents).
Without that field the UI cannot tell a withdrawn section from a live one, so
the only two options are showing it as live — a lie, and the actively harmful
one, since a student could plan around it — or dropping it. Dropping it is
what is implemented, and it is the better of the two.

**Impact today is nil**: 8 withdrawn sections, all in archived terms (20243
×1, 20251 ×7), **0 in 20263/20271**. It becomes user-visible the first time a
Fall 2026 section is pulled.

**To finish** (needs someone who may edit `lib/types.ts`) — now two steps, not
three, since the filtering is done:
1. Add `withdrawnAt: string | null` to `Section` in `lib/types.ts`.
2. Map it in `rowToSection` (`lib/db/schema.ts` — the row type already carries
   `withdrawn_at`), then relax the filter on the course page ONLY, and render
   the section struck through with its provenance stamp. Search, the catalog
   list, seat states and the plan tools should keep filtering it out; the
   course page is the one surface where "this was pulled" is worth saying out
   loud.


## 15. RESOLVED — Subjects with no page for a term are no longer failures

196 `subject_term` jobs across 115 subject codes returned HTTP 404 and backed
off exponentially, forever, pinned at the 6h ceiling. The Directory's root
index lists every subject code that has EVER run, so a subject offering nothing
in a given term simply has no page for it: the 404 is correct, definitive and
permanent. Same mistake as #14 — a definitive answer handled as a transient
fault.

**Fixed.** `recordFetchFailure` now takes an optional `status`, and a 404 on a
`subject_term` job completes **ok** at the ordinary cadence instead of backing
off. Scheduled rather than disabled: a subject that offers nothing in Fall 2026
may well offer something later, and the weekly re-read is what would notice.

**The asymmetry is the design, not an oversight.** `status` is populated only
by the cron route and the operator script, which hold a real `politeFetch`
outcome. The browser submit route does NOT pass it, and `SubmissionSchema`
still carries no status field. Honouring a client's claim that a page 404s
would let any browser mark a subject permanently absent for every other user,
and this codebase already draws that line: provenance travels with the data
and must not be client-controlled. Tested in both directions.

Restricted to `subject_term` deliberately. A 404 on a section-detail page is
already handled as a withdrawal by its own tombstone, and a 404 on a bulletin
department or the subject index means a URL we build is wrong — a bug that
should stay loud rather than be reclassified as normal. Also tested.

**Verified live**: the operator drain reported `not published 50 / failed 0`
where those same 50 were failures before, and **all 1,154 subject-term jobs
now carry no error at all** (was 196 permanently erroring). ~800 wasted
requests/day at Columbia's expense stopped, and the failure count can return
to zero — which is what makes a real failure visible.

## 16. Search index is at 99.1% of its size budget — and that is optimistic

Adding the semantic sidecar (item 12) took the artifact from 2.76 MB to
**2.97 MB against spec §19's 3.00 MB ceiling** — lexical 2.76 MB plus a 223 KB
embedding block, over 4,878 courses / 9,576 sections. The reported 26.3 KB of
headroom is the tightest this has ever been.

**The real headroom is smaller than the build reports.** `build-index.ts`
measures with Node's `gzipSync`; what ships is whatever Vercel's edge encodes.
Measured against production, the wire transfer is 2,948,324 bytes (2.81 MB)
versus the build's own 2,890,558 (2.76 MB) — 57 KB worse. So the actual margin
was **~191 KB, not 249 KB**, and the number printed by the build is optimistic
about the only figure that matters. Worth fixing the budget check to be
pessimistic rather than discovering the gap at the ceiling.

Apply that same 57 KB correction to today's figures and the wire total is
roughly **at the 3.00 MB line rather than under it**. Calling this "in budget"
is true of the build's own measurement and marginal on the real one; both
numbers are stated here rather than the flattering one alone.

Descriptions are what grew it (the `display` block is 67% of the raw lexical
artifact). The margin is now thin enough that the next meaningful addition to
`projectCourse` will blow the budget outright.

Two levers, cheapest first:

1. **The display block.** Largest by a wide margin and the least
   information-dense — it is a JSON projection, and it is 6.69 MB raw.
2. **The embedding sidecar, only if forced.** It is a separate lazy download,
   so it does not delay first paint the way the lexical block does; counting it
   against the same ceiling is conservative. Dropping to 256 dims would save
   ~75 KB at some ranking cost.

---

## 17. RESOLVED — spec §20's `vercel.ts` config ships

**Status: `vercel.ts` is the project config. `vercel.json` is deleted. No
dependency was installed and no CLI upgrade was needed.**

I had filed this as blocked on two claims. Both were wrong, and both were wrong
because I reasoned about the tooling instead of testing it.

**Claim 1 — "the pinned CLI (50.35.0) predates `vercel.ts` support."** The CLI
bundle does mention `vercel.ts`, but only inside a codegen template for
`vercel routes export --format ts`; config resolution greps as `"vercel.json"`
across seven files and nothing resolves `vercel.ts`. That was a correct
observation about the CLI and an incorrect conclusion about the deploy, which
is executed by the platform, not by the local config reader.

**Claim 2 — "`@vercel/config` must be installed."** Only for the types. The
documented form imports `VercelConfig` as a type, which erases at runtime — and
a type-only import would still fail `tsc --noEmit` with the package absent, so
`vercel.ts` declares the shape locally instead. Narrower than the real type on
purpose: it describes what this project uses, so adding a field means widening
it deliberately.

### How it was actually settled

A preview deployment carrying `vercel.ts` and **no `vercel.json`**:

- all five configured rewrites returned 200 with correct OAuth metadata bodies
- `/.well-known/definitely-not-a-route` returned 404, so the 200s came from
  those rewrites and not from a catch-all
- there is no Next.js route under `app/` for `.well-known`, ruling out the
  framework serving them itself

Then production, since crons never run on previews. Reading the deployment
record back from the API:

```
crons: [{"path":"/api/crawl/cron","schedule":"0 7 * * *"},
        {"path":"/api/alerts/sweep","schedule":"0 8 * * *"}]
```

Both registered, and the rewrites verified live on the production alias. The
cron lane and the MCP OAuth discovery endpoints — the two things a silently
unread config would have broken — are confirmed working from the new file.

**The lesson worth keeping:** the two previous items I closed this way (#13,
#15) and this one all failed the same way. Each was blocked by a belief about
what the tooling would do, stated confidently enough that it stopped looking
like a question. The cost of checking was one preview deploy.

---

## 18. Phase 3 and Phase 5 audit — complete except the email transport

Prompted by a review that read the open items in this file and inferred spec
§21's Phase 3 (Alerts) and Phase 5 (History + MCP) were unfinished. They are
not. Verified against the code, the database and live production:

**Phase 3 — Watchlist and alerts.** `watches` and `alerts_sent` tables exist;
`promoteToHot` implements the hot-tier cadence; `watcherCount` is plumbed
through `lib/types.ts`, the MCP adapters and tools, and both alert render and
sweep; realtime seat state lives in `lib/watchlist/store.ts`; the UI ships
`watch-button.tsx`, `watchlist-rail.tsx` and `watchlist-provider.tsx`; the Home
dashboard is `components/home/` plus `app/page.tsx`. `lib/alerts/` has render,
resend, sweep and trigger with tests. **Only the transport lacks a credential
(item 7).** `watches` and `alerts_sent` are empty because there are no accounts
yet, not because the lane is unbuilt.

**Phase 5 — History and MCP.** Four terms are backfilled (20243, 20251, 20263,
20271). `components/charts/` carries the seat-history chart with milestone
annotations, and `series.ts` implements the year-over-year ghost lines properly
— ghosts are shifted to align on registration-open rather than sitting a
literal year off the axis, because the comparison a student wants is elapsed
time since registration opened. MCP is live in production with 14 tools, and
the security model is exactly spec §16's: `search_courses` returns real data
unauthenticated, while `watch_section` refuses with `requiredScopes:
["watch:write"]` and a fix instruction. `add_section` / `remove_section`
describe themselves as creating PENDING proposals rather than acting.

### One thing the audit did surface: seat history is thin, and correctly so

23,322 snapshots cover 23,301 sections — **one reading each for 23,280 of them,
two for 21.** That looks like a broken pipeline and is not one.

`enrollment_snapshots` is change-only by design (spec §11): a `BEFORE INSERT`
trigger from migration 0002 drops any reading identical to the previous one for
that section. So one row means the number has not moved since we first saw it,
which is the honest representation rather than a gap.

Confirmed live rather than inferred: a drain running 41 ingest runs in ten
minutes produced **zero** new snapshots. The crawler is fetching and the trigger
is correctly declining to write duplicates — Fall 2026 enrollment is simply
static in this window, with registration closed and the term about to start.
The 21 two-point sections are the ones that actually moved.

What would thicken it is observation over a longer window, which is throttled
by the daily-cron limit in item 8, whose designed mitigation is the browser
worker path. Nothing here needs code.

---
