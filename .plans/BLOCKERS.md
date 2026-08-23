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
