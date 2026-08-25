/**
 * LionPlan — Reddit review source.
 *
 * Reddit is a SECONDARY source (CULPA is primary). Its value is coverage of
 * the long tail: courses nobody wrote a CULPA review for still get discussed
 * in r/columbia every registration season.
 *
 * **Official API only.** Every request here goes through OAuth against
 * `oauth.reddit.com` with credentials from the environment. We do not scrape
 * old.reddit HTML, we do not use unauthenticated `.json` endpoints, and we do
 * not route around rate limits. Reddit's API terms are the whole reason this
 * source is usable at all, and an HTML scraper would forfeit that.
 *
 * Required environment (see `readRedditCredentialsFromEnv`):
 *
 *   REDDIT_CLIENT_ID       — app id from https://www.reddit.com/prefs/apps
 *   REDDIT_CLIENT_SECRET   — app secret
 *   REDDIT_USER_AGENT      — e.g. "web:lionplan:v0.1 (by /u/yourname)"
 *
 * Optional, and only for a "script"-type app that must act as a user:
 *
 *   REDDIT_USERNAME
 *   REDDIT_PASSWORD
 *
 * With just the id/secret pair we use the `client_credentials` grant, which is
 * app-only and is all that search requires. Nothing here throws at import
 * time when the variables are missing: `readRedditCredentialsFromEnv` returns
 * `null` and the ingest lane skips the source.
 */

import type { ReviewRecord } from "../../types";
import {
  clampExcerpt,
  emptyResult,
  mergeResults,
  toIsoDate,
  type ReviewFetchResult,
  type ReviewSourceAdapter,
} from "./contract";
import { Pacer, type PacerOptions, type PacingPolicy } from "./pacing";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
export const REDDIT_API_BASE = "https://oauth.reddit.com";

/**
 * Subreddits searched for course and instructor chatter.
 *
 * Kept short on purpose: every extra subreddit multiplies the request count
 * and dilutes precision. r/columbia is the main one; Barnard has its own.
 */
export const DEFAULT_SUBREDDITS = ["columbia", "barnard"] as const;

/**
 * Reddit permits 100 requests/minute averaged over 10 minutes for OAuth
 * clients. We sit far under that — review ingest is a background job with no
 * deadline, and being a quiet client is worth more than being a fast one.
 */
export const REDDIT_PACING: PacingPolicy = {
  minIntervalMs: 1_200,
  jitterMs: 400,
  maxRequestsPerRun: 24,
  maxRequestsPerHour: 600,
};

/** Posts shorter than this are almost always "does anyone have notes" noise. */
export const MIN_BODY_CHARS = 40;

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  /** Present only for password-grant ("script") apps. */
  username?: string;
  password?: string;
}

/**
 * Read credentials from the environment.
 *
 * Returns `null` — never throws — when the required variables are absent, so
 * that importing this module in an environment without Reddit configured (a
 * test run, a preview deploy, a contributor's laptop) is harmless.
 */
export function readRedditCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): RedditCredentials | null {
  const clientId = env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const userAgent =
    env.REDDIT_USER_AGENT?.trim() || "web:lionplan:v0.1 (LionPlan review ingest)";
  const username = env.REDDIT_USERNAME?.trim();
  const password = env.REDDIT_PASSWORD?.trim();

  return {
    clientId,
    clientSecret,
    userAgent,
    ...(username && password ? { username, password } : {}),
  };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  // `btoa` exists in Node 18+ and in the edge runtime; Buffer does not exist in
  // the latter. Prefer the universal one.
  const encoded =
    typeof btoa === "function"
      ? btoa(raw)
      : Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface RedditHttpResponse {
  status: number;
  body: string;
}

/** Injected so tests never touch the network. */
export interface RedditTransport {
  request(
    url: string,
    init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string },
  ): Promise<RedditHttpResponse>;
}

