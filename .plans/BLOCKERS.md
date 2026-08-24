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

### 4. **BLOCKING for spec §10 registration windows** — registrar.columbia.edu returns 403
`https://registrar.columbia.edu/content/academic-calendar` refuses server-side
requests (403 from a WAF, with both a polite UA and a browser UA). The SAS API
alternative `/v1/termcalendars` returns 401 per `vergil_api_spec.md:342`.

Consequence: `registration_milestones` stays empty, so
  - the seat-history chart renders without its milestone annotations (§13), and
  - the 30-second registration tier never activates; watched subjects escalate
    to the 2-minute hot tier instead (§10).

This is the documented degradation path, not a break — refresh slows, it does
not stop. The parser (`lib/ingest/parsers/academic-calendar.ts`) and the writer
(`ingest_academic_calendar`) are both built and tested, so the moment a source
exists it is one job-enqueue away.

Three ways to unblock, in order of preference:
1. Paste the Fall 2026 / Spring 2027 registration dates and I will seed
   `registration_milestones` directly. **Deliberately not guessed** — these
   dates annotate charts and drive crawl escalation, and a fabricated date is
   worse than an absent one.
2. Pursue the CUIT read-only OAuth client (`vergil_api_spec.md` §7) which would
   also unlock `/v1/termcalendars`.
3. ~~Let a browser worker fetch it~~ — **ruled out, and not for a technical
   reason.** Retested 2026-08-24 with a real headless Chrome, which gets past
   the plain-`curl` 403 and then lands on this:

       Just a moment... Performing security verification
       This website uses a security service to protect against malicious bots.
       Ray ID: ... Performance and Security by Cloudflare

   That is not a misconfigured WAF refusing an unfamiliar user agent. It is an
   interactive bot challenge, which is Columbia stating plainly that they do
   not want this page fetched by automation. Getting past it would mean
   defeating an anti-bot control, and that is out of scope on principle rather
   than on capability — a line worth keeping even though the page itself is
   public and a student can read it in one click.

   Option 1 stays the cheap fix: the dates pasted in once, seeded directly.

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

## 12. Semantic search needs a model in the browser, and I cannot add one

**What is built:** everything except the model. `lib/search/embeddings.ts` turns
a course into a document and a document into a 384-dim unit vector;
`buildEmbeddingBlock` quantizes to one bit per dimension plus an int8 rescore
block; `encodeEmbeddingBlock` writes the sidecar; `SearchClient` downloads it
after the lexical block and caches it in IndexedDB; `SearchEngine.applySemantic`
ranks the whole catalog by Hamming distance and rescores the top slice in
float. 17 tests cover alignment, ordering, width and the retry policy.

**Two separate things are missing, and they need different answers.**

**(a) Document vectors — one environment variable.** `scripts/build-index.ts`
builds the sidecar as soon as an embedding provider is configured:

```
EMBEDDING_API_KEY=sk-...
EMBEDDING_BASE_URL=https://api.openai.com/v1      # default; any OpenAI-shaped API works
EMBEDDING_MODEL=text-embedding-3-small            # default
EMBEDDING_DIMS=384                                # default; must be a multiple of 32
```

~7,900 courses at text-embedding-3-small is well under $1 per rebuild, and the
index is regenerated a few times a term. There is deliberately no fallback: with
no key the build prints why and ships lexical-only, because vectors from a
cheaper stand-in would be worse than no vectors — a wrong neighbour is a wrong
answer, an absent neighbour is a missing feature.

**(b) Query vectors — BLOCKED, and not by a credential.** `QueryEmbedder` is
`(query: string) => Float32Array | null`. It is synchronous on purpose: spec §9
says search never touches the network, and a search that awaited a round trip
could not return in the same tick as the keystroke. So the query has to be
embedded locally, which means a model in the browser — `@huggingface/transformers`
with a quantized `bge-small-en-v1.5` (~30 MB, WASM/WebGPU) is the standard
choice and matches the 384 dims.

That is an `npm install`, which AGENTS.md forbids me from doing. **This is the
one place in the whole spec where the build rule and the product requirement
actually collide**, so it needs your call rather than a workaround:

1. Add the dependency (`npm i @huggingface/transformers`) and I wire the query
   embedder. ~30 MB extra on first search, cached; lexical results stay instant
   and semantic ones fuse in when the model finishes loading. This is what the
   spec describes.
2. Route queries through a server endpoint. Simplest to build and it breaks the
   promise the whole search architecture exists to keep — a 40 ms round trip per
   keystroke is the thing spec §9 rejects Algolia over. I would not.
3. Ship lexical-only. Perfectly good: BM25 + prefix + trigram fuzzy already
   handles typos and partial codes, and it is what every screenshot so far
   shows. Semantic search is an upgrade, not a missing floor.

**Until you pick, (3) is what runs**, and nothing is broken: `hasSemantic`
returns false, the fusion step is skipped, and the client never downloads a
sidecar that does not exist.

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

## 14. Removed sections — FIXED except for one cosmetic touch

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

## 16. Search index is at 91.9% of its size budget

The rebuild after descriptions completed came in at 2.76 MB gzip against spec
§19's 3.00 MB ceiling — 4,878 courses / 9,576 sections.

**The real headroom is smaller than the build reports.** `build-index.ts`
measures with Node's `gzipSync`; what ships is whatever Vercel's edge encodes.
Measured against production, the wire transfer is 2,948,324 bytes (2.81 MB)
versus the build's own 2,890,558 (2.76 MB) — 57 KB worse. So the actual margin
is **~191 KB, not 249 KB**, and the number printed by the build is optimistic
about the only figure that matters. Worth fixing the budget check to be
pessimistic rather than discovering the gap at the ceiling.

Descriptions are what grew it (the `display` block is now 67% of the raw
artifact). Nothing is wrong today, but the margin is thin enough that it is
worth knowing before anyone adds a field to the projected course shape: the
next meaningful addition to `projectCourse` is likely to blow the budget.

If it does, the display block is the place to look first — it is the largest
block by a wide margin and the least information-dense.
