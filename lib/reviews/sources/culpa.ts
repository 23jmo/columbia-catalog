/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CULPA HTML ADAPTER — SUPERSEDED. Use `./culpa-api.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ **This adapter does not work against the live site and cannot be made to.**
 *
 * culpa.info is a Create React App SPA: the server returns `<div id="root">`
 * and a script tag, and every review is loaded client-side from a JSON API. The
 * selectors below were written without a fixture (see the note further down)
 * and have no rendered document to match against — every one of them returns
 * nothing. Confirmed by fetching the homepage on 2026-08-24.
 *
 * `./culpa-api.ts` talks to that JSON API instead and is what
 * `scripts/ingest-reviews.ts` constructs. This file is kept for its pacing
 * policy, user agent, and `normalizeCourseId`, which the API adapter imports —
 * and as the record of why the HTML path was abandoned.
 *
 * The original header follows, and its rules still bind the API adapter:
 *
 * CULPA (culpa.info) is Columbia's student-run course and professor review
 * site. It is the PRIMARY reputation source for this product: it is
 * Columbia-specific, written by Columbia students about Columbia courses, and
 * is materially more relevant than any national aggregator.
 *
 * **The intended path is a PARTNERSHIP, not a scrape.** CULPA is a small,
 * volunteer-run, student-funded site. A data-sharing agreement — a feed, a
 * dump, an API key, a co-branded integration — is the correct way to obtain
 * this corpus, and is the outcome this product is pursuing. This adapter
 * exists so that the rest of the pipeline (extraction, aggregation, coverage,
 * UI) can be built and tested against realistic CULPA-shaped data, and so that
 * a partnership feed can be dropped in behind the same interface on day one.
 *
 *   ⚠ **This adapter MUST NOT be run at volume without a partnership.**
 *
 * It is paced to a crawl by construction (see `CULPA_PACING`: one request per
 * ~8 seconds, at most 12 per run, at most 60 per hour) and those numbers are a
 * ceiling, not a target. Do not raise them. Do not parallelise it. Do not add
 * a "backfill everything" mode. If you need the whole corpus, that is exactly
 * the situation the partnership exists to solve — go get the agreement.
 *
 * If and when a partnership feed arrives, implement `ReviewSourceAdapter`
 * against it in a sibling file and swap the adapter used by the ingest lane.
 * Nothing downstream changes.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * On the parsing below
 * ───────────────────────────────────────────────────────────────────────────
 * We have no captured CULPA fixture to verify selectors against (the repo's
 * fixtures are all Columbia registrar/bulletin HTML). So:
 *
 *   · Every selector lives in `CULPA_SELECTORS`, one exported object, with
 *     ordered fallback lists. Updating this adapter for a CULPA redesign
 *     should be an edit to that object and nothing else.
 *   · The parser is defensive to the point of paranoia: every field is
 *     optional, nothing throws, and a review that yields only a body and a URL
 *     is still returned. Partial data beats an exception.
 *   · `parseCulpaReviewPage` is a pure function over an HTML string, so the
 *     moment a real fixture exists it can be pinned by a test with no network.
 */

import { parse, type HTMLElement } from "node-html-parser";

import type { ReviewRecord } from "../../types";
import {
  clampExcerpt,
  emptyResult,
  mergeResults,
  stableReviewId,
  toIsoDate,
  type PageFetcher,
  type RawReviewDocument,
  type ReviewFetchResult,
  type ReviewSourceAdapter,
} from "./contract";
import { Pacer, type PacerOptions, type PacingPolicy } from "./pacing";

// ---------------------------------------------------------------------------
// Pacing — a ceiling, not a target. See the header.
// ---------------------------------------------------------------------------

export const CULPA_BASE_URL = "https://culpa.info";

export const CULPA_PACING: PacingPolicy = {
  minIntervalMs: 8_000,
  jitterMs: 4_000,
  maxRequestsPerRun: 12,
  maxRequestsPerHour: 60,
};

/**
 * Identify ourselves honestly. A partnership conversation starts much better
 * when the other side can see who has been knocking and how to reach them.
 */
export const CULPA_USER_AGENT =
  "ColumbiaCatalog/0.1 (student course catalog; partnership inquiries welcome)";

// ---------------------------------------------------------------------------
// Selectors — the entire surface that a CULPA redesign can break.
// ---------------------------------------------------------------------------

/**
 * Ordered candidate selectors. The parser tries each in turn and uses the
 * first that matches; an empty match is a warning, never an error.
 *
 * Replace these wholesale when a real CULPA fixture is available. Nothing
 * outside this object encodes assumptions about CULPA's markup.
 */
export const CULPA_SELECTORS = {
  /** Container for one review. */
  reviewBlock: [
    "[data-testid='review']",
    ".review",
    "article.review",
    "li.review",
    "[class*='review-card']",
  ],
  /** The prose body of the review. */
  reviewBody: [
    "[data-testid='review-content']",
    ".review-content",
    ".review-body",
    ".content",
    "p",
  ],
  /** The posted date, ideally on a <time datetime="…">. */
  reviewDate: ["time[datetime]", "time", "[data-testid='review-date']", ".review-date", ".date"],
  /** A per-review permalink we can attribute back to. */
  reviewPermalink: ["a[href*='/review']", "a.permalink", "a[rel='bookmark']"],
  /** CULPA prints a separate workload block; we keep the raw text. */
  workload: ["[data-testid='workload']", ".workload", "[class*='workload']"],
  /** Instructor name on a professor page. */
  instructorName: ["[data-testid='professor-name']", "h1.professor-name", "h1"],
  /** Course title/code on a course page. */
  courseName: ["[data-testid='course-name']", "h1.course-name", "h1"],
  /** Per-review course link, present on professor pages. */
  reviewCourseLink: ["a[href*='/course']", ".review-course a", "[data-testid='review-course']"],
  /** Per-review instructor link, present on course pages. */
  reviewInstructorLink: [
    "a[href*='/professor']",
    ".review-professor a",
    "[data-testid='review-professor']",
  ],
  /** Search result rows, used to resolve a name/code to a CULPA page. */
  searchResultLink: ["[data-testid='search-result'] a", ".search-result a", "a[href*='/professor']"],
} as const;

/** URL builders, isolated for the same reason the selectors are. */
export const CULPA_ROUTES = {
  search: (query: string) => `${CULPA_BASE_URL}/search?entity=all&query=${encodeURIComponent(query)}`,
  professor: (slugOrId: string) => `${CULPA_BASE_URL}/professors/${encodeURIComponent(slugOrId)}`,
  course: (slugOrId: string) => `${CULPA_BASE_URL}/courses/${encodeURIComponent(slugOrId)}`,
} as const;

// ---------------------------------------------------------------------------
// Defensive DOM helpers
// ---------------------------------------------------------------------------

function firstMatch(root: HTMLElement, selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch {
      // An invalid selector must not take the run down.
    }
  }
  return null;
}

function allMatches(root: HTMLElement, selectors: readonly string[]): HTMLElement[] {
  for (const selector of selectors) {
    try {
      const found = root.querySelectorAll(selector);
      if (found.length > 0) return found;
    } catch {
      // Ignore and try the next candidate.
    }
  }
  return [];
}

function textOf(element: HTMLElement | null): string {
  if (!element) return "";
  try {
    return (element.structuredText || element.text || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function attrOf(element: HTMLElement | null, name: string): string | null {
  if (!element) return null;
  try {
    return element.getAttribute(name) ?? null;
  } catch {
    return null;
  }
}

function absoluteUrl(href: string | null, fallback: string): string {
  if (!href) return fallback;
  const trimmed = href.trim();
  if (trimmed.length === 0) return fallback;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${CULPA_BASE_URL}${trimmed}`;
  return `${CULPA_BASE_URL}/${trimmed}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface CulpaParseContext {
  /** The URL the HTML came from — used for attribution and permalink bases. */
  pageUrl: string;
  /** Course this page is scoped to, when known. Overridden per-review if the
   *  review itself names a different course. */
  courseId?: string | null;
  /** Instructor this page is scoped to, when known. */
  instructorName?: string | null;
}

/**
 * Parse one CULPA page into review records.
 *
 * Never throws. Malformed input yields `{ records: [], warnings: [...] }`.
 */
export function parseCulpaReviewPage(
  html: string,
  context: CulpaParseContext,
): ReviewFetchResult {
  const result = emptyResult();
  if (typeof html !== "string" || html.trim().length === 0) {
    result.warnings.push(`culpa: empty document at ${context.pageUrl}`);
    return result;
  }

  let root: HTMLElement;
  try {
    root = parse(html);
  } catch {
    result.warnings.push(`culpa: unparseable document at ${context.pageUrl}`);
    return result;
  }

  const pageInstructor =
    context.instructorName ?? nullIfEmpty(textOf(firstMatch(root, CULPA_SELECTORS.instructorName)));
  const pageCourseId =
    context.courseId ?? normalizeCourseId(textOf(firstMatch(root, CULPA_SELECTORS.courseName)));

  const blocks = allMatches(root, CULPA_SELECTORS.reviewBlock);
  if (blocks.length === 0) {
    result.warnings.push(
      `culpa: no review blocks matched at ${context.pageUrl} — selectors likely stale`,
    );
    return result;
  }

  for (const block of blocks) {
    const parsed = parseOneReviewBlock(block, context, pageCourseId, pageInstructor);
    if (!parsed) continue;
    result.records.push(parsed.record);
    result.documents.push(parsed.document);
  }

  if (result.records.length === 0) {
    result.warnings.push(
      `culpa: ${blocks.length} block(s) matched but none yielded a body at ${context.pageUrl}`,
    );
  }
  return result;
}

function parseOneReviewBlock(
  block: HTMLElement,
  context: CulpaParseContext,
  pageCourseId: string | null,
  pageInstructor: string | null,
): { record: ReviewRecord; document: RawReviewDocument } | null {
  try {
    const bodyElement = firstMatch(block, CULPA_SELECTORS.reviewBody);
    // Fall back to the whole block: a review with no recognisable body element
    // is still a review, and its text is still worth extracting from.
    const body = textOf(bodyElement) || textOf(block);
    const excerpt = clampExcerpt(body);
    if (!excerpt) return null;

    const dateElement = firstMatch(block, CULPA_SELECTORS.reviewDate);
    const postedAt =
      toIsoDate(attrOf(dateElement, "datetime")) ?? toIsoDate(textOf(dateElement)) ?? null;

    const permalinkElement = firstMatch(block, CULPA_SELECTORS.reviewPermalink);
    const url = absoluteUrl(attrOf(permalinkElement, "href"), context.pageUrl);

    const workloadText = textOf(firstMatch(block, CULPA_SELECTORS.workload));

    const reviewCourseId =
      normalizeCourseId(textOf(firstMatch(block, CULPA_SELECTORS.reviewCourseLink))) ?? pageCourseId;
    const reviewInstructor =
      nullIfEmpty(textOf(firstMatch(block, CULPA_SELECTORS.reviewInstructorLink))) ?? pageInstructor;

    const reviewId = stableReviewId(
      "culpa",
      url,
      attrOf(block, "id") ?? "",
      postedAt ?? "",
      excerpt.slice(0, 96),
    );

    const record: ReviewRecord = {
      reviewId,
      source: "culpa",
      courseId: reviewCourseId,
      instructorName: reviewInstructor,
      postedAt,
      url,
      excerpt,
      // Dimensions are filled in exactly once, by lib/reviews/extract.ts.
      workload: null,
      difficulty: null,
      teachingQuality: null,
      gradingFairness: null,
      sentiment: null,
      wouldTakeAgain: null,
    };

    const fields: Record<string, string> = {};
    if (workloadText) fields.workloadText = workloadText;
    fields.pageUrl = context.pageUrl;

    return { record, document: { reviewId, body, fields } };
  } catch {
    // One malformed block must never cost us the other forty.
    return null;
  }
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Pull a `Course.courseId`-shaped key out of free text.
 *
 * CULPA prints things like "COMS W4118 Operating Systems I". Our ids are
 * `${subjectCode}${number}${qualifier}` — "COMS4118W". Anything we cannot
 * confidently map becomes `null` rather than a guess; a review attached to the
 * wrong course is worse than a review attached to none.
 */
export function normalizeCourseId(text: string): string | null {
  if (!text) return null;
  const match = text
    .toUpperCase()
    .match(/\b([A-Z]{4})\s*([A-Z])?\s*(\d{4})\s*([A-Z])?\b/);
  if (!match) return null;
  const [, subject, leadingQualifier, number, trailingQualifier] = match;
  const qualifier = trailingQualifier ?? leadingQualifier ?? "";
  return `${subject}${number}${qualifier}`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface CulpaAdapterOptions {
  fetcher: PageFetcher;
  /** Overrides for tests; production should leave these alone. */
  pacing?: PacingPolicy;
  pacerOptions?: PacerOptions;
  /**
   * Resolves a course id or instructor name to CULPA page URLs. The default
   * uses CULPA's own search page. A partnership feed would replace this
   * entirely with an id mapping.
   */
  resolvePages?: (kind: "course" | "instructor", key: string) => Promise<string[]>;
  /** Hard cap on pages visited per lookup, independent of the pacer. */
  maxPagesPerLookup?: number;
}

export class CulpaAdapter implements ReviewSourceAdapter {
  readonly kind = "culpa" as const;

  private readonly fetcher: PageFetcher;
  private readonly pacer: Pacer;
  private readonly maxPagesPerLookup: number;
  private readonly resolvePages: (kind: "course" | "instructor", key: string) => Promise<string[]>;

  constructor(options: CulpaAdapterOptions) {
    this.fetcher = options.fetcher;
    this.pacer = new Pacer(options.pacing ?? CULPA_PACING, options.pacerOptions);
    this.maxPagesPerLookup = options.maxPagesPerLookup ?? 3;
    this.resolvePages = options.resolvePages ?? ((kind, key) => this.defaultResolvePages(kind, key));
  }

  async fetchForCourse(courseId: string): Promise<ReviewFetchResult> {
    return this.fetchScoped("course", courseId);
  }

  async fetchForInstructor(instructorName: string): Promise<ReviewFetchResult> {
    return this.fetchScoped("instructor", instructorName);
  }

  private async fetchScoped(kind: "course" | "instructor", key: string): Promise<ReviewFetchResult> {
    this.pacer.resetRun();
    const results: ReviewFetchResult[] = [];

    let urls: string[] = [];
    try {
      urls = await this.resolvePages(kind, key);
    } catch {
      const failed = emptyResult();
      failed.warnings.push(`culpa: could not resolve pages for ${kind} "${key}"`);
      return failed;
    }

    for (const url of urls.slice(0, this.maxPagesPerLookup)) {
      const allowed = await this.pacer.acquire();
      if (!allowed) {
        const stopped = emptyResult();
        stopped.warnings.push(
          `culpa: stopped early — ${this.pacer.exhaustionReason() ?? "pacing budget exhausted"}`,
        );
        results.push(stopped);
        break;
      }

      const page = await this.fetcher.get(url, {
        "user-agent": CULPA_USER_AGENT,
        accept: "text/html",
      });

      const fetched = emptyResult();
      fetched.pagesFetched = 1;
      results.push(fetched);

      if (page.status < 200 || page.status >= 300) {
        fetched.warnings.push(`culpa: HTTP ${page.status} for ${url}`);
        continue;
      }

      results.push(
        parseCulpaReviewPage(page.body, {
          pageUrl: url,
          courseId: kind === "course" ? key : null,
          instructorName: kind === "instructor" ? key : null,
        }),
      );
    }

    return mergeResults(...results);
  }

  /**
   * Resolve via CULPA's search page. Costs one paced request.
   *
   * Deliberately returns at most a couple of candidates: a wrong-but-plausible
   * professor page is a data-quality bug, and fanning out over search results
   * is exactly the "run it at volume" behaviour this file forbids.
   */
  private async defaultResolvePages(kind: "course" | "instructor", key: string): Promise<string[]> {
    const allowed = await this.pacer.acquire();
    if (!allowed) return [];

    const page = await this.fetcher.get(CULPA_ROUTES.search(key), {
      "user-agent": CULPA_USER_AGENT,
      accept: "text/html",
    });
    if (page.status < 200 || page.status >= 300) return [];

    let root: HTMLElement;
    try {
      root = parse(page.body);
    } catch {
      return [];
    }

    const wanted = kind === "course" ? "/course" : "/professor";
    const links = allMatches(root, CULPA_SELECTORS.searchResultLink)
      .map((element) => attrOf(element, "href"))
      .filter((href): href is string => typeof href === "string" && href.includes(wanted))
      .map((href) => absoluteUrl(href, CULPA_BASE_URL));

    return Array.from(new Set(links)).slice(0, 2);
  }
}
