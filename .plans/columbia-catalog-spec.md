# LionPlan — Product & Technical Spec

**Version:** 0.2 (LionPlan)
**Date:** 2026-08-22
**Product name:** LionPlan
**Companion document:** `vergil_api_spec.md` — data-source reverse engineering, endpoint inventory, and access-control findings. This spec assumes its conclusions and does not repeat them.

---

## Table of Contents

1. [Thesis](#1-thesis)
2. [Scope & Non-Goals](#2-scope--non-goals)
3. [Product Principles](#3-product-principles)
4. [Information Architecture](#4-information-architecture)
5. [Screen: Home](#5-screen-home)
6. [Screen: Search](#6-screen-search)
7. [Surface: Course Drawer](#7-surface-course-drawer)
8. [Screen: Schedule](#8-screen-schedule)
9. [Search Architecture](#9-search-architecture)
10. [Ingest Architecture](#10-ingest-architecture)
11. [Data Model](#11-data-model)
12. [Ratings & Reviews](#12-ratings--reviews)
13. [Seat History & Waitlist Odds](#13-seat-history--waitlist-odds)
14. [Alerts](#14-alerts)
15. [Auth & Accounts](#15-auth--accounts)
16. [MCP Server](#16-mcp-server)
17. [3D Campus Card](#17-3d-campus-card)
18. [Design System](#18-design-system)
19. [Performance Budget](#19-performance-budget)
20. [Tech Stack](#20-tech-stack)
21. [Build Phases](#21-build-phases)
22. [Deferred & Open](#22-deferred--open)

---

## 1. Thesis

Vergil is slow, opaque, and hostile to the actual decision a student is making. Every search is a network round-trip against an undocumented API; meeting times live in a different system from seat counts; nothing tells you whether a professor is good, whether a waitlist ever clears, or whether you can physically walk from Mudd to Barnard in ten minutes.

LionPlan is a **read-only planning layer** over Columbia's public course data that is fast enough to feel local, opinionated enough to answer the real question, and honest about where its numbers come from.

Three bets:

1. **The whole catalog fits in a browser.** ~10–15k courses is small enough to ship as a client-side index, which makes search instant in a way no server architecture can match.
2. **Reputation is data.** CULPA prose and Reddit threads contain structured signal — workload, grading, teaching quality — that nobody has ever extracted and made filterable.
3. **The agent belongs outside the app.** Rather than build a chatbot, expose the catalog as an MCP server so students use the model they already pay for.

---

## 2. Scope & Non-Goals

### Coverage

Every school Columbia operates **plus Barnard** — undergraduate, graduate, and professional. ~900 subjects.

**Terms held:** the currently-registerable term and the next one, plus archived past terms (read-only) to power offering history, instructor history, and year-over-year seat comparison. As of writing: Fall 2026 (`20263`) live, Spring 2027 (`20271`) next, with `20261`/`20253`/`20251`… archived.

### V1 ships

- Full catalog with accurate seats and meeting times
- Instant client-side search with all filter groups
- Course drawer with ratings, seat history, section compare
- Multi-plan schedule with conflict + commute detection, custom blocks, `.ics` export
- Watchlist with email seat alerts
- MCP server
- Google SSO accounts

### V1 explicitly cuts

| Cut | Why | Returns when |
|---|---|---|
| **3D campus card** | Highest effort-to-certainty ratio on the list | Post-v1 polish pass |
| **Waitlist odds** | Requires a full term of observed drop-rate data | After one registration cycle |
| **In-app AI chat** | Replaced by MCP | Only if non-technical students ask for it |
| **Syllabi** | No reliable public source; copyright edge | Possibly never |

### Non-goals, permanently

- **No registration.** No cart writes, no `POST`/`PATCH`/`DELETE` against Columbia, no timed enrollment. The product ends at "here are your call numbers and a deep link to the right Vergil page."
- **No credential handling.** No CAS passwords, no Duo, no storing or transmitting Vergil bearer tokens.
- **No social graph.** Shareable read-only schedule links only.

---

## 3. Product Principles

1. **Never show a spinner in search.** If a surface can be instant, it is instant. If it can't, it shows real content with live data filling in underneath — never a skeleton where a skeleton could be avoided.
2. **Every number carries its provenance.** The directory hands us `as of 2:06PM Friday, August 21, 2026` in its own HTML. That timestamp is a permanent trust feature, not a degradation notice.
3. **Course quality and instructor quality are different things.** A great professor teaching a brutal required course must never average into mush.
4. **Never overwrite good data with worse data.** A parse that yields less than the last one is quarantined, not committed.
5. **The agent proposes; the student decides.** Nothing mutates a saved plan without an explicit accept.
6. **Read is free. Write needs an account.** One rule, no exceptions, easy to explain.

---

## 4. Information Architecture

Four surfaces. Three are routes; one is an intercepting route that behaves as both.

```
/                     Home        Registration dashboard
/search               Search      Instant catalog search
/schedule             Schedule    Week canvas, plans, watchlist
/course/[id]          Course      Drawer over search in-app;
                                  full page on direct navigation
```

### Drawer routing

`/course/COMS4118` uses **Next.js App Router intercepting routes**:

- Navigated to from within the app → renders as a large drawer over the current search results, preserving query and filter state.
- Loaded directly (pasted link, search engine, group chat) → renders as a standalone full page.

Same route, two presentations. Course pages are the natural SEO surface and must work for someone who has never opened the app.

---

## 5. Screen: Home

**Purpose:** the tab a student leaves open during registration week.

Layout (BoardUI dashboard grid, desktop):

| Region | Content |
|---|---|
| Primary | Week grid for the plan marked *primary* |
| Rail | Watchlist with live seat state and per-section deltas |
| Cards | Credit total · conflict count · commute warnings · unmet-requirement hints |
| Feed | Recent seat movement across watched sections, newest first |

Empty state (no plan yet) becomes a search-forward prompt rather than an empty grid.

No AI chat panel — that role moved to the MCP server (§16).

---

## 6. Screen: Search

### Result unit

**One row per course, expanding to sections inline.** Students think "I need Operating Systems," not "I need section 002." A course row shows aggregate seat state across its sections; clicking expands the section list in place.

When a **section-level filter is active** (time window, day, instructor, open-seats), matching sections surface directly so the filter behaves the way a user expects rather than hiding matches behind a collapsed row.

### Filters

All four groups ship in v1. Every filter is applied client-side against the local index, so toggling is free.

| Group | Controls |
|---|---|
| **Time & structure** | Start-time / end-time sliders, day-of-week toggles, open-seats-only, credit count, course level (1000–9000) |
| **Requirements** | Global Core, Science requirement, Barnard Ways of Knowing, Nine Ways of Knowing — sourced from the curriculum flags already present in the course record |
| **Org** | School, department, instructor |
| **Reputation** | Workload, difficulty, teaching quality — with an explicit "include unrated" toggle, since silently dropping unreviewed courses is a trap |

### List rendering

Virtualized (TanStack Virtual). The list must stay smooth at full-catalog result sets — no pagination, no "load more."

---

## 7. Surface: Course Drawer

Opens over search. Never loses the student's results or filters.

### Above the fold

- Course name, code, professor, semester
- Days, time, location, credits
- Seats remaining, capacity, waitlist state
- **Add to schedule · Watch · Compare sections**
- Eligibility, prerequisites, registration restrictions
- **Immediate conflict and commute warnings** against the primary plan

### Below, in order

1. Description
2. Sections (with compare)
3. Schedule preview — the week grid with this course dropped in
4. Seat-history graph
5. Instructor profile
6. Reviews
7. Workload and grading signals
8. Similar and alternative courses
9. Past-semester offering history

### Compare

Scoped to **sections of the same course** — five sections of Calc I side by side on professor, time, seats, and rating dimensions. Lives inside the drawer; no new screen.

### Commute warnings

Buildings are geocoded once. For any back-to-back pair in a plan, compute walking minutes and compare against the passing period:

- **Hard warning** on cross-campus transitions (Morningside ↔ Manhattanville ~10 blocks; Morningside ↔ CUIMC ~50 blocks)
- **Soft note** on tight intra-Morningside walks

This feeds conflict detection, the AI's constraint set via MCP, and the future 3D card.

---

## 8. Screen: Schedule

### Plans

**Multiple named plans, one marked primary.** "Plan A," "if I don't get Op Systems," "dream schedule." Primary is what Home renders. This matches how students actually hedge during registration.

### Week canvas

- Drag sections in and out
- Conflicts render inline, not as a modal
- Watchlist panel sits beside the grid; watched sections can be dragged onto the grid as **translucent candidates** to preview a swap without committing
- Credit total, commute summary, and requirement coverage update live

### Custom blocks

First-class non-course blocks — "Work, Tue/Thu 3–6," "Practice, MWF 6–8." They **participate in conflict detection and commute checks** and are visible to the MCP tools as constraints. This is what makes it the student's schedule rather than a course list.

### Export

`.ics` subscription feed so a finished plan lands in the calendar they already use.

### Registration handoff

A dedicated **registration mode**: call numbers listed in registration order, large copy targets, check-off as you go, deep links into the correct Vergil page per section. This is the last mile and it should feel designed, not abandoned.

---

## 9. Search Architecture

**The index ships to the browser.** At ~10–15k courses the entire catalog fits client-side, which removes the network from the critical path entirely.

### Why not Algolia/Typesense

Their hard problems — sharding, high QPS, multi-tenant ops — don't exist at this size. What they genuinely provide (Levenshtein typo tolerance, prefix matching, tie-breaking) is available in open libraries. And a hosted service still pays a round-trip; it can be 40ms and still lose to 0ms.

### Payload

| Component | Approach | Approx size |
|---|---|---|
| Course text (title, description, code, instructors, flags) | Inverted index, gzipped | ~1–1.5 MB |
| Semantic embeddings | 384-dim, **binary quantized** (1 bit/dim), float rescore on top ~200 hits | ~720 KB |
| **Total** | | **~2–3 MB** |

Cached in IndexedDB, revalidated on load.

### Delivery: static text index + live seat overlay

The volatile and immutable parts are split:

- **Immutable** — course text, requirement flags, embeddings. Versioned static asset on the CDN. Regenerated a few times a term.
- **Volatile** — seat counts, enrollment status, waitlist depth. **Never in the index.** Fetched for visible rows only and merged at render.

This means updating a seat count never re-downloads a megabyte of unchanged course descriptions.

### Ranking

Hybrid, computed locally:

1. Lexical BM25 over the inverted index
2. Prefix + trigram fuzzy matching for typo tolerance
3. Cosine similarity over binary-quantized embeddings, rescored in float for the top slice
4. Fusion, with boosts for exact code match (`COMS 4118`) and title match

---

## 10. Ingest Architecture

### The key structural fact

`doc.sis.columbia.edu/subj/{SUBJ}/_{Term}.html` returns **every section for a subject in one request, with enrollment counts included**. That makes the subject-term page the unit of work, and there are only ~900 of them.

A full seat refresh of the entire university is ~900 requests — roughly **0.25 req/s sustained**. Volume was never the problem. *Pattern* is.

### Workloads

| Workload | Volume | Frequency |
|---|---|---|
| Cold backfill, one term | ~900 req | Once |
| Archived past terms | ~900 × 6 | Once |
| Bulletin meeting times | ~150 dept pages | Weekly |
| Full-catalog seat refresh | ~900 req | Hourly |
| Hot tier (watched) | ~40–80 req | 2 min |
| Registration burst | hot subjects | 30 s |

### The job queue

A single `crawl_jobs` table is the source of truth for pacing. `next_fetch_at` **is** the recency cache — a job is due only when `now() > next_fetch_at`, so nothing fresh is ever re-polled.

Three consumers claim from the same queue with `SELECT ... FOR UPDATE SKIP LOCKED`:

```
┌─ Visitor browsers  ── PRIMARY
│    Fetch doc.sis directly (CORS is *), parse, POST results back.
│    Residential IPs. Traffic is indistinguishable from students
│    browsing the directory, because it largely is.
│
├─ Vercel cron ─────── SAFETY NET
│    Claims only jobs overdue past a grace window.
│    Near-idle at 2pm with 200 users online.
│    Carries the whole load at 4am and over winter break.
│
└─ Backfill runner ─── ONE-SHOT
     Cold catalog and archived terms.
```

The system self-balances: **more users means both fresher data and less server-side crawling.**

### Read path vs refresh path

Visitors always read from our Postgres. They never wait on Columbia.

```
Visitor opens COMS in search
  → page renders instantly from our DB
  → client asks: "any due jobs?"
      · nothing due  → browser does nothing
      · job due      → browser leases 1–3 jobs, fetches,
                       parses, posts results back
```

### Job targeting

**Purely by staleness**, ignoring what the visitor is viewing. This maximizes catalog coverage — obscure departments get refreshed even when nobody browses them.

Mitigations against the resulting pattern, since staleness-ordered fetching can otherwise look mechanical:

- Leases capped at **1–3 jobs** per client request
- Randomized jitter on inter-request delay
- Per-client hourly request ceiling
- Jittered `next_fetch_at` on write, so jobs never re-cluster into synchronized waves

### Cadence

| Tier | Interval |
|---|---|
| Full catalog baseline | 1 hour |
| Hot (subjects containing watched sections) | 2 min |
| Active registration window | 30 s |

Adaptive per-section cadence (volatility-based back-off) is a v1.5 upgrade once the history table is healthy.

### Registration-window detection

**Ingest Columbia's published academic calendar** and escalate on schedule. Appointments stagger by school and class year over roughly two weeks, so escalation is per-window rather than a single flag.

### Parse safety

Both layers, because this is the one system whose failure makes the product *wrong* rather than merely down:

1. **Contract tests on golden HTML fixtures** in CI — catches known breakage before deploy.
2. **Write protection in production** — an ingest run producing fewer or emptier records than the previous run for the same key is **quarantined for review, never committed**. Catches unknown breakage.

### Degradation

- Every seat count renders with its directory-provided `as of` timestamp, always — not only when unhealthy.
- Cron backstop stays permanently warm; if browser participation drops, refresh slows rather than stops.
- The failure mode is a slightly-stale catalog with visible provenance, not a broken one.

---

## 11. Data Model

Postgres (Supabase). Sketch, not final DDL.

### Catalog

```
terms             (term_code PK, label, starts_on, ends_on,
                   add_drop_deadline, is_registerable)
subjects          (subject_id PK, code, name, school)
buildings         (building_id PK, name, lat, lng, campus_zone)
instructors       (instructor_id PK, uni, first, last, email)

courses           (course_id PK, course_identifier2, subject_id,
                   number, title, description,
                   points_min, points_max,
                   prerequisite_formula, corequisite_formula,
                   requirement_flags JSONB)

sections          (section_id PK, course_id, term_code,
                   class_identifier, call_number, section_code,
                   component, method_of_instruction,
                   min_unit, max_unit, grading_mode,
                   enrollment_cap, enrollment_count,
                   waitlist_cap, waitlist_count, status,
                   source_as_of TIMESTAMPTZ,   -- directory's own stamp
                   last_seen_at)

meetings          (meeting_id PK, section_id, weekday,
                   start_time, end_time, building_id, room)

section_instructors (section_id, instructor_id)
```

`requirement_flags` holds the curriculum booleans from the course record (Global Core, science, Ways of Knowing, Nine Ways of Knowing) as JSONB rather than ~60 columns.

### History

```
enrollment_snapshots (section_id, observed_at,
                      enrollment_count, enrollment_cap,
                      waitlist_count, status)
```

**Change-only writes.** A row is written only when a reading differs from the last one for that section. Most of the catalog is static most of the time, so this collapses storage enormously while keeping perfect fidelity exactly during registration, when things actually move. Charts interpolate flat between points.

**Retention: forever.** Year-over-year comparison is a headline feature and the data is small under change-only writes.

### Ingest

```
crawl_jobs        (job_id PK, kind, target_key, term_code,
                   next_fetch_at, leased_until, leased_by,
                   tier, last_ok_at, consecutive_failures)

ingest_runs       (run_id PK, job_id, started_at, status,
                   records_written, quarantined BOOLEAN, notes)
```

### Reviews

```
review_sources    (source_id PK, kind)          -- culpa | reddit
reviews_raw       (review_id PK, source_id, subject_ref,
                   instructor_id, course_id,
                   posted_at, body, url)
review_dimensions (review_id PK, workload, difficulty,
                   teaching_quality, grading_fairness,
                   sentiment, would_take_again,
                   extracted_at, model_version)
```

### User

```
users             (user_id PK, email, google_sub, created_at)
plans             (plan_id PK, user_id, term_code, name, is_primary)
plan_items        (plan_id, section_id)
custom_blocks     (block_id PK, plan_id, label, weekday,
                   start_time, end_time)
watches           (user_id, section_id, created_at)
alerts_sent       (user_id, section_id, sent_at, reason)
mcp_tokens        (token_id PK, user_id, scopes, expires_at)
```

---

## 12. Ratings & Reviews

### Sources

| Source | Treatment |
|---|---|
| **CULPA** | Primary. Columbia-specific, student-run, far more relevant than RMP. **Pursue a partnership** rather than a scrape. |
| **Reddit** | Official API with proper credentials. |
| **RateMyProfessor** | **Never ingested.** Fetched live at drawer-open, displayed clearly attributed to RMP with a link out, **never stored.** |

The RMP decision is deliberate: displaying current third-party data with attribution is a materially better position than holding a mirror, and RMP is the one source with real litigation history around scraping.

### Extraction

Every ingested review runs once through an LLM at ingest time to produce structured dimensions:

- Workload
- Difficulty
- Teaching quality
- Grading fairness
- Sentiment
- Would-take-again signal

Expensive once, free forever, and it turns CULPA's prose — the most valuable and least structured source — into something filterable.

### Display

**Dimensions, not a verdict.** Course quality and instructor quality are scored **separately** and combine only for a specific section.

```
Instructor            4.4 / 5     n=38, 2021–2026
Course experience     4.1 / 5     n=52, 2019–2026
Workload              High
Would take again      78%

Sources: CULPA (31) · Reddit (21) · RMP → view on RateMyProfessor
```

**No confidence label.** Instead, show the components that would drive one — sample size, date range, per-source breakdown — and let students judge. A composite score may exist but must be **expandable and reproducible**: clicking it shows exactly how it was computed.

### Coverage honesty

Many courses will have no reviews. Rating filters ship with an explicit **"include unrated"** toggle so unreviewed courses never silently vanish from results.

---

## 13. Seat History & Waitlist Odds

### The chart

**Seats taken over time, with registration milestones annotated.** One line plus vertical markers for:

- Registration open
- Each school/class-year appointment window
- Add/drop deadline

Context is what makes the line mean anything — *"it filled in 90 seconds during senior registration"* is the insight, not the curve itself.

Where an archived prior offering exists, a **ghost line** of last year's same course renders behind the live one, answering "is this filling faster than normal."

No data-age labeling. The chart shows whatever window exists.

### Waitlist odds — post-v1

Cut from v1 because it requires a full term of observed drop-rate data.

**Model: Monte Carlo simulation from observed drop rates.** Each enrolled student carries a drop hazard estimated from churn we've actually measured for that course, department, and point in the term. Simulate forward to the add/drop deadline across many trials; count the fraction in which drops exceed the student's waitlist position.

**Presentation: ordinal bands, never percentages.**

| Band | Simulated probability |
|---|---|
| Very likely | > 75% |
| Likely | 50–75% |
| Coin flip | 25–50% |
| Unlikely | < 25% |

Underneath the band, show the evidence: current position, and historical clearance depth where available ("last three fall terms this cleared to position 14, 11, and 16").

Bands rather than numbers because being confidently wrong about registration is memorable, and the model's real precision does not justify a decimal point.

---

## 14. Alerts

### Trigger

A watched section transitions to having an open seat.

### Delivery

**Email.** Simple, universal, no service-worker or iOS-install friction, no per-message cost. Web Push and a PWA install prompt are a later upgrade if email proves too slow during a scramble.

### Fairness

**Notify all watchers instantly, and show the watcher count upfront.** When a student adds a section to their watchlist, the UI states plainly how many people are watching it.

Staggered or queued notification was considered and rejected: deciding who gets a head start into a class is a role this product should not take.

Realtime seat state (Supabase subscriptions) pushes green-state changes to any open tab, so being present is rewarded alongside being fast to an inbox.

---

## 15. Auth & Accounts

### Provider

**Supabase for both auth and database.** Postgres, Google SSO with hosted-domain restriction, row-level security, realtime, and pgvector in one vendor. Realtime is a genuine architectural win here — seat changes push to open tabs without polling our own API.

**Google SSO only, restricted to `columbia.edu` and `barnard.edu`.**

### The line

**Everything read-only is free. An account gates every write.**

| Free, no account | Requires account |
|---|---|
| Search and all filters | Adding anything to a schedule |
| Course drawers, full detail | Watching a section |
| Ratings and reviews | Setting an alert |
| Seat history | MCP access |
| Section compare | |
| Shared schedule links | |

The wall goes up at the **first schedule write**. This is one rule, trivially explainable, and it eliminates anonymous-to-account state migration entirely — there is no anonymous plan to migrate.

The app is fully useful before signing in, which preserves course pages as an SEO surface and lets someone evaluate the product without commitment.

---

## 16. MCP Server

**Replaces the in-app AI chat for v1.** Students point Claude, ChatGPT, or any MCP client at LionPlan and get an agent better than one we'd build, running in a tool they already pay for — at zero inference cost and zero abuse surface to us.

### Tools

Everything the in-app agent would have done.

**Unauthenticated — catalog and reputation**
```
search_courses(query, filters)
get_course(course_id)
get_sections(course_id, term)
get_ratings(course_id | instructor_id)
get_seat_history(section_id)
```

**Unauthenticated — stateless analysis**
```
check_conflicts(sections[])
check_commute(sections[])
check_requirements(sections[], program)
```

These are pure functions over a proposed schedule and are precisely what an external agent is bad at doing unaided.

**Authenticated — the student's own data**
```
get_my_schedule(plan_id?)
add_section(plan_id, section_id)
remove_section(plan_id, section_id)
watch_section(section_id)
list_watches()
```

### Auth

**OAuth 2.0 as specified by MCP.** The client opens a browser, the student signs in with Google, the agent receives a scoped refreshable token. More implementation work than a pasted personal access token, and the only version that doesn't have students copying long-lived secrets into plaintext config files.

Scopes separate read from write so a student can grant catalog access without granting plan mutation.

### Agent authority

Write tools **propose rather than act**. `add_section` and `remove_section` create a pending diff that surfaces in the app for accept/reject rather than mutating a saved plan directly. Nothing changes without a human click.

### Distribution

A copy-paste MCP config block on Home and in settings.

---

## 17. 3D Campus Card — Post-V1

One of the cards inside the course drawer is a small **three.js viewport showing a stylized 3D Columbia that can pan and orbit**, with a marker on the building where that section meets. A single scene, instanced across every drawer — only the marker changes.

### Assets

**Extruded OpenStreetMap building footprints with stylized flat shading.** OSM already has Columbia's footprints and heights; extruding them yields the entire campus at once, and deliberate cartoon shading with a warm palette reads as *stylized* rather than *badly modeled*.

Later polish can replace individual landmarks (Low, Butler) with hand-modeled versions without touching the scene graph.

### Constraints

- Must not regress the drawer's open-time budget — lazy-loaded, never blocking
- Static image fallback on mobile and on `prefers-reduced-motion`
- Shares the geocoded building data already required by commute warnings, so the data layer costs nothing extra

---

## 18. Design System

### BoardUI, used directly

```bash
npx boardui@latest init
npx boardui@latest add button select date-picker …
```

Components at https://www.boardui.com/components. Built on **Recharts** (17 chart types) and **Motion**. 400+ design tokens.

### Component mapping

| Need | BoardUI component |
|---|---|
| Seat-history chart | `line-chart-card`, `area-chart-card`, `combo-chart-card` |
| Enrollment meter | `radial-chart-card`, `stage-bars-card` |
| Rating dimensions | `bar-list-card` |
| Search results | `data-table`, `table` |
| Nav | `sidebar`, `tabs`, `segmented-control`, `breadcrumb` |
| Filters | `slider`, `select`, `dropdown`, `chip`, `badge`, `checkbox`, `switch` |
| Time / term pickers | `date-picker`, `calendar` |
| Alerts | `notification`, `notification-center` |
| Sign-in | `auth-card`, `social-button` |
| Settings | `settings-modal` |
| Offering history | `contributions-card`, `heatmap-chart-card` |
| Layout templates | `home-dashboard`, `application` |

`ai-chat`, `composer`, `agent-thinking`, and `agent-progress` are available but unused in v1 — they become relevant only if the in-app chat is ever revived.

### Responsiveness

**Truly responsive, equal priority.** Every screen designed for both desktop and phone from the start.

- Week grid degrades to an agenda list on narrow viewports
- Course drawer becomes a full-height sheet
- Virtualized results and filters must remain fully usable at 390px

Registration happens on a laptop; 2am seat-checking happens on a phone. Both are first-class.

### Accessibility

WCAG AA contrast in both themes. Full keyboard navigation for search, filters, drawer, and the week grid. Seat state must never be conveyed by color alone.

---

## 19. Performance Budget

The performance thesis *is* the product thesis, so it's stated as a hard bar.

| Metric | Target |
|---|---|
| Keystroke → updated results | **< 16 ms** (one frame) |
| Filter toggle → updated results | **< 16 ms** |
| Search loading states | **Never.** Search does not touch the network. |
| Drawer open | Immediate with cached content; live data fills underneath |
| Result list scroll | 60 fps at full-catalog result sets |

Search is instant because it is local. The one honest cost is first load — the index download — which gets an explicit ceiling and a progressive path (usable lexical search before embeddings finish loading).

---

## 20. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, intercepting routes) |
| Hosting | Vercel — Fluid Compute, Node runtime |
| Config | `vercel.ts` with `@vercel/config` (crons declared here) |
| DB + Auth + Realtime | Supabase (Postgres, Google SSO, RLS, pgvector) |
| UI | BoardUI + Tailwind |
| Charts | Recharts (via BoardUI) |
| Motion | Motion (via BoardUI) |
| 3D | three.js (post-v1) |
| Virtualization | TanStack Virtual |
| Client index | IndexedDB, versioned CDN artifact |
| Crawler | Vercel cron + Postgres job queue + browser workers |
| Email | Transactional provider TBD |
| MCP | Dedicated route in the same Next.js app, OAuth-secured |

---

## 21. Build Phases

### Phase 0 — Ingest foundation
Job queue, subject-page parser, bulletin meeting-time parser, golden fixtures, write-protection guard. Cold-backfill one term. **Nothing user-facing.** This is the part everything else is wrong without.

### Phase 1 — Catalog and instant search
Index builder, client index delivery, search screen with all filters, virtualized results, course drawer (identity, seats, sections, description). Live seat overlay. Browser worker path live.

### Phase 2 — Accounts and schedule
Google SSO, plans, week canvas, conflict detection, building geocodes and commute warnings, custom blocks, `.ics` export, registration mode.

### Phase 3 — Watchlist and alerts
Watches, hot-tier cadence, email alerts, watcher counts, realtime seat state, Home dashboard.

### Phase 4 — Reputation
CULPA partnership/ingest, Reddit API ingest, LLM dimension extraction, instructor profiles, live RMP display, rating filters.

### Phase 5 — History and MCP
Archived term backfill, seat-history charts with milestone annotations, year-over-year ghost lines, past-offering history. MCP server with OAuth.

### Phase 6 — Post-v1
3D campus card. Waitlist odds simulation. Adaptive per-section cadence. Web Push.

---

## 22. Deferred & Open

### Deferred by decision

| Item | Status |
|---|---|
| Name and branding | LionPlan |
| Public positioning, disclaimers, terms | Explicitly deferred — revisit before public launch |
| Crowdsourced-ingest disclosure | To be handled in terms and conditions later |
| In-app AI chat | Only if students ask for it |
| Friends / social graph | Out of scope; shareable links only |
| Syllabi | No reliable source; likely permanent cut |

### Open questions

1. **CULPA partnership** — worth approaching directly before building any scraper. Turns the riskiest ingest into a relationship and is the single highest-leverage conversation available.
2. **Email provider** and deliverability during a burst — a seat opening in a popular class fires dozens of emails simultaneously.
3. **Index rebuild cadence** — how often course text actually changes mid-term, and whether delta patches are worth building.
4. **Requirement templates** — the flags support filtering, but full degree-audit ("what do I still need") remains unscoped and is the largest possible future feature.
5. **Archived term depth** — how far back the directory actually exposes, and whether the one-time backfill crawl needs pacing separate from steady state.
6. **Drop-rate measurement design** — waitlist odds depend on it, so instrumentation should be correct in Phase 0 rather than retrofitted.
7. **CUIT relationship** — whether to eventually pursue a registered read-only OAuth client, per §7 of `vergil_api_spec.md`.