export function createFetchTransport(timeoutMs = 10_000): RedditTransport {
  return {
    async request(url, init) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal: controller.signal,
          cache: "no-store",
        });
        return { status: response.status, body: await response.text() };
      } catch {
        return { status: 0, body: "" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// OAuth client-credentials flow
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  /** Epoch millis. */
  expiresAt: number;
}

/** Refresh this many ms before the token actually expires. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class RedditClient {
  private readonly credentials: RedditCredentials;
  private readonly transport: RedditTransport;
  private readonly pacer: Pacer;
  private readonly now: () => number;
  private token: CachedToken | null = null;
  private inFlightToken: Promise<string | null> | null = null;

  constructor(
    credentials: RedditCredentials,
    options: {
      transport?: RedditTransport;
      pacing?: PacingPolicy;
      pacerOptions?: PacerOptions;
      now?: () => number;
    } = {},
  ) {
    this.credentials = credentials;
    this.transport = options.transport ?? createFetchTransport();
    this.pacer = new Pacer(options.pacing ?? REDDIT_PACING, options.pacerOptions);
    this.now = options.now ?? Date.now;
  }

  resetRun(): void {
    this.pacer.resetRun();
  }

  pacingExhaustionReason(): string | null {
    return this.pacer.exhaustionReason();
  }

  /**
   * Obtain (and cache) an app access token.
   *
   * Two grants, chosen by which env vars are present:
   *   · `password` — for a "script" app that must act as a specific user.
   *   · `client_credentials` — app-only, which is all search needs.
   *
   * Returns `null` on any failure. Callers degrade to "no Reddit reviews".
   */
  async getAccessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return this.token.accessToken;
    }
    // Collapse concurrent refreshes so a burst of lookups mints one token.
    if (this.inFlightToken) return this.inFlightToken;

    this.inFlightToken = this.requestAccessToken().finally(() => {
      this.inFlightToken = null;
    });
    return this.inFlightToken;
  }

  private async requestAccessToken(): Promise<string | null> {
    const { clientId, clientSecret, userAgent, username, password } = this.credentials;

    const form = new URLSearchParams();
    if (username && password) {
      form.set("grant_type", "password");
      form.set("username", username);
      form.set("password", password);
    } else {
      form.set("grant_type", "client_credentials");
    }

    const response = await this.transport.request(REDDIT_TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(clientId, clientSecret),
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent,
      },
      body: form.toString(),
    });

    if (response.status !== 200) return null;

    try {
      const payload = JSON.parse(response.body) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
        return null;
      }
      const expiresInSeconds =
        typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;
      this.token = {
        accessToken: payload.access_token,
        expiresAt: this.now() + expiresInSeconds * 1000,
      };
      return this.token.accessToken;
    } catch {
      return null;
    }
  }

  /** One authenticated, paced GET against the OAuth host. */
  async authorizedGet(path: string): Promise<RedditHttpResponse | null> {
    const allowed = await this.pacer.acquire();
    if (!allowed) return null;

    const accessToken = await this.getAccessToken();
    if (!accessToken) return null;

    return this.transport.request(`${REDDIT_API_BASE}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": this.credentials.userAgent,
        accept: "application/json",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** The subset of a Reddit link we care about. */
interface RedditLink {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  subreddit: string;
  score: number;
  num_comments: number;
}

function parseListing(body: string): RedditLink[] {
  try {
    const payload = JSON.parse(body) as {
      data?: { children?: Array<{ kind?: string; data?: Partial<RedditLink> }> };
    };
    const children = payload.data?.children;
    if (!Array.isArray(children)) return [];
    const links: RedditLink[] = [];
    for (const child of children) {
      const data = child?.data;
      if (!data || typeof data.id !== "string" || typeof data.permalink !== "string") continue;
      links.push({
        id: data.id,
        title: typeof data.title === "string" ? data.title : "",
        selftext: typeof data.selftext === "string" ? data.selftext : "",
        permalink: data.permalink,
        created_utc: typeof data.created_utc === "number" ? data.created_utc : 0,
        subreddit: typeof data.subreddit === "string" ? data.subreddit : "",
        score: typeof data.score === "number" ? data.score : 0,
        num_comments: typeof data.num_comments === "number" ? data.num_comments : 0,
      });
    }
    return links;
  } catch {
    return [];
  }
}

/**
 * Query strings for a course id.
 *
 * Students write "COMS 4118", "COMS4118", and "4118" interchangeably, so we
 * search the two unambiguous spellings and let the relevance gate below throw
 * out anything that does not actually mention the course.
 */
export function courseQueryVariants(courseId: string): string[] {
  const match = courseId.toUpperCase().match(/^([A-Z]{4})(\d{4})([A-Z]?)$/);
  if (!match) return [courseId];
  const [, subject, number] = match;
  return [`"${subject} ${number}"`, `"${subject}${number}"`];
}

/** Instructor queries are quoted so Reddit does not split the name. */
export function instructorQueryVariants(instructorName: string): string[] {
  const cleaned = instructorName.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return [];
  const parts = cleaned.split(" ");
  const surname = parts[parts.length - 1];
  const variants = [`"${cleaned}"`];
  // A bare surname is only specific enough when it is reasonably distinctive.
  if (surname.length >= 6 && parts.length > 1) variants.push(`"${surname}" professor`);
  return variants;
}

/**
 * Does this post actually talk about what we searched for?
 *
 * Reddit's relevance search is generous; without this gate a search for
 * "COMS 4118" happily returns a thread about housing. We require a literal
 * mention of one of the needles in title or body.
 */
export function mentionsAny(text: string, needles: string[]): boolean {
  const haystack = text.toLowerCase();
  return needles.some((needle) => {
    const cleaned = needle.replace(/"/g, "").toLowerCase().trim();
    return cleaned.length > 0 && haystack.includes(cleaned);
  });
}

function linkToRecord(
  link: RedditLink,
  scope: { courseId: string | null; instructorName: string | null },
): ReviewRecord | null {
  const body = `${link.title}\n\n${link.selftext}`.trim();
  const excerpt = clampExcerpt(body);
  if (!excerpt || excerpt.length < MIN_BODY_CHARS) return null;

  return {
    // Reddit ids are already globally unique and stable; no hashing needed.
    reviewId: `reddit:t3_${link.id}`,
    source: "reddit",
    courseId: scope.courseId,
    instructorName: scope.instructorName,
    postedAt: toIsoDate(link.created_utc),
    url: `https://www.reddit.com${link.permalink}`,
    excerpt,
    // Filled in exactly once by lib/reviews/extract.ts.
    workload: null,
    difficulty: null,
    teachingQuality: null,
    gradingFairness: null,
    sentiment: null,
    wouldTakeAgain: null,
  };
}

