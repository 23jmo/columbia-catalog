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
3. Let a browser worker fetch it — but registrar.columbia.edu almost certainly
   sends no CORS header either, so this likely fails the same way.

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

**What I am doing meanwhile:** proceeding with the Fall 2026 + Spring 2027 crawl
you asked for, since everything except meeting times is present and correct. The
schedule UI will be built to render a section with unknown times honestly rather
than pretending it has them. Say the word on option 1 and it is a crawl-scope
change plus a fallback query, not a redesign.

---

## 6. Needs you (5 minutes) — Google OAuth credentials for sign-in

All the app-side auth is written and typechecks: `lib/db/auth.ts`,
`app/auth/callback/route.ts`, `proxy.ts`, `hooks/use-session-account.ts`,
and the account menu is wired to real sessions. Migration 0005 already creates
the `users` row from a trigger on `auth.users` and enforces the Columbia domain
with a check constraint.

The one thing I cannot produce is a Google OAuth client, which needs a Google
Cloud project you own.

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client
   ID** → *Web application*.
2. Authorized redirect URI — exactly this, it is Supabase's callback and not
   ours:
   ```
   https://wwqtflgwpukwzfysnncv.supabase.co/auth/v1/callback
   ```
3. Supabase Dashboard → Authentication → Providers → **Google** → enable, paste
   the client ID and secret.
4. Supabase Dashboard → Authentication → URL Configuration → add redirect URLs:
   ```
   http://localhost:3000/auth/callback
   https://<your-vercel-domain>/auth/callback
   ```

Until then `isConfigured()` is true but Google is not enabled, so the sign-in
dialog reports it plainly instead of hanging. **Nothing else is affected** —
reading is free by design (spec §15), so search, course pages, seat history and
the campus map all work signed out.

Optional: set `hd` on the Google Workspace side too. I already send
`hd=columbia.edu` on the authorize URL, but Google treats it as a hint. The
binding restriction is the `users_columbia_domain` check constraint, and the
callback signs out a non-Columbia account and says why rather than leaving them
apparently-signed-in with every write failing.

---

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

## 11. Known gap — sections of one course are not distinguishable

The directory prints one title per *course*, not per *section*. `COMS 6998` has
24 sections in Fall 2026 and they are 24 different classes ("Advanced Topics in
…"), but every one of them renders and serialises with the same course title.

We store nothing that tells them apart, so search, the course page, and the MCP
tools all answer this question uselessly. The per-section title appears on the
section detail page at `doc.sis.columbia.edu`. The machinery to read it already
exists — there is a `section_detail` crawl job kind and
`lib/ingest/parsers/section-detail.ts` — but nothing currently enqueues those
jobs, and doing so for every section is ~17k additional fetches.

Not blocking, and not yet costed. Flagged because it is the most visible
remaining wrongness in the catalog data.

---

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
