/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CULPA ADAPTER — JSON API. Supersedes the HTML parser in `./culpa.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * culpa.info is a Create React App single-page app: the server returns a shell
 * (`<div id="root">`, `/static/js/main.<hash>.js`) and every review is fetched
 * client-side from a REST API at `https://culpa.info/api`. The HTML adapter in
 * `./culpa.ts` was written before anyone had seen a real page, and against that
 * shell it matches nothing — its selectors have no document to find.
 *
 * So this file talks to the API the app itself uses. That is strictly gentler
 * than scraping rendered HTML would be: one small JSON response per lookup, no
 * headless browser, no asset downloads, and the same pacing ceiling.
 *
 * ── Permission ─────────────────────────────────────────────────────────────
 *
 * Gated on `CULPA_PARTNER_OK=1`, unchanged. That variable asserts an EXTERNAL
 * fact — that a human confirmed we may fetch culpa.info — and no amount of code
 * here can establish it. `scripts/ingest-reviews.ts` will not construct this
 * adapter without it. Do not add a default-on path.
 *
 * Pacing stays at `CULPA_PACING` (one request per ~8s, 12 per run, 60 per
 * hour). Those numbers are a ceiling, not a target, and the fact that the JSON
 * API is cheap to call is not a reason to raise them.
 *
 * ── Endpoints used (all GET, all unauthenticated) ───────────────────────────
 *
 *   /api/professor/search?queryString=&maxResults=   name  → professor_id
 *   /api/course/search?queryString=&maxResults=      code  → course_id
 *   /api/review/professor/{professor_id}             reviews for a professor
 *   /api/review/course/{course_id}                   reviews for a course
 *
 * Write endpoints exist (`/api/review/new`, `/api/vote`, `/api/flag`, the
 * `/api/admin_page/*` family). We never call them. This adapter issues GET and
 * nothing else — the same read-only posture AGENTS.md requires toward Columbia.
 *
 * ── What the API gives us that prose never did ─────────────────────────────
 *
 * Every review carries a numeric `rating` (1–5) alongside its prose. That is
 * CULPA's own reviewer-assigned score for the professor, so it lands in
 * `teachingQuality` directly and does not need an LLM to infer it. The other
 * dimensions stay null here and are filled by `lib/reviews/extract.ts` at
 * ingest — a `workload` string of "A LOT. Like a lot (mainly assignments)" is
 * real signal but it is not a number, and this adapter does not guess.
 */

import type { ReviewRecord } from "../../types";
import {
  clampExcerpt,
  emptyResult,
  mergeResults,
  type PageFetcher,
  type RawReviewDocument,
  type ReviewFetchResult,
  type ReviewSourceAdapter,
} from "./contract";
import { CULPA_BASE_URL, CULPA_PACING, CULPA_USER_AGENT, normalizeCourseId } from "./culpa";
import { Pacer, type PacerOptions, type PacingPolicy } from "./pacing";

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const CULPA_API_BASE = `${CULPA_BASE_URL}/api`;

/** How many search hits to consider when resolving a name or code to an id. */
const SEARCH_RESULT_LIMIT = 8;

export const CULPA_API_ROUTES = {
  professorSearch: (query: string) =>
    `${CULPA_API_BASE}/professor/search?queryString=${encodeURIComponent(query)}&maxResults=${SEARCH_RESULT_LIMIT}`,
  courseSearch: (query: string) =>
    `${CULPA_API_BASE}/course/search?queryString=${encodeURIComponent(query)}&maxResults=${SEARCH_RESULT_LIMIT}`,
  reviewsForProfessor: (professorId: number, page: number) =>
    `${CULPA_API_BASE}/review/professor/${professorId}?page=${page}`,
  reviewsForCourse: (courseId: number, page: number) =>
    `${CULPA_API_BASE}/review/course/${courseId}?page=${page}`,
} as const;