export interface RedditAdapterOptions {
  credentials?: RedditCredentials | null;
  client?: RedditClient;
  subreddits?: readonly string[];
  /** Results requested per query. Reddit caps this at 100. */
  limit?: number;
}

export class RedditAdapter implements ReviewSourceAdapter {
  readonly kind = "reddit" as const;

  private readonly client: RedditClient | null;
  private readonly subreddits: readonly string[];
  private readonly limit: number;

  constructor(options: RedditAdapterOptions = {}) {
    const credentials =
      options.credentials === undefined ? readRedditCredentialsFromEnv() : options.credentials;
    this.client = options.client ?? (credentials ? new RedditClient(credentials) : null);
    this.subreddits = options.subreddits ?? DEFAULT_SUBREDDITS;
    this.limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  }

  /** True when credentials were present. The ingest lane skips us otherwise. */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  async fetchForCourse(courseId: string): Promise<ReviewFetchResult> {
    return this.run(courseQueryVariants(courseId), { courseId, instructorName: null });
  }

  async fetchForInstructor(instructorName: string): Promise<ReviewFetchResult> {
    return this.run(instructorQueryVariants(instructorName), {
      courseId: null,
      instructorName,
    });
  }

  private async run(
    queries: string[],
    scope: { courseId: string | null; instructorName: string | null },
  ): Promise<ReviewFetchResult> {
    if (!this.client) {
      const skipped = emptyResult();
      skipped.warnings.push(
        "reddit: no credentials — set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to enable this source",
      );
      return skipped;
    }
    if (queries.length === 0) return emptyResult();

    this.client.resetRun();
    const results: ReviewFetchResult[] = [];
    const subredditPath = this.subreddits.join("+");

    for (const query of queries) {
      const params = new URLSearchParams({
        q: query,
        restrict_sr: "on",
        sort: "relevance",
        t: "all",
        type: "link",
        limit: String(this.limit),
        raw_json: "1",
      });
      const response = await this.client.authorizedGet(
        `/r/${subredditPath}/search?${params.toString()}`,
      );

      const page = emptyResult();
      results.push(page);

      if (!response) {
        page.warnings.push(
          `reddit: request not issued for ${query} — ${
            this.client.pacingExhaustionReason() ?? "no access token"
          }`,
        );
        break;
      }

      page.pagesFetched = 1;
      if (response.status !== 200) {
        page.warnings.push(`reddit: HTTP ${response.status} for query ${query}`);
        continue;
      }

      for (const link of parseListing(response.body)) {
        if (!mentionsAny(`${link.title} ${link.selftext}`, queries)) continue;
        const record = linkToRecord(link, scope);
        if (!record) continue;
        page.records.push(record);
        page.documents.push({
          reviewId: record.reviewId,
          body: `${link.title}\n\n${link.selftext}`,
          fields: {
            subreddit: link.subreddit,
            score: String(link.score),
            comments: String(link.num_comments),
          },
        });
      }
    }

    return mergeResults(...results);
  }
}
