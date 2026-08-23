/**
 * Crawler runtime bootstrap.
 *
 * `lib/crawler/contracts.ts` resolves its dependencies through a registry so the
 * crawler lane never imports `lib/db/**` or `lib/ingest/**` directly. Something
 * has to close that loop, and this is it: the single place where the three
 * concrete implementations meet.
 *
 * Until this file existed, `tryGetCrawlerRuntime()` returned null in production
 * and every route under `/api/crawl/*` answered 503 — the crawler was fully
 * written, fully tested, and structurally unable to run.
 *
 * ── Import this for its side effect ────────────────────────────────────────
 *
 *     import "@/lib/db/crawler-runtime";
 *
 * at the top of each crawl route. Module evaluation is idempotent and cached
 * per server instance, so repeated imports register once.
 *
 * ── Why it is lazy ─────────────────────────────────────────────────────────
 *
 * The store and writer both demand a service-role client, which throws when the
 * environment is absent. Constructing them at module scope would make importing
 * this file fail the build on any machine without `.env.local` — including CI
 * and `next build`. So registration is deferred to first use and reports its
 * failure as a 503 from the route, which is what the routes already expect.
 */

import {
  registerCrawlerRuntime,
  tryGetCrawlerRuntime,
  type CrawlerRuntime,
  type ParseContext,
  type ParsedSubjectIndex,
} from "@/lib/crawler/contracts";
import type { ParsedBulletinRow, ParsedSectionDetail, ParsedSubjectPage } from "@/lib/types";
import {
  parseBulletinDepartment,
  parseSectionDetail,
  parseSubjectIndex,
  parseSubjectPage,
} from "@/lib/ingest";
import { parseAcademicCalendar } from "@/lib/ingest/parsers/academic-calendar";
import { isServiceConfigured } from "./client";
import { SupabaseCatalogWriter } from "./catalog-writer";
import { SupabaseCrawlJobStore } from "./crawl-store";
import { SupabaseWatchSource } from "./watch-source";

/**
 * Adapts the parser lane's signatures to the registry's uniform
 * `(html, context)` shape.
 *
 * The mismatch is real rather than cosmetic: `parseSubjectPage` takes the
 * subject and term as arguments because a directory page does not reliably
 * print either, and the crawler knows them from the job that produced the URL.
 * Threading them through `ParseContext` is what lets the crawler stay ignorant
 * of individual parser signatures.
 */
const parsers = {
  parseSubjectPage(html: string, context: ParseContext): ParsedSubjectPage {
    if (!context.termCode) {
      throw new Error(`subject_term job ${context.targetKey} has no term code`);
    }
    return parseSubjectPage(html, context.targetKey.toUpperCase(), context.termCode);
  },

  parseSectionDetail(html: string, context: ParseContext): ParsedSectionDetail {
    // The detail parser returns extra fields the contract does not model. They
    // are carried through untouched — `ingest_section_detail` reads what it
    // knows and ignores the rest, so dropping them here would be pure loss.
    return parseSectionDetail(html, undefined, context.termCode ?? undefined);
  },

  parseBulletinPage(html: string, context: ParseContext): ParsedBulletinRow[] {
    return parseBulletinDepartment(html, {
      termCode: context.termCode ?? undefined,
    });
  },

  parseSubjectIndex(html: string): ParsedSubjectIndex {
    return { subjects: parseSubjectIndex(html) };
  },

  parseAcademicCalendar(html: string, context: ParseContext) {
    return parseAcademicCalendar(html, {
      termCode: context.termCode ?? undefined,
      url: context.url,
    });
  },
};

let bootstrapError: string | null = null;

/**
 * Registers the runtime if it is not already registered. Returns null and
 * remembers why when the environment cannot support one, so a route can answer
 * 503 with a reason instead of throwing a stack trace at a browser worker.
 */
export function ensureCrawlerRuntime(): CrawlerRuntime | null {
  const existing = tryGetCrawlerRuntime();
  if (existing) return existing;

  if (!isServiceConfigured()) {
    bootstrapError =
      "Supabase service role is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY";
    return null;
  }

  try {
    const runtime: CrawlerRuntime = {
      jobStore: new SupabaseCrawlJobStore(),
      writer: new SupabaseCatalogWriter(),
      watches: new SupabaseWatchSource(),
      parsers,
    };
    registerCrawlerRuntime(runtime);
    bootstrapError = null;
    return runtime;
  } catch (cause) {
    bootstrapError = cause instanceof Error ? cause.message : String(cause);
    return null;
  }
}

/** Why the last `ensureCrawlerRuntime()` failed, for the 503 body. */
export function crawlerBootstrapError(): string | null {
  return bootstrapError;
}

// Register eagerly when the environment already allows it, so the very first
// request to a crawl route does not pay the construction cost. Failure here is
// not fatal — `ensureCrawlerRuntime()` retries on demand.
ensureCrawlerRuntime();
