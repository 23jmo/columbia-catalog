-- =============================================================================
-- 0026_reviews_url_not_unique.sql — drop the UNIQUE constraint on reviews_raw.url
--
-- ── The assumption that broke ────────────────────────────────────────────────
--
-- 0004 created `idx_reviews_raw_url` as a UNIQUE index, encoding the assumption
-- that every review has its own permalink. That is true of Reddit, where each
-- comment has a distinct URL, and it was a reasonable thing to believe about
-- CULPA at the time — nobody had seen a CULPA page yet (see the header of
-- `lib/reviews/sources/culpa.ts`, which says so outright).
--
-- It is false. culpa.info is a single-page app whose router exposes exactly two
-- subject routes, `/professor/:id` and `/course/:id`. There is no per-review
-- permalink and no anchor that resolves to one. Every review on a professor's
-- page is attributed back to that page, so a professor with 55 reviews produces
-- 55 rows sharing one URL — and the second row fails with
--
--   duplicate key value violates unique constraint "idx_reviews_raw_url"
--
-- which is what the first live CULPA ingest hit on 2026-08-24: 55 reviews
-- fetched successfully, zero written.
--
-- ── Why dropping it is safe ──────────────────────────────────────────────────
--
-- Uniqueness was never load-bearing here. Idempotent re-ingest is guaranteed by
-- `idx_reviews_raw_source_key` on (source_id, source_review_key) — the source's
-- own identifier for the review — and the writer upserts on the `review_id`
-- primary key. `url` is an ATTRIBUTION field: it answers "where can a reader go
-- to see this in context", and two reviews legitimately sharing that answer is
-- not a data-integrity problem.
--
-- The index itself is kept, non-unique, because looking a review up by its
-- source page is still a real query.
--
-- ── What is NOT being relaxed ────────────────────────────────────────────────
--
-- `url` stays NOT NULL. A stored review must always be linkable back to its
-- source — that is the attribution posture the whole reviews pipeline rests on,
-- and it is the reason `lib/reviews/sources/culpa-api.ts` refuses to emit a
-- record without a page URL.
-- =============================================================================

drop index if exists idx_reviews_raw_url;

create index if not exists idx_reviews_raw_url on reviews_raw (url);

comment on index idx_reviews_raw_url is
  'Non-unique by design: CULPA has no per-review permalink, so many reviews share one subject-page URL. Idempotency lives on (source_id, source_review_key).';