/**
 * The review endpoints are PAGINATED — five per page, `?page=N`, 1-indexed, and
 * an empty `reviews` array past the end. `number_of_reviews` is the true total.
 *
 * This is worth stating loudly because the failure is silent: page 1 of a
 * professor with 18 reviews returns a perfectly well-formed payload containing
 * five of them, and nothing in the response says it is partial. An adapter that
 * fetches once looks like it worked and quietly stores 28% of the corpus.
 */
const REVIEWS_PER_PAGE = 5;

/** Refuse to walk forever if the API stops honouring `number_of_reviews`. */
const MAX_REVIEW_PAGES = 40;

/**
 * Public pages a review can be attributed back to.
 *
 * CULPA has no per-review permalink — its router exposes `/professor/:id` and
 * `/course/:id` and nothing finer — so a record's `url` points at the page the
 * review is displayed on. Every record must carry one: attribution is not
 * optional, and a record we cannot link back to has no business being stored.
 */
export const CULPA_PAGE_ROUTES = {
  professor: (professorId: number) => `${CULPA_BASE_URL}/professor/${professorId}`,
  course: (courseId: number) => `${CULPA_BASE_URL}/course/${courseId}`,
} as const;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------
//
// Declared as `unknown`-tolerant readers rather than trusted interfaces. The
// shapes below are what culpa.info returned on 2026-08-24; every field is read
// through a guard so a schema change degrades to a warning instead of a crash.

export interface CulpaProfessorHeader {
  professor_id: number;
  first_name: string | null;
  last_name: string | null;
  uni: string | null;
}

export interface CulpaCourseHeader {
  course_id: number;
  course_code: string | null;
  course_name: string | null;
}

