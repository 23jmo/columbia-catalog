# Chrome Web Store listing

## Name

LionPlan Schedule Refresh

## Summary

Refresh LionPlan with sanitized course times and locations already loaded by Vergil.

## Detailed description

Keep Columbia course schedules current without sharing your Vergil login.

LionPlan Schedule Refresh observes only the public course-search results
that Vergil has already loaded in your browser. It extracts course identifiers,
call numbers, meeting days, times, locations, and an observation timestamp into
a sanitized local capture.

Use it in two ways:

- Browse Vergil normally and capture the course results you view.
- Choose Refresh every course to step through Vergil's visible all-course search
  for the active term, 100 courses at a time.

You can inspect counts, export JSON, clear everything immediately, or explicitly
enable a signed-in LionPlan page to review a sanitized, single-term
full-scan contribution. Passive or incomplete captures cannot be submitted.
Sharing is disabled by default.

The extension never reads passwords, bearer tokens, cookies, request headers,
planner data, registration actions, grades, holds, financial data, or personal
academic records. It never registers, drops, swaps, or waitlists a class. It
never sends its own request to a Columbia API.

## Category

Productivity

## Single purpose

Help keep LionPlan course meeting times and locations current by
capturing sanitized public course-search data already returned by Vergil.

## Permission justification

`storage` stores the sanitized capture for the current browser session and the
user's explicit contribution-sharing preference. No host permission, tabs
permission, cookie permission, webRequest permission, or debugger permission is
requested.

## Data disclosures

- Website content: yes — only the allowlisted course-search fields described above.
- Web history: no.
- Authentication information: no.
- Personally identifiable information: no.
- Personal communications: no.
- Financial, health, location, or personal academic data: no.
- Sale, advertising, or unrelated transfer: no.

## Required URLs

- Homepage: `https://www.lionplan.org`
- Privacy policy: `https://www.lionplan.org/privacy/extension`
- Contribution review: `https://www.lionplan.org/contribute/vergil`

The privacy-policy and contribution-review URLs must be implemented by the
website lane before submission for review.

## Reviewer instructions

1. Install the extension.
2. Sign in to `https://vergil.columbia.edu/vergil/` with a reviewer-controlled
   Columbia test account. We cannot provide or handle credentials.
3. Open Course Search and run any search. The toolbar popup should show captured
   section and meeting counts.
4. The full-term refresh is user-triggered and interacts only with the visible
   course-search paginator.
5. Enable Help keep the catalog current to test the origin-pinned review handoff.
6. Use Clear local data to remove the capture immediately.
