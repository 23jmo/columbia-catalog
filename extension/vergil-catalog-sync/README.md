# LionPlan — Vergil Schedule Refresh

A Manifest V3 extension that captures only sanitized, public course meeting data
already returned by Vergil course search. It never reads or exports a Columbia
credential and never sends a request to a Columbia API.

## What works

- Passive observation of successful `GET /v1/course_and_class_search` responses.
- Strict normalization to term, course, section, call number, days, times,
  locations, observation time, and fixed provenance.
- A user-triggered full-term refresh that opens Vergil's visible all-course
  search, selects 100 results per page, and advances its normal paginator.
- Batch-by-batch progress and an independently exportable JSON snapshot.
- Quality-aware merging that refuses to replace a richer meeting/location record
  with an emptier observation.
- Session-only capture storage with an immediate Clear action.
- Opt-in, origin-pinned sharing with the signed-in LionPlan website.
  Sharing is disabled by default and only a completed single-term full scan is
  eligible for contribution.

## Local install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension/vergil-catalog-sync` directory.
5. Sign in to Vergil normally and open or refresh a course search.
6. Open the extension popup. Choose **Refresh every course** for a complete
   refresh of the active term, or browse normally for passive capture.

## Security boundary

The executable code:

- observes only successful course-search GET responses from the production
  student-records host;
- never reads request headers, cookies, page storage, planner responses,
  registration resources, or personal academic records;
- never calls `fetch`, `XMLHttpRequest`, or a Columbia endpoint itself;
- automates only Vergil's visible course-search page-size and next-page controls;
- reconstructs every record against a strict allowlist in the main-world
  sanitizer, isolated bridge, service worker, and contribution handoff;
- accepts contribution requests only from
  `https://columbia-catalog.vercel.app`, and only after explicit opt-in.

The host page can spoof main-world events, so every server contribution still
needs independent validation, account authentication, deduplication, and the
catalog's no-regression quarantine before a database write.

## Contribution handoff

The website-side interface is specified in
[`CONTRIBUTION_CONTRACT.md`](./CONTRIBUTION_CONTRACT.md). The production site
does not implement that page/API yet; the extension therefore stops at the
review handoff instead of attempting an anonymous or direct Supabase write.

The full-term Vergil capture is the canonical schedule-refresh source going
forward. Passive captures stay local and cannot be submitted as a database
refresh. The server lane must implement the transactional, account-gated writer
defined by the contract before contributions can reach Supabase.

## Verified live snapshot

An Aside-driven refresh on August 24, 2026 traversed all 52 Fall 2026 result
pages reported by Vergil:

- 5,195 courses reported by the paginator;
- 9,935 sanitized Fall 2026 sections captured;
- 8,412 timed weekday meeting rows captured;
- 7,821 meeting rows with a published location, covering 5,130 sections and
  517 distinct building-and-room labels.

An earlier refresh on the same date returned only `To be announced` location
labels. A later full refresh returned the published rooms without an extension
code change, confirming that the earlier zero-location result was a stale
upstream observation rather than a sanitizer or paginator failure.

The current exported snapshot is
`~/Downloads/vergil-schedule-2026-08-24 (5).json` (4,410,205 bytes). Its Fall
records were observed between `2026-08-24T17:27:23.437Z` and
`2026-08-24T17:29:44.812Z`. It contains no personal planner, registration, or
authentication data.

## Tests

From the repository root:

```sh
npx vitest run extension/vergil-catalog-sync/tests
```

Store packaging and listing material live under `store-assets/` and are omitted
from the runtime ZIP except for the required icons.