export interface CulpaReview {
  review_id: number;
  content: string;
  rating: number | null;
  workload: string | null;
  submission_date: string | null;
  agree_count: number | null;
  disagree_count: number | null;
  funny_count: number | null;
  course_header: CulpaCourseHeader | null;
  professor_header: CulpaProfessorHeader | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Parse a JSON body without throwing. Malformed input is a warning, not a crash. */
export function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function readProfessorHeader(value: unknown): CulpaProfessorHeader | null {
  if (!isRecord(value)) return null;
  const professorId = readNumber(value.professor_id);
  if (professorId === null) return null;
  return {
    professor_id: professorId,
    first_name: readString(value.first_name),
    last_name: readString(value.last_name),
    uni: readString(value.uni),
  };
}

function readCourseHeader(value: unknown): CulpaCourseHeader | null {
  if (!isRecord(value)) return null;
  const courseId = readNumber(value.course_id);
  if (courseId === null) return null;
  return {
    course_id: courseId,
    course_code: readString(value.course_code),
    course_name: readString(value.course_name),
  };
}

export function readReview(value: unknown): CulpaReview | null {
  if (!isRecord(value)) return null;
  const reviewId = readNumber(value.review_id);
  const content = readString(value.content);
  // A review with no id cannot be deduplicated and one with no prose carries
  // nothing the extractor can read. Either way it is not worth storing.
  if (reviewId === null || content === null) return null;
  return {
    review_id: reviewId,
    content,
    rating: readNumber(value.rating),
    workload: readString(value.workload),
    submission_date: readString(value.submission_date),
    agree_count: readNumber(value.agree_count),
    disagree_count: readNumber(value.disagree_count),
    funny_count: readNumber(value.funny_count),
    course_header: readCourseHeader(value.course_header),
    professor_header: readProfessorHeader(value.professor_header),
  };
}

// ---------------------------------------------------------------------------
// Name and code resolution
// ---------------------------------------------------------------------------

export function fullName(header: CulpaProfessorHeader): string | null {
  const parts = [header.first_name, header.last_name].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Choose the professor a name actually refers to.
 *
 * **Relevance order is not good enough, and this is the whole reason this
 * function exists.** Searching "Jae Woo Lee" returns a `Jae Woo` (a name-split
 * artifact with no UNI) ranked ABOVE the real `Jae Lee` whose UNI is `jwl3`.
 * Taking the top hit would file one professor's reviews under another
 * professor's name — the exact defect `components/instructor/rating-hero.tsx`
 * records having shipped once with the RMP matcher, where a stranger's 4.8
 * appeared on the wrong page.
 *
 * So: an exact normalised full-name match wins outright. Failing that, we
 * require the surname to match and the given name to be a prefix of, or equal
 * to, the candidate's — which accepts "Jae Woo Lee" → "Jae Lee" but rejects
 * "Jae Woo" (no surname match). If nothing clears that bar we return null and
 * the caller records a warning. **No match is a correct answer; a wrong match
 * is a data-integrity bug we cannot see from here.**
 */
export function chooseProfessor(
  wanted: string,
  candidates: CulpaProfessorHeader[],
): CulpaProfessorHeader | null {
  const target = normalizeName(wanted);
  if (target.length === 0 || candidates.length === 0) return null;

  const exact = candidates.find((candidate) => {
    const name = fullName(candidate);
    return name !== null && normalizeName(name) === target;
  });
  if (exact) return exact;

  const targetParts = target.split(" ");
  if (targetParts.length < 2) return null;
  const targetSurname = targetParts[targetParts.length - 1];
  const targetGiven = targetParts.slice(0, -1).join(" ");

  /*
   * Filter on surname AND given name together, then demand uniqueness.
   *
   * Doing it in two stages — "exactly one surname match, then check the given
   * name" — is too strict on real data: searching "Jae Woo Lee" returns both
   * `Jae Lee` and `Seok-Woo Lee`, so a surname-uniqueness test bails out even
   * though only one of them can possibly be the person. Uniqueness has to be
   * measured over candidates that already passed the given-name test.
   */
  const compatible = candidates.filter((candidate) => {
    if (candidate.last_name === null) return false;
    if (normalizeName(candidate.last_name) !== targetSurname) return false;
    const candidateGiven = candidate.first_name ? normalizeName(candidate.first_name) : "";
    if (candidateGiven.length === 0) return false;
    return (
      targetGiven === candidateGiven ||
      targetGiven.startsWith(`${candidateGiven} `) ||
      candidateGiven.startsWith(`${targetGiven} `)
    );
  });

  // Two people who both fit the name is exactly when a guess does damage.
  return compatible.length === 1 ? compatible[0] : null;
}

/**
 * Choose the CULPA course whose code is the one we asked about.
 *
 * Unlike names, this one is decidable: both sides normalise to our own courseId
 * form via `normalizeCourseId`, so `COMS W4118` and `COMS4118W` compare equal.
 * A search for `COMS W4118` also returns `EAAS W4118` and `COMS W3134`, so
 * relevance order is again untrustworthy — but here we can simply demand the
 * codes match and take no hit at all when none does.
 */
export function chooseCourse(
  wantedCourseId: string,
  candidates: CulpaCourseHeader[],
): CulpaCourseHeader | null {
  const target = normalizeCourseId(wantedCourseId);
  if (target === null) return null;
  return (
    candidates.find((candidate) => {
      const code = candidate.course_code;
      return code !== null && normalizeCourseId(code) === target;
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Record mapping
// ---------------------------------------------------------------------------

export interface CulpaMapContext {
  /** Page the review is attributed back to. */
  pageUrl: string;
  /** Known when we asked by instructor; the review may still name its own. */
  instructorName?: string | null;
  /** Known when we asked by course. */
  courseId?: string | null;
}

/**
 * One API review → one `ReviewRecord` plus its raw document.
 *
 * `reviewId` is built from CULPA's own `review_id` rather than a content hash,
 * so re-ingesting an edited review updates the row instead of duplicating it.
 */
export function toReviewRecord(
  review: CulpaReview,
  context: CulpaMapContext,
): { record: ReviewRecord; document: RawReviewDocument } {
  const reviewId = `culpa:${review.review_id}`;

  const instructorName =
    (review.professor_header ? fullName(review.professor_header) : null) ??
    context.instructorName ??
    null;

  const courseId =
    (review.course_header?.course_code
      ? normalizeCourseId(review.course_header.course_code)
      : null) ??
    context.courseId ??
    null;

  /*
   * `submission_date` arrives as a naive local timestamp ("2020-01-27T02:19:07")
   * with no zone. Appending Z rather than letting `new Date` guess keeps the
   * value stable regardless of where ingest runs — a date range printed in the
   * UI must not shift because the operator moved timezone.
   */
  const postedAt = review.submission_date
    ? toUtcIsoDate(review.submission_date)
    : null;

  const fields: Record<string, string> = {};
  if (review.workload) fields.workload = review.workload;
  if (review.rating !== null) fields.rating = String(review.rating);
  if (review.agree_count !== null) fields.agreeCount = String(review.agree_count);
  if (review.disagree_count !== null) fields.disagreeCount = String(review.disagree_count);
  if (review.funny_count !== null) fields.funnyCount = String(review.funny_count);
  if (review.course_header?.course_name) fields.courseName = review.course_header.course_name;
  if (review.professor_header?.uni) fields.uni = review.professor_header.uni;

  return {
    record: {
      reviewId,
      source: "culpa",
      courseId,
      instructorName,
      postedAt,
      url: context.pageUrl,
      excerpt: clampExcerpt(review.content),
      // CULPA's own 1–5 reviewer score for the professor. Every other dimension
      // is left for `lib/reviews/extract.ts` — see this file's header.
      workload: null,
      difficulty: null,
      teachingQuality: inRatingRange(review.rating) ? review.rating : null,
      gradingFairness: null,
      sentiment: null,
      wouldTakeAgain: null,
    },
    document: {
      reviewId,
      body: review.content,
      fields,
    },
  };
}

function inRatingRange(rating: number | null): rating is number {
  return rating !== null && rating >= 1 && rating <= 5;
}

/** Naive timestamp → ISO, read as UTC rather than as the operator's zone. */
export function toUtcIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const parsed = new Date(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export interface ParsedReviewPage extends ReviewFetchResult {
  /** `number_of_reviews` — the total across all pages, not this page's count. */
  totalReviews: number | null;
  /** False when this page came back empty, i.e. we have walked off the end. */
  hasRows: boolean;
}

/**
 * Parse one page of a `/api/review/{course,professor}/{id}` payload.
 *
 * Pure over a JSON string so a captured fixture pins it with no network.
 *
 * `reviews_spotlight` is deliberately ignored. It is an object (not an array)
 * holding `agreed_review` / `controversial_review` — CULPA's "most agreed with"
 * and "most divisive" picks. Those are not extra reviews: each one also appears
 * in the paginated `reviews` stream, just not necessarily on page 1. Merging it
 * would double-count once pagination reaches the page it lives on, and
 * `mergeResults` only dedupes by `reviewId` within a single call.
 */
export function parseReviewsPage(body: string, context: CulpaMapContext): ParsedReviewPage {
  const result: ParsedReviewPage = { ...emptyResult(), totalReviews: null, hasRows: false };
  const payload = parseJsonBody(body);
  if (!isRecord(payload)) {
    result.warnings.push(`culpa-api: unparseable payload from ${context.pageUrl}`);
    return result;
  }

  result.totalReviews = readNumber(payload.number_of_reviews);

  const rawReviews = payload.reviews;
  if (!Array.isArray(rawReviews)) {
    result.warnings.push(`culpa-api: no reviews array at ${context.pageUrl}`);
    return result;
  }
  result.hasRows = rawReviews.length > 0;

  let skipped = 0;
  for (const raw of rawReviews) {
    const review = readReview(raw);
    if (!review) {
      skipped += 1;
      continue;
    }
    const { record, document } = toReviewRecord(review, context);
    result.records.push(record);
    result.documents.push(document);
  }

  if (skipped > 0) {
    result.warnings.push(`culpa-api: skipped ${skipped} malformed review(s) at ${context.pageUrl}`);
  }
  return result;
}

/** Parse a `/api/{professor,course}/search` payload into headers. */
export function parseProfessorSearch(body: string): CulpaProfessorHeader[] {
  const payload = parseJsonBody(body);
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => (isRecord(entry) ? readProfessorHeader(entry.professor_header) : null))
    .filter((header): header is CulpaProfessorHeader => header !== null);
}

export function parseCourseSearch(body: string): CulpaCourseHeader[] {
  const payload = parseJsonBody(body);
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => (isRecord(entry) ? readCourseHeader(entry.course_header) : null))
    .filter((header): header is CulpaCourseHeader => header !== null);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface CulpaApiAdapterOptions {
  fetcher: PageFetcher;
  /** Overrides for tests; production should leave these alone. */
  pacing?: PacingPolicy;
  pacerOptions?: PacerOptions;
}

type CulpaApiResponse =
  | { ok: true; body: string; result: ReviewFetchResult; pacingExhausted: false }
  | { ok: false; body: null; result: ReviewFetchResult; pacingExhausted: boolean };

/**
 * One lookup costs 1 search request plus ⌈reviews / 5⌉ page requests.
 *
 * Every one of them goes through the pacer, so a run's budget is spent
 * honestly — a professor with 40 reviews is charged nine requests, not one, and
 * the run stops at the ceiling rather than borrowing against it. That makes
 * `maxRequestsPerRun: 12` roughly two well-reviewed professors per run, which
 * is the intended shape: ingest is an operator action repeated over time, not a
 * backfill sprint.
 */
export class CulpaApiAdapter implements ReviewSourceAdapter {
  readonly kind = "culpa" as const;

  private readonly fetcher: PageFetcher;
  private readonly pacer: Pacer;

  constructor(options: CulpaApiAdapterOptions) {
    this.fetcher = options.fetcher;
    this.pacer = new Pacer(options.pacing ?? CULPA_PACING, options.pacerOptions);
  }

  async fetchForCourse(courseId: string): Promise<ReviewFetchResult> {
    const normalized = normalizeCourseId(courseId);
    if (normalized === null) {
      const result = emptyResult();
      result.warnings.push(`culpa-api: "${courseId}" is not a course code`);
      return result;
    }

    const search = await this.getJson(CULPA_API_ROUTES.courseSearch(courseId));
    if (!search.ok) return search.result;

    const match = chooseCourse(normalized, parseCourseSearch(search.body));
    if (!match) {
      const result = search.result;
      result.warnings.push(`culpa-api: no CULPA course matched ${normalized}`);
      return result;
    }

    const pageUrl = CULPA_PAGE_ROUTES.course(match.course_id);
    const walked = await this.walkReviewPages(
      (page) => CULPA_API_ROUTES.reviewsForCourse(match.course_id, page),
      { pageUrl, courseId: normalized },
    );
    return mergeResults(search.result, walked);
  }

  async fetchForInstructor(instructorName: string): Promise<ReviewFetchResult> {
    const wanted = instructorName.trim();
    if (wanted.length === 0) {
      const result = emptyResult();
      result.warnings.push("culpa-api: empty instructor name");
      return result;
    }

    const search = await this.getJson(CULPA_API_ROUTES.professorSearch(wanted));
    if (!search.ok) return search.result;

    const match = chooseProfessor(wanted, parseProfessorSearch(search.body));
    if (!match) {
      const result = search.result;
      // Deliberately not "no reviews" — we did not fail to find reviews, we
      // declined to guess which professor was meant. Those are different facts
      // and the operator needs to be able to tell them apart.
      result.warnings.push(`culpa-api: no confident CULPA professor match for "${wanted}"`);
      return result;
    }

    const pageUrl = CULPA_PAGE_ROUTES.professor(match.professor_id);
    const walked = await this.walkReviewPages(
      (page) => CULPA_API_ROUTES.reviewsForProfessor(match.professor_id, page),
      { pageUrl, instructorName: fullName(match) ?? wanted },
    );
    return mergeResults(search.result, walked);
  }

  /**
   * Walk `?page=1,2,3…` until the corpus is exhausted.
   *
   * Stops on: an empty page, the total reported by `number_of_reviews`, a
   * transport error, `MAX_REVIEW_PAGES`, or the pacer refusing a slot.
   *
   * **A short walk always warns.** The pacing ceiling is the expected reason a
   * run ends early, and when it does we have a partial corpus for that subject —
   * which must be visible to the operator, because storing 5 of 18 reviews and
   * reporting success would put a confidently-wrong aggregate on a professor's
   * page. `lib/reviews/aggregate.ts` prints sample size for the same reason:
   * downstream honesty depends on this number being right.
   */
  private async walkReviewPages(
    urlForPage: (page: number) => string,
    context: CulpaMapContext,
  ): Promise<ReviewFetchResult> {
    const pages: ReviewFetchResult[] = [];
    const seenReviewIds = new Set<string>();
    let collected = 0;
    let expectedTotal: number | null = null;
    let stoppedEarly: string | null = null;

    for (let page = 1; page <= MAX_REVIEW_PAGES; page += 1) {
      const response = await this.getJson(urlForPage(page));
      pages.push(response.result);
      if (!response.ok) {
        stoppedEarly = response.pacingExhausted ? "pacing ceiling reached" : "request failed";
        break;
      }

      const parsed = parseReviewsPage(response.body, context);
      pages.push(parsed);
      if (parsed.totalReviews !== null) expectedTotal = parsed.totalReviews;

      // Dedupe across pages: `mergeResults` only dedupes within one call, and a
      // review that shifts pages between requests would otherwise appear twice.
      for (const record of parsed.records) {
        if (!seenReviewIds.has(record.reviewId)) {
          seenReviewIds.add(record.reviewId);
          collected += 1;
        }
      }

      if (!parsed.hasRows) break;
      if (expectedTotal !== null && collected >= expectedTotal) break;
      if (parsed.records.length < REVIEWS_PER_PAGE && parsed.totalReviews === null) break;
      if (page === MAX_REVIEW_PAGES) stoppedEarly = "page limit reached";
    }

    const merged = mergeResults(...pages);
    if (expectedTotal !== null && collected < expectedTotal) {
      merged.warnings.push(
        `culpa-api: PARTIAL — collected ${collected} of ${expectedTotal} reviews for ${context.pageUrl}` +
          (stoppedEarly ? ` (${stoppedEarly})` : ""),
      );
    }
    return merged;
  }

  /**
   * One paced GET. Never throws: a refused slot, a non-2xx, or a transport
   * failure all come back as `ok: false` with a warning already recorded.
   *
   * `pacingExhausted` distinguishes "we ran out of budget" from "the request
   * failed", because the caller reports those differently — the first means the
   * corpus is partial and a later run can finish it, the second means something
   * is wrong.
   */
  private async getJson(url: string): Promise<CulpaApiResponse> {
    const result = emptyResult();

    const allowed = await this.pacer.acquire();
    if (!allowed) {
      result.warnings.push("culpa-api: pacing ceiling reached, stopping this run");
      return { ok: false, body: null, result, pacingExhausted: true };
    }

    let page;
    try {
      page = await this.fetcher.get(url, {
        "User-Agent": CULPA_USER_AGENT,
        Accept: "application/json",
      });
    } catch {
      result.warnings.push(`culpa-api: transport failure for ${url}`);
      return { ok: false, body: null, result, pacingExhausted: false };
    }

    result.pagesFetched = 1;
    if (page.status < 200 || page.status >= 300) {
      result.warnings.push(`culpa-api: HTTP ${page.status} for ${url}`);
      return { ok: false, body: null, result, pacingExhausted: false };
    }
    return { ok: true, body: page.body, result, pacingExhausted: false };
  }
}
