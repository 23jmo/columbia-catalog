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
