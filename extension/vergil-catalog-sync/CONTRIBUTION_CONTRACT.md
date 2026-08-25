# Signed-in contribution handoff contract

The production site owns authentication and database writes. The extension owns
capture, validation, explicit consent, and the local review payload. This keeps
the Vergil credential completely outside Columbia Catalog.

## Browser handshake

The production page `https://www.lionplan.org/contribute/vergil`
connects to the published extension ID with `chrome.runtime.sendMessage`.

1. Send `{ "type": "GET_VERGIL_CONTRIBUTION_SUMMARY" }`.
2. If `enabled` is false, instruct the user to enable sharing in the popup.
3. Require `ready: true`. The extension refuses passive-only, incomplete,
   failed, quarantined, and internally mismatched captures.
4. Send `{ "type": "GET_VERGIL_CONTRIBUTION" }` only after the user chooses
   Review contribution.
5. Display the returned term, section, meeting, location, and observation-time
   range. A contribution contains exactly one completed full-scan term.
6. Require a signed-in Columbia Catalog account and a final Submit click.

The summary response adds these fields to the consent and scan state:

```ts
interface VergilContributionSummaryV1 {
  ready: boolean;
  reason: string | null;
  termCode: string | null;
  sections: number;
  meetings: number;
  locations: number;
  observedFrom: string | null;
  observedTo: string | null;
}
```

The payload is:

```ts
interface VergilContributionV1 {
  schemaVersion: 1;
  exportedAt: string;
  source: "Vergil course search via Columbia Catalog Chrome extension";
  scan: null | {
    status: string;
    termCode: string;
    page: number;
    pages: number | null;
    scannedCourses: number;
    totalCourses: number | null;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    baselineSectionCount: number;
    sectionsCaptured: number;
  };
  sections: Array<{
    sectionKey: string;
    termCode: string;
    courseId: string;
    sectionCode: string;
    callNumber: string;
    meetings: Array<{
      weekday: "Su" | "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa";
      startMinute: number;
      endMinute: number;
      buildingName: string | null;
      room: string | null;
    }>;
    observedAt: string;
    provenance: "Vergil course search";
  }>;
}
```

`sections` contains only `scan.termCode`. The extension does not mix passive
captures from another term into a full-term contribution.

## Canonical forward path

1. A user starts **Refresh every course** for one Vergil term.
2. The extension observes only Vergil's successful course-search GET responses,
   sanitizes them, and completes the visible 100-course paginator.
3. The extension marks the payload ready only when page/course/section counts
   agree with the completed scan and the no-regression guard did not quarantine
   it.
4. The signed-in website retrieves the origin-pinned payload for review.
5. The server validates, hashes, audits, quarantines, and commits the payload in
   one database transaction.

Passive browsing remains useful for local freshness, but it is not a canonical
full-term database ingest.

## Required server checks

- Require a Columbia Catalog account; never accept an anonymous write.
- Enforce the exact schema and cap payload size, section count, meeting count,
  string lengths, and observation-time skew.
- Match sections by term + course + section and verify call numbers against the
  public Directory of Classes data already in the catalog. If Vergil preserves
  school-specific number padding that the Directory parser canonicalizes away,
  a fallback is allowed only when term + the Directory-unique call number +
  section code resolve one existing row. Keep the untouched Vergil identity in
  the audit record.
- Reject duplicate natural meeting keys.
- Treat `To be announced` as missing, not as a building or room.
- Quarantine any contribution that reduces meeting/location completeness for a
  section or whose aggregate coverage is unexpectedly smaller than the last
  accepted full-term refresh.
- Store a source label and observation time with every accepted meeting record.
- Rate-limit by authenticated account and hash the canonical payload for
  idempotency. Never trust the extension ID as authentication.
- Keep a reviewable ingest-run audit row and apply accepted writes in one
  transaction.

The current database writer must be extended before production submission. It
needs a Vergil-specific transactional RPC or equivalent server-only transaction
that records meeting source and observation time, matches the exact section ID
and call number, and quarantines unmatched or lower-quality records. Reusing
`ingest_subject_page` is unsafe because its payload and replacement semantics
belong to the Directory of Classes source.

No server component may request, receive, log, or store a Vergil/SAS token.
